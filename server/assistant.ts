import express, { type NextFunction, type Response } from "express";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { rateLimit, type AuthedRequest } from "./security";
import { readWorkspace, WorkspaceMissing } from "./workspace";
import * as api from "./apiService";
import * as bookings from "./bookings";
import { HELP_ARTICLES, helpAsText } from "../src/help/articles";
import { todayIn } from "../src/lib/retainers";

// The in-app assistant (Assistant tab and the advisor in Bookkeeping), powered by Claude.
// It answers with the help articles and the user's own data, looked up through the same
// read operations as the public API. It can't change anything itself: "propose_*" tools only
// validate a suggestion and return it to the browser, where the user presses Confirm, which
// calls /confirm and runs the matching apiService write. Nothing here emails clients or
// records payments.

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MEMORY_MODEL = () => process.env.ANTHROPIC_MEMORY_MODEL || "claude-haiku-5-5";
const MAX_TOOL_ROUNDS = 8;
const MAX_RESULT_CHARS = 20_000;

export const assistantConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
let client: Anthropic | null = null;
const anthropic = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

type Shape = z.ZodRawShape;
const schema = (shape: Shape) => {
  const { $schema, ...rest } = zodToJsonSchema(z.object(shape).strict(), { target: "jsonSchema7" }) as any;
  return rest;
};

interface ReadTool { name: string; description: string; shape: Shape; run: (uid: string, input: any) => Promise<unknown> }

const READ_TOOLS: ReadTool[] = [
  { name: "get_account", description: "The user's name, home currency, VAT rate and businesses (with ids).", shape: {}, run: uid => api.getAccount(uid) },
  { name: "list_clients", description: "Clients, optionally filtered by a search on name, contact or email.", shape: api.listClientsInput, run: (uid, i) => api.listClients(uid, i) },
  { name: "get_client", description: "One client with their documents and the amount they owe.", shape: { clientId: z.string().min(1).max(200) }, run: (uid, i) => api.getClient(uid, i.clientId) },
  { name: "list_documents", description: "Quotes, invoices, receipts and credit notes, newest first. Filter by type, status, clientId, businessId, issue date range, or overdue.", shape: api.listDocumentsInput, run: (uid, i) => api.listDocuments(uid, i) },
  { name: "get_document", description: "One document by id or number (e.g. INV-2026-1004), with lines, balance due and online link.", shape: { id: z.string().min(1).max(200) }, run: (uid, i) => api.getDocument(uid, i.id) },
  { name: "list_expenses", description: "Expenses, newest first. Filter by date range, category or business; unbilledForClientId finds expenses waiting to be billed to that client.", shape: api.listExpensesInput, run: (uid, i) => api.listExpenses(uid, i) },
  { name: "list_projects", description: "Projects with ids, status, client, dates, budget and number of open tasks.", shape: {}, run: uid => api.listProjects(uid) },
  { name: "list_tasks", description: "Project tasks, soonest due first. Filter by projectId, status ('open' = not done) or dueBefore.", shape: api.listTasksInput, run: (uid, i) => api.listTasks(uid, i) },
  { name: "list_booking_requests", description: "Booking requests from every channel, most recently changed first, with their stage (new, quoted, invoiced, paid…), the customer's answers, event date and location.", shape: bookings.listBookingsInput, run: (uid, i) => bookings.listBookingRequests(uid, i) },
  { name: "get_summary", description: "Cash-basis summary for a period in the home currency: received, expenses, profit, outstanding, overdue, VAT collected vs claimable. Defaults to this year to date.", shape: api.summaryInput, run: (uid, i) => api.getSummary(uid, i) },
  { name: "get_vat_return", description: "VAT return figures for a period (default last month), invoice or payments basis, with warnings.", shape: api.vatReturnInput, run: (uid, i) => api.getVatReturn(uid, i) }
];

type Kind = "task" | "client" | "draft_document" | "expense";
interface ProposeTool { name: string; kind: Kind; description: string; shape: Shape }

const PROPOSE_TOOLS: ProposeTool[] = [
  { name: "propose_task", kind: "task", shape: api.createTaskInput,
    description: "Suggest adding a task to a project. Shown to the user with a Confirm button; nothing is saved unless they confirm. Look up projectId with list_projects first." },
  { name: "propose_client", kind: "client", shape: api.createClientInput,
    description: "Suggest adding a client. Shown to the user with a Confirm button; nothing is saved unless they confirm. Check list_clients first so you don't duplicate one." },
  { name: "propose_draft_document", kind: "draft_document", shape: api.createDraftInput,
    description: "Suggest a DRAFT quote or invoice for an existing client (look up clientId first). Shown with a Confirm button; once confirmed it's saved as a draft for the user to review and send from Billing. Invoices can include reimbursable expenses (expenseIds)." },
  { name: "propose_expense", kind: "expense", shape: api.addExpenseInput,
    description: "Suggest recording an expense (e.g. from a receipt the user attached). amount is the total paid including VAT. Shown with a Confirm button; nothing is saved unless they confirm." }
];

