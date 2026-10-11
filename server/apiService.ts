import crypto from "crypto";
import { z } from "zod";
import { readWorkspace, updateWorkspace, WorkspaceMissing } from "./workspace";
import { appUrl } from "./notify";
import { suggestDocumentNumber } from "../src/lib/documentNumbers";
import { generateShareToken } from "../src/lib/documentLinks";
import { getDocumentHomeValues } from "../src/lib/currencies";
import { todayIn, addDays, daysBetween } from "../src/lib/retainers";
import { computeVatReturn, vatPeriod } from "../src/lib/vatReturn";
import type { ActivityLog, Client, CRMData, CRMDocument, ExpenseRecord } from "../src/types";

// Operations behind the public API (/api/v1) and the MCP server (/mcp). Both call these, so they
// behave the same. Reads return trimmed public shapes, never portal tokens, PINs or attachments.
// Writes are limited to things that don't reach a client: new clients, draft quotes and invoices,
// and expenses. Nothing here sends email or marks anything paid.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function load(uid: string): Promise<CRMData> {
  const ws = await readWorkspace(uid);
  if (!ws) throw new ApiError(404, new WorkspaceMissing().message);
  return ws.data;
}

const homeCurrency = (data: CRMData) => data.userProfile.defaultCurrency || "FJD";
const round2 = (n: number) => Math.round(n * 100) / 100;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;

// ---------- Public shapes ----------

function businessView(b: any) {
  return { id: b.id, name: b.name, currency: b.currency || null, tin: b.tin || null, isPrimary: Boolean(b.isPrimary) };
}

function clientView(c: Client) {
  return {
    id: c.id, name: c.name, contactPerson: c.contactPerson || c.contactName || null, email: c.email || null,
    phone: c.phone || null, address: c.address || null, tin: c.tin || null, currency: c.currency || null
  };
}

function documentView(d: CRMDocument, data: CRMData, today: string) {
  const paid = d.status === "paid" ? d.total : (d.partiallyPaidAmount || 0);
  const balanceDue = d.type === "invoice" && d.status !== "cancelled" && d.status !== "draft" ? Math.max(0, round2(d.total - paid)) : 0;
  const daysOverdue = d.type === "invoice" && balanceDue > 0 && d.dueDate ? daysBetween(d.dueDate.slice(0, 10), today) : 0;
  const shareable = d.status !== "draft" && /^[A-Za-z0-9_-]{16,64}$/.test(d.shareToken || "");
  return {
    id: d.id,
    type: d.type,
    number: d.documentNumber,
    status: d.status,
    clientId: d.clientId,
    clientName: data.clients.find(c => c.id === d.clientId)?.name || null,
    businessId: d.businessId,
    projectId: d.projectId || null,
    issueDate: d.issueDate,
    dueDate: d.dueDate || null,
    currency: d.currency || homeCurrency(data),
    items: d.items.map(it => ({ name: it.name, description: it.description || null, quantity: it.quantity, rate: it.rate, total: it.total })),
    subtotal: d.subtotal,
    vatRate: d.vatRate,
    vatAmount: d.vatAmount,
    total: d.total,
    amountPaid: round2(paid),
    balanceDue,
    overdue: daysOverdue > 0,
    daysOverdue: Math.max(0, daysOverdue),
    notes: d.notes || null,
    onlineUrl: shareable ? appUrl(`/?doc=${encodeURIComponent(d.shareToken!)}`) : null,
    clientReportedPayment: d.clientPaymentReport
      ? { method: d.clientPaymentReport.method, reference: d.clientPaymentReport.reference, status: d.clientPaymentReport.status || "pending" }
      : null
  };
}

function expenseView(e: ExpenseRecord) {
  return {
    id: e.id, date: e.date, vendor: e.vendor, description: e.description || null, amount: e.amount,
    currency: e.currency || null, category: e.category, paymentMethod: e.paymentMethod || null,
    vatAmount: e.vatAmount || 0, vatClaimable: Boolean(e.isVatClaimable), businessId: e.businessId || null,
    projectId: e.projectId || null, notes: e.notes || null
  };
}

