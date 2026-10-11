import express, { type Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import pkg from "../package.json";
import { requireApiKey, apiRateLimit, type ApiRequest } from "./apiKeys";
import { ipLimit } from "./apiV1";
import { WorkspaceMissing } from "./workspace";
import * as api from "./apiService";

// MCP server (Streamable HTTP, stateless) so AI assistants such as Claude can work with a
// Frilensa workspace. Authenticated with the same personal API keys as the REST API; tools that
// change data are only offered to keys with draft access, and none of them send anything to clients.

const INSTRUCTIONS = `Frilensa is invoicing and bookkeeping for freelancers and small businesses in Fiji.
Amounts are in the document's currency unless a tool says otherwise; the home currency is usually FJD and
Fiji VAT is usually 12.5%. Look up ids with list_clients / list_documents before using them.
Tools here can read data and create drafts (clients, draft quotes and invoices, expenses). They can't send
anything to clients or record payments: tell the user to review and send drafts in Frilensa.`;

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

async function run(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err: any) {
    const message = err instanceof api.ApiError || err instanceof WorkspaceMissing ? err.message : "Something went wrong. Try again.";
    if (!(err instanceof api.ApiError || err instanceof WorkspaceMissing)) console.error("[mcp] Tool failed:", err?.message || err);
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}

function buildServer(key: NonNullable<ApiRequest["apiKey"]>) {
  const server = new McpServer({ name: "frilensa", version: pkg.version }, { instructions: INSTRUCTIONS });
  const uid = key.uid;
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool("get_account", {
    title: "Account and businesses",
    description: "Your name, home currency, VAT rate and the businesses (ventures) in this workspace.",
    inputSchema: {}, annotations: readOnly
  }, () => run(() => api.getAccount(uid)));

  server.registerTool("list_clients", {
    title: "List clients",
    description: "Clients in the workspace, optionally filtered by a search term (name, contact or email).",
    inputSchema: api.listClientsInput, annotations: readOnly
  }, args => run(() => api.listClients(uid, args)));

  server.registerTool("get_client", {
    title: "Client details",
    description: "One client with their quotes, invoices and receipts and the amount they owe.",
    inputSchema: { clientId: z.string().min(1) }, annotations: readOnly
  }, ({ clientId }) => run(() => api.getClient(uid, clientId)));

  server.registerTool("list_documents", {
    title: "List quotes and invoices",
    description: "Quotes, invoices, receipts and credit notes, newest first. Filter by type, status, client, business, issue date, or overdue: true for unpaid invoices past their due date.",
    inputSchema: api.listDocumentsInput, annotations: readOnly
  }, args => run(() => api.listDocuments(uid, args)));

  server.registerTool("get_document", {
    title: "Document details",
    description: "One quote, invoice, receipt or credit note by id or number (e.g. INV-2026-1004), with line items, balance due and its online link.",
    inputSchema: { documentId: z.string().min(1).describe("Document id or number") }, annotations: readOnly
  }, ({ documentId }) => run(() => api.getDocument(uid, documentId)));

  server.registerTool("list_expenses", {
    title: "List expenses",
    description: "Expenses, newest first, optionally filtered by date range, category or business.",
    inputSchema: api.listExpensesInput, annotations: readOnly
  }, args => run(() => api.listExpenses(uid, args)));

  server.registerTool("list_projects", {
    title: "List projects",
    description: "Projects with status, client, dates, budget and number of open tasks.",
    inputSchema: {}, annotations: readOnly
  }, () => run(() => api.listProjects(uid)));

  server.registerTool("get_summary", {
    title: "Profit and VAT summary",
    description: "Cash-basis summary for a period in the home currency: money received, expenses, profit, outstanding and overdue amounts, and VAT collected vs claimable. Defaults to this year to date.",
    inputSchema: api.summaryInput, annotations: readOnly
  }, args => run(() => api.getSummary(uid, args)));

  if (key.scopes.includes("draft")) {
    const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

    server.registerTool("create_client", {
      title: "Add a client",
      description: "Adds a client to the workspace. Refuses if a client with the same email exists.",
      inputSchema: api.createClientInput, annotations: write
    }, args => run(() => api.createClient(uid, key.name, args)));

    server.registerTool("create_draft_document", {
      title: "Create a draft quote or invoice",
      description: "Creates a DRAFT quote or invoice for an existing client, numbered in the business's series, with VAT worked out from your VAT setting unless vatRate is given. Drafts aren't visible to the client until the user sends them from Frilensa.",
      inputSchema: api.createDraftInput, annotations: write
    }, args => run(() => api.createDraftDocument(uid, key.name, args)));

    server.registerTool("add_expense", {
      title: "Add an expense",
      description: "Records a business expense. amount is the total paid including VAT; set vatClaimable for expenses with a valid VAT tax invoice.",
      inputSchema: api.addExpenseInput, annotations: write
    }, args => run(() => api.addExpense(uid, key.name, args)));
  }

  return server;
}

export function createMcpRouter() {
  const router = express.Router();

  router.post("/", ipLimit, requireApiKey("read"), apiRateLimit, async (req: ApiRequest, res: Response) => {
    const server = buildServer(req.apiKey!);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error("[mcp] Request failed:", err?.message || err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });

  // Stateless server: no server-initiated streams or sessions to end.
  router.all("/", (_req, res) => {
    res.set("Allow", "POST").status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null });
  });

  return router;
}