export interface Proposal { id: string; kind: Kind; title: string; details: string[]; input: unknown }

const money = (currency: string, n: number) => `${currency} $${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Validates a proposal against the workspace and describes it for the confirmation card. */
function describeProposal(kind: Kind, input: unknown, data: any): { title: string; details: string[]; input: unknown } {
  const home = data.userProfile?.defaultCurrency || "FJD";
  if (kind === "task") {
    const q = api.parse(api.createTaskInput, input);
    const project = (data.projects || []).find((p: any) => p.id === q.projectId);
    if (!project) throw new api.ApiError(404, "Project not found. Use list_projects for the id.");
    return { title: `Add task: ${q.title}`, input: q, details: [`Project: ${project.name}`, q.dueDate && `Due ${q.dueDate}`, q.priority && `Priority: ${q.priority}`, q.description].filter(Boolean) as string[] };
  }
  if (kind === "client") {
    const q = api.parse(api.createClientInput, input);
    if (q.email && data.clients.some((c: any) => (c.email || "").trim().toLowerCase() === q.email!.toLowerCase())) throw new api.ApiError(409, "A client with this email already exists.");
    return { title: `Add client: ${q.name}`, input: q, details: [q.contactPerson, q.email, q.phone, q.address, q.tin && `TIN ${q.tin}`].filter(Boolean) as string[] };
  }
  if (kind === "draft_document") {
    const q = api.parse(api.createDraftInput, input);
    const client = data.clients.find((c: any) => c.id === q.clientId);
    if (!client) throw new api.ApiError(404, "Client not found. Use list_clients for the id.");
    if (q.businessId && !data.businesses.some((b: any) => b.id === q.businessId)) throw new api.ApiError(404, "Business not found.");
    for (const eid of q.expenseIds || []) {
      const e = (data.expenses || []).find((x: any) => x.id === eid);
      if (!e) throw new api.ApiError(404, `Expense ${eid} not found.`);
      if (e.billToClientId !== client.id || e.billedDocumentId) throw new api.ApiError(409, `Expense ${eid} can't be billed to this client.`);
    }
    if (q.type === "quote" && q.expenseIds?.length) throw new api.ApiError(400, "Expenses can only go on invoices.");
    if (q.items.length === 0 && !q.expenseIds?.length) throw new api.ApiError(400, "Add at least one item or expense.");
    const currency = q.currency || client.currency || home;
    const subtotal = q.items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const details = [
      ...q.items.map(it => `${it.quantity} × ${it.name} at ${money(currency, it.rate)}`),
      q.expenseIds?.length ? `${q.expenseIds.length} reimbursable expense${q.expenseIds.length === 1 ? "" : "s"}` : "",
      q.items.length ? `Items subtotal ${money(currency, subtotal)} before VAT` : ""
    ].filter(Boolean);
    return { title: `Draft ${q.type} for ${client.name}`, input: q, details };
  }
  const q = api.parse(api.addExpenseInput, input);
  const bill = q.billToClientId && data.clients.find((c: any) => c.id === q.billToClientId);
  if (q.billToClientId && !bill) throw new api.ApiError(404, "Client not found.");
  if (q.projectId && !(data.projects || []).some((p: any) => p.id === q.projectId)) throw new api.ApiError(404, "Project not found.");
  return {
    title: `Add expense: ${q.vendor} ${money(q.currency || home, q.amount)}`, input: q,
    details: [q.date, q.description, q.category, q.vatClaimable && "VAT claimable", bill && `Bill to ${bill.name}`].filter(Boolean) as string[]
  };
}

async function confirmProposal(uid: string, kind: Kind, input: unknown) {
  const via = api.ASSISTANT_SOURCE;
  if (kind === "task") return api.createTask(uid, via, input);
  if (kind === "client") return api.createClient(uid, via, input);
  if (kind === "draft_document") return api.createDraftDocument(uid, via, input);
  if (kind === "expense") return api.addExpense(uid, via, input);
  throw new api.ApiError(400, "Unknown kind.");
}