function projectView(p: any) {
  return {
    id: p.id, name: p.name, status: p.status, clientId: p.clientId || null, businessId: p.businessId,
    startDate: p.startDate || null, endDate: p.endDate || null, budget: p.cost ?? null, currency: p.currency || null,
    openTasks: (p.tasks || []).filter((t: any) => t.status !== "done").length
  };
}

// ---------- Input schemas (shared by REST validation and MCP tool definitions) ----------

const id = z.string().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const text = (max: number) => z.string().trim().max(max);
const money = z.number().finite().min(0).max(1_000_000_000);
const limit = z.number().int().min(1).max(200).default(50);

export const listDocumentsInput = {
  type: z.enum(["invoice", "quote", "receipt", "credit_note"]).optional().describe("Document type"),
  status: z.enum(["draft", "sent", "partial", "paid", "cancelled", "accepted"]).optional(),
  clientId: id.optional(),
  businessId: id.optional(),
  overdue: z.boolean().optional().describe("Only unpaid invoices past their due date"),
  from: date.optional().describe("Issue date on or after (YYYY-MM-DD)"),
  to: date.optional().describe("Issue date on or before (YYYY-MM-DD)"),
  limit
};

export const listClientsInput = {
  search: text(100).optional().describe("Match name, contact or email"),
  limit
};

export const listExpensesInput = {
  from: date.optional(), to: date.optional(), category: text(100).optional(), businessId: id.optional(), limit
};

export const summaryInput = {
  from: date.optional().describe("Start of period (YYYY-MM-DD). Default: 1 January this year"),
  to: date.optional().describe("End of period (YYYY-MM-DD). Default: today"),
  businessId: id.optional()
};

export const vatReturnInput = {
  period: z.enum(["this_month", "last_month", "this_quarter", "last_quarter", "this_half", "last_half", "this_year", "last_year"]).optional()
    .describe("A standard period. Default: last_month. Ignored when from and to are given"),
  from: date.optional().describe("Start of a custom period (YYYY-MM-DD)"),
  to: date.optional().describe("End of a custom period (YYYY-MM-DD)"),
  basis: z.enum(["invoice", "payments"]).default("invoice").describe("Invoice basis (when invoiced) or payments basis (when paid)"),
  businessId: id.optional().describe("Default: all businesses"),
  includeLines: z.boolean().default(false).describe("Include the invoices, credit notes and expenses behind the figures")
};

export const createClientInput = {
  name: text(160).min(1),
  email: z.string().trim().email().max(254).optional(),
  phone: text(40).optional(),
  address: text(300).optional(),
  tin: text(40).optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  contactPerson: text(120).optional()
};

const item = z.object({
  name: text(200).min(1),
  description: text(1000).optional(),
  quantity: z.number().finite().positive().max(1_000_000),
  rate: money
});