function systemPrompt(data: any, memories: string[]) {
  const business = data.businesses.find((b: any) => b.id === data.activeBusinessId) || data.businesses[0];
  const vat = data.userProfile?.enableTax === false ? "not charging VAT" : `VAT ${data.userProfile?.defaultVatRate ?? 12.5}%`;
  const fixed = `You are the assistant inside Frilensa (frilensa.com), invoicing and bookkeeping software for freelancers and small businesses in Fiji and the Pacific.

What you do:
- Answer questions about using Frilensa from the help articles below. If the articles don't cover something, say you're not sure rather than guessing where a button is.
- Answer questions about the user's business by looking up their data with the tools. Use real figures; never invent numbers, clients or documents.
- Give general guidance on pricing, invoicing, bookkeeping and Fiji tax (FRCS). It is not formal tax or legal advice: when a rule matters, say so and suggest confirming with FRCS or an accountant.
- When the user asks you to create something (a task, client, draft quote or invoice, or expense), or clearly would benefit from one, use a propose_* tool. The user sees a card and presses Confirm; until then nothing is saved. Say briefly what you proposed and that they need to confirm it. Never claim something was created.

What you can't do: send anything to clients, email, record or confirm payments, edit or delete existing records, or change settings. Tell the user where in Frilensa to do those things.

Style: plain, friendly and direct. Short answers, concrete steps, bullet points for lists, Markdown tables for figures. No hype, no filler, no emoji. Amounts are in the document's currency unless stated. Dates are YYYY-MM-DD.

# Help articles

${helpAsText()}`;
  const context = `Today is ${todayIn()} (Fiji). User: ${data.userProfile?.name || "unknown"}. Active business: ${business?.name || "none"} (id ${business?.id || "-"}). Home currency ${data.userProfile?.defaultCurrency || "FJD"}, ${vat}.` +
    (memories.length ? `\n\nThings the user told you in earlier chats (use them; don't ask again):\n${memories.slice(0, 50).map(m => `- ${m}`).join("\n")}` : "");
  return [
    { type: "text" as const, text: fixed, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: context }
  ];
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Turns a data-URL attachment into a Claude content block, or a note if the type isn't supported. */
function attachmentBlock(att: any): any {
  const m = typeof att?.dataUrl === "string" ? att.dataUrl.match(/^data:([^;,]+);base64,(.+)$/) : null;
  const name = String(att?.name || "file").slice(0, 120);
  if (!m) return { type: "text", text: `[Attachment ${name} couldn't be read.]` };
  const [, type, b64] = m;
  if (IMAGE_TYPES.includes(type)) return { type: "image", source: { type: "base64", media_type: type, data: b64 } };
  if (type === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, title: name };
  if (type.startsWith("text/") || type === "application/json") {
    return { type: "text", text: `Attachment ${name}:\n${Buffer.from(b64, "base64").toString("utf8").slice(0, 100_000)}` };
  }
  return { type: "text", text: `[Attachment ${name} (${type}) isn't a supported type. Ask for a photo (JPG or PNG), PDF or CSV.]` };
}

/** Chat history as alternating user/assistant turns (text only; only the latest message carries files). */
function buildMessages(history: any[], message: string, attachments: any[]) {
  const turns: { role: "user" | "assistant"; content: any[] }[] = [];
  const push = (role: "user" | "assistant", content: any[]) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content.push(...content);
    else turns.push({ role, content });
  };
  for (const h of (Array.isArray(history) ? history : []).slice(-30)) {
    const text = String(h?.text || "").slice(0, 20_000).trim();
    if (!text) continue;
    push(h.sender === "user" ? "user" : "assistant", [{ type: "text", text }]);
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();
  const files = (Array.isArray(attachments) ? attachments : []).slice(0, 5).map(attachmentBlock);
  const text = String(message || "").slice(0, 20_000).trim() || (files.length ? "Please look at the attached file." : "Hello");
  push("user", [...files, { type: "text", text }]);
  return turns;
}

function toolResult(value: unknown) {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated; narrow the filters)` : text;
}

export async function runAssistant(uid: string, body: any) {
  const ws = await readWorkspace(uid);
  if (!ws) throw new api.ApiError(404, "Your workspace isn't set up yet.");
  const memories = (Array.isArray(body?.memories) ? body.memories : []).map((m: any) => String(typeof m === "string" ? m : m?.fact || "")).filter(Boolean);
  const messages: any[] = buildMessages(body?.history, body?.message, body?.attachments);
  const tools: any[] = [
    ...READ_TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: schema(t.shape) })),
    ...PROPOSE_TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: schema(t.shape) }))
  ];
  const system = systemPrompt(ws.data, memories);
  const proposals: Proposal[] = [];
  const looked: string[] = [];
  let reply = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await anthropic().messages.create({
      model: MODEL(), max_tokens: 2000, system, messages,
      tools, ...(round === MAX_TOOL_ROUNDS ? { tool_choice: { type: "none" } } : {})
    } as any);
    const text = res.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    const uses = res.content.filter((c: any) => c.type === "tool_use") as any[];
    if (res.stop_reason !== "tool_use" || uses.length === 0) { reply = text; break; }
    messages.push({ role: "assistant", content: res.content });
    const results: any[] = [];
    // Fresh data for validating proposals made after earlier look-ups in this turn.
    const data = (await readWorkspace(uid))?.data || ws.data;
    for (const use of uses) {
      try {
        const read = READ_TOOLS.find(t => t.name === use.name);
        const propose = PROPOSE_TOOLS.find(t => t.name === use.name);
        if (read) {
          looked.push(use.name);
          results.push({ type: "tool_result", tool_use_id: use.id, content: toolResult(await read.run(uid, use.input || {})) });
        } else if (propose) {
          const p = describeProposal(propose.kind, use.input, data);
          const proposal: Proposal = { id: `prop-${crypto.randomBytes(5).toString("hex")}`, kind: propose.kind, ...p };
          proposals.push(proposal);
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Shown to the user as "${p.title}" with a Confirm button. Not saved yet.` });
        } else {
          results.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool.", is_error: true });
        }
      } catch (err: any) {
        results.push({ type: "tool_result", tool_use_id: use.id, content: err instanceof api.ApiError ? err.message : "That look-up failed.", is_error: true });
        if (!(err instanceof api.ApiError)) console.warn("[assistant] tool failed:", use.name, err?.message || err);
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: reply || "I couldn't come up with an answer just now. Please try again.", proposals, lookedUp: [...new Set(looked)] };
}