export const createDraftInput = {
  type: z.enum(["invoice", "quote"]),
  clientId: id,
  items: z.array(item).min(1).max(100),
  businessId: id.optional().describe("Defaults to the active business"),
  issueDate: date.optional().describe("Default: today"),
  dueInDays: z.number().int().min(0).max(365).optional().describe("Default: 14"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional().describe("Default: the client's or your currency"),
  vatRate: z.number().min(0).max(50).optional().describe("Percent. Default: your VAT setting"),
  projectId: id.optional(),
  notes: text(2000).optional()
};

export const addExpenseInput = {
  date,
  vendor: text(160).min(1),
  amount: money.describe("Total paid, including any VAT"),
  description: text(500).optional(),
  category: text(100).optional().describe("Default: Other Expense"),
  paymentMethod: text(60).optional(),
  vatClaimable: z.boolean().optional().describe("Whether input VAT can be claimed. Default: false"),
  vatAmount: money.optional().describe("VAT included in the amount. Worked out from your VAT rate if claimable and left out"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  businessId: id.optional(),
  projectId: id.optional(),
  notes: text(1000).optional()
};

export function parse<T extends z.ZodRawShape>(shape: T, input: unknown): z.infer<z.ZodObject<T>> {
  const result = z.object(shape).strict().safeParse(input ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError(400, `${issue.path.join(".") || "input"}: ${issue.message}`);
  }
  return result.data;
}

// ---------- Reads ----------

export async function getAccount(uid: string) {
  const data = await load(uid);
  return {
    name: data.userProfile.name || null,
    email: data.userProfile.email || null,
    homeCurrency: homeCurrency(data),
    vatRate: data.userProfile.enableTax === false ? 0 : (data.userProfile.defaultVatRate ?? 12.5),
    activeBusinessId: data.activeBusinessId || null,
    businesses: data.businesses.map(businessView)
  };
}

export async function listClients(uid: string, input: unknown) {
  const q = parse(listClientsInput, input);
  const data = await load(uid);
  const needle = q.search?.toLowerCase();
  const clients = data.clients
    .filter(c => !needle || [c.name, c.contactPerson, c.contactName, c.email].some(v => (v || "").toLowerCase().includes(needle)))
    .slice(0, q.limit)
    .map(clientView);
  return { clients };
}

export async function getClient(uid: string, clientId: string) {
  const data = await load(uid);
  const client = data.clients.find(c => c.id === clientId);
  if (!client) throw new ApiError(404, "Client not found.");
  const today = todayIn();
  const documents = data.documents.filter(d => d.clientId === clientId).map(d => documentView(d, data, today));
  const outstanding = documents.reduce((sum, d) => sum + d.balanceDue, 0);
  return { client: clientView(client), outstanding: round2(outstanding), documents: documents.slice(0, 50) };
}

export async function listDocuments(uid: string, input: unknown) {
  const q = parse(listDocumentsInput, input);
  const data = await load(uid);
  const today = todayIn();
  const documents = data.documents
    .filter(d => !q.type || d.type === q.type)
    .filter(d => !q.status || d.status === q.status)
    .filter(d => !q.clientId || d.clientId === q.clientId)
    .filter(d => !q.businessId || d.businessId === q.businessId)
    .filter(d => !q.from || (d.issueDate || "") >= q.from)
    .filter(d => !q.to || (d.issueDate || "") <= q.to)
    .map(d => documentView(d, data, today))
    .filter(d => !q.overdue || d.overdue)
    .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));
  return { total: documents.length, documents: documents.slice(0, q.limit) };
}

export async function getDocument(uid: string, documentId: string) {
  const data = await load(uid);
  const doc = data.documents.find(d => d.id === documentId || d.documentNumber === documentId);
  if (!doc) throw new ApiError(404, "Document not found.");
  return { document: documentView(doc, data, todayIn()) };
}

export async function listExpenses(uid: string, input: unknown) {
  const q = parse(listExpensesInput, input);
  const data = await load(uid);
  const expenses = (data.expenses || [])
    .filter(e => !q.from || e.date >= q.from)
    .filter(e => !q.to || e.date <= q.to)
    .filter(e => !q.category || e.category === q.category)
    .filter(e => !q.businessId || e.businessId === q.businessId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(expenseView);
  return { total: expenses.length, expenses: expenses.slice(0, q.limit) };
}

export async function listProjects(uid: string) {
  const data = await load(uid);
  return { projects: (data.projects || []).map(projectView) };
}

/**
 * Cash-basis summary for a period, in the home currency: payments received, expenses, profit,
 * and VAT collected on paid invoices against VAT claimable on expenses. Outstanding is as of today.
 */
export async function getSummary(uid: string, input: unknown) {
  const q = parse(summaryInput, input);
  const data = await load(uid);
  const today = todayIn();
  const from = q.from || `${today.slice(0, 4)}-01-01`;
  const to = q.to || today;
  const home = homeCurrency(data);
  const inBusiness = (bid?: string) => !q.businessId || bid === q.businessId;
  const rates = (bid?: string) => data.businesses.find(b => b.id === bid)?.customExchangeRates;

  let received = 0, outputVat = 0, invoiced = 0, outstanding = 0, overdue = 0, paidCount = 0;
  for (const d of data.documents) {
    if (d.type !== "invoice" || !inBusiness(d.businessId) || d.status === "draft" || d.status === "cancelled") continue;
    const conv = getDocumentHomeValues(d, home, rates(d.businessId), data.transactions);
    if ((d.issueDate || "") >= from && (d.issueDate || "") <= to) invoiced += conv.homeTotal;
    if (d.status === "paid") {
      const paidOn = (d.paymentDate || d.issueDate || "").slice(0, 10);
      if (paidOn >= from && paidOn <= to) {
        received += conv.homeTotal;
        outputVat += conv.vatHome;
        paidCount++;
      }
    } else {
      const ratio = d.total > 0 ? conv.homeTotal / d.total : 1;
      const balance = Math.max(0, d.total - (d.partiallyPaidAmount || 0)) * ratio;
      outstanding += balance;
      if (d.dueDate && d.dueDate.slice(0, 10) < today) overdue += balance;
    }
  }

  let expenses = 0, inputVat = 0;
  for (const e of data.expenses || []) {
    if (!inBusiness(e.businessId) || e.date < from || e.date > to) continue;
    expenses += e.amount || 0;
    if (e.isVatClaimable) inputVat += e.vatAmount || 0;
  }

  return {
    period: { from, to },
    currency: home,
    basis: "cash: invoices count when paid; amounts include VAT",
    invoiced: round2(invoiced),
    received: round2(received),
    paidInvoices: paidCount,
    expenses: round2(expenses),
    profit: round2(received - expenses),
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    vat: { collected: round2(outputVat), claimable: round2(inputVat), net: round2(outputVat - inputVat) }
  };
}

/** VAT return figures for a period (same calculation as Bookkeeping → VAT return). */
export async function getVatReturn(uid: string, input: unknown) {
  const q = parse(vatReturnInput, input);
  if ((q.from && !q.to) || (!q.from && q.to)) throw new ApiError(400, "Give both from and to, or a period.");
  const range = q.from && q.to ? { from: q.from, to: q.to } : vatPeriod(q.period || "last_month", todayIn());
  if (range.from > range.to) throw new ApiError(400, "from must be on or before to.");
  const data = await load(uid);
  if (q.businessId && !data.businesses.some(b => b.id === q.businessId)) throw new ApiError(404, "Business not found.");
  const { lines, ...vat } = computeVatReturn(data, { ...range, basis: q.basis, businessId: q.businessId || null });
  return {
    ...vat,
    note: "Prepared from the records in Frilensa. Check the figures before filing with FRCS; Frilensa doesn't file returns.",
    ...(q.includeLines ? { lines: lines.slice(0, 500), lineCount: lines.length } : { lineCount: lines.length })
  };
}

// ---------- Writes (drafts and records only) ----------

function activity(type: ActivityLog["type"], title: string, description: string, keyName: string, extra: Partial<ActivityLog> = {}): ActivityLog {
  return { id: newId("log"), type, title, description: `${description} (via API key "${keyName}")`, timestamp: new Date().toISOString(), ...extra };
}

export async function createClient(uid: string, keyName: string, input: unknown) {
  const q = parse(createClientInput, input);
  return updateWorkspace(uid, (raw, data) => {
    if (q.email && data.clients.some(c => (c.email || "").trim().toLowerCase() === q.email!.toLowerCase())) {
      throw new ApiError(409, "A client with this email already exists.");
    }
    const client: Client = {
      id: newId("client"), name: q.name, email: q.email || "", phone: q.phone || "", address: q.address || "",
      tin: q.tin, currency: q.currency, contactPerson: q.contactPerson
    };
    (client as any).updatedAt = new Date().toISOString();
    return {
      set: {
        clients: [...(raw.clients || []), client],
        activityLogs: [activity("client_created", "Client added", `Added ${client.name}`, keyName, { entityType: "client", entityId: client.id, clientName: client.name }), ...(raw.activityLogs || [])].slice(0, 500)
      },
      result: { client: clientView(client) }
    };
  });
}

export async function createDraftDocument(uid: string, keyName: string, input: unknown) {
  const q = parse(createDraftInput, input);
  return updateWorkspace(uid, (raw, data) => {
    const client = data.clients.find(c => c.id === q.clientId);
    if (!client) throw new ApiError(404, "Client not found. Create the client first or check the id.");
    const business = data.businesses.find(b => b.id === (q.businessId || data.activeBusinessId)) || data.businesses[0];
    if (!business) throw new ApiError(400, "Add a business in Frilensa first.");
    if (q.projectId && !(data.projects || []).some(p => p.id === q.projectId)) throw new ApiError(404, "Project not found.");

    const issueDate = q.issueDate || todayIn();
    const items = q.items.map((it, i) => ({
      id: `item-${i}-${crypto.randomBytes(3).toString("hex")}`,
      name: it.name, description: it.description, quantity: it.quantity, rate: it.rate, total: round2(it.quantity * it.rate)
    }));
    const subtotal = round2(items.reduce((sum, it) => sum + it.total, 0));
    const vatRate = q.vatRate ?? (data.userProfile.enableTax === false ? 0 : (data.userProfile.defaultVatRate ?? 12.5));
    const vatAmount = round2(subtotal * vatRate / 100);
    const now = new Date().toISOString();
    const doc: CRMDocument = {
      id: newId("doc"),
      type: q.type,
      documentNumber: suggestDocumentNumber(data, q.type, business.id) || `${q.type === "quote" ? "QT" : "INV"}-DRAFT-${Date.now().toString(36).toUpperCase()}`,
      businessId: business.id,
      clientId: client.id,
      projectId: q.projectId,
      currency: q.currency || client.currency || business.currency || homeCurrency(data),
      issueDate,
      dueDate: addDays(issueDate, q.dueInDays ?? 14),
      items,
      subtotal,
      vatRate,
      vatAmount,
      total: round2(subtotal + vatAmount),
      status: "draft",
      notes: q.notes,
      shareToken: generateShareToken(),
      updatedAt: now
    };
    const label = q.type === "quote" ? "Quote" : "Invoice";
    return {
      set: {
        documents: [doc, ...(raw.documents || [])],
        activityLogs: [activity(q.type === "quote" ? "quote_created" : "invoice_created", `Draft ${label.toLowerCase()} created`,
          `Draft ${label.toLowerCase()} ${doc.documentNumber} for ${client.name}`, keyName,
          { entityType: q.type, entityId: doc.id, amount: doc.total, currency: doc.currency, clientName: client.name }), ...(raw.activityLogs || [])].slice(0, 500)
      },
      newDocuments: [doc],
      result: { document: documentView(doc, data, todayIn()), note: "Saved as a draft. Review and send it from Frilensa." }
    };
  });
}

export async function addExpense(uid: string, keyName: string, input: unknown) {
  const q = parse(addExpenseInput, input);
  return updateWorkspace(uid, (raw, data) => {
    if (q.businessId && !data.businesses.some(b => b.id === q.businessId)) throw new ApiError(404, "Business not found.");
    if (q.projectId && !(data.projects || []).some(p => p.id === q.projectId)) throw new ApiError(404, "Project not found.");
    const vatRate = data.userProfile.enableTax === false ? 0 : (data.userProfile.defaultVatRate ?? 12.5);
    const vatAmount = q.vatAmount ?? (q.vatClaimable ? round2(q.amount * vatRate / (100 + vatRate)) : 0);
    if (vatAmount > q.amount) throw new ApiError(400, "vatAmount can't be more than the amount.");
    const expense: ExpenseRecord = {
      id: newId("exp"), date: q.date, vendor: q.vendor, description: q.description || q.vendor, amount: round2(q.amount),
      category: q.category || "Other Expense", paymentMethod: q.paymentMethod || "Bank Transfer", vatAmount,
      isVatClaimable: Boolean(q.vatClaimable), currency: q.currency || homeCurrency(data),
      businessId: q.businessId || data.activeBusinessId || undefined, projectId: q.projectId, notes: q.notes,
      createdAt: new Date().toISOString()
    };
    (expense as any).updatedAt = expense.createdAt;
    return {
      set: {
        expenses: [expense, ...(raw.expenses || [])],
        activityLogs: [activity("expense_logged", "Expense added", `${expense.vendor}: ${expense.currency} ${expense.amount.toFixed(2)}`, keyName,
          { entityType: "expense", entityId: expense.id, amount: expense.amount, currency: expense.currency }), ...(raw.activityLogs || [])].slice(0, 500)
      },
      result: { expense: expenseView(expense) }
    };
  });
}