/** Picks up to 2 lasting facts from an exchange for the assistant's memory. Never throws. */
async function extractMemories(message: string, reply: string): Promise<string[]> {
  if (!message || message.length < 25) return [];
  try {
    const res = await anthropic().messages.create({
      model: MEMORY_MODEL(), max_tokens: 300,
      messages: [{ role: "user", content: `From this exchange, pick up to 2 lasting facts about the user's business or preferences worth remembering for future chats (e.g. "Prefers M-PAiSA for payments under $300"). Ignore questions, one-off figures and anything the assistant said that the user didn't confirm. Reply with only a JSON array of short strings, or [] if there are none.

User: ${message.slice(0, 1000)}
Assistant: ${reply.slice(0, 1000)}` }]
    });
    const text = res.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    const parsed = JSON.parse((text.match(/\[[\s\S]*\]/) || ["[]"])[0]);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === "string" && s.length > 10 && s.length < 200).slice(0, 2) : [];
  } catch {
    return [];
  }
}

/** /api/ai/assistant routes. Mounted after requireUser and the AI rate limit. */
export function createAssistantRouter() {
  const router = express.Router();

  // Each question can take several Claude calls (look-ups), so cap questions per user per hour.
  router.post("/", rateLimit({ name: "assistant", max: 60, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res, next) => {
    try {
      if (!assistantConfigured()) {
        return res.status(503).json({ error: "The assistant isn't set up on this server yet.", unavailable: true });
      }
      const result = await runAssistant(req.user!.uid, req.body);
      const newMemories = req.body?.skipMemory ? [] : await extractMemories(String(req.body?.message || ""), result.reply);
      res.json({ ...result, newMemories });
    } catch (err) {
      next(err);
    }
  });

  router.post("/confirm", async (req: AuthedRequest, res, next) => {
    try {
      const kind = req.body?.kind as Kind;
      if (!PROPOSE_TOOLS.some(t => t.kind === kind)) return res.status(400).json({ error: "Unknown kind." });
      res.json(await confirmProposal(req.user!.uid, kind, req.body?.input));
    } catch (err) {
      next(err);
    }
  });

  router.get("/status", (_req, res) => res.json({ configured: assistantConfigured(), helpArticles: HELP_ARTICLES.length }));

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    if (err instanceof api.ApiError) return res.status(err.status).json({ error: err.message });
    if (err instanceof WorkspaceMissing) return res.status(404).json({ error: err.message });
    const status = err?.status === 429 || err?.status === 529 ? 503 : 500;
    console.error("[assistant] Request failed:", err?.message || err);
    res.status(status).json({ error: status === 503 ? "The assistant is busy right now. Please try again in a minute." : "The assistant isn't responding. Please try again." });
  });

  return router;
}
