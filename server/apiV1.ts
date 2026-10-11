import express, { type NextFunction, type Response } from "express";
import { rateLimit } from "./security";
import { requireApiKey, apiRateLimit, type ApiRequest } from "./apiKeys";
import { WorkspaceMissing } from "./workspace";
import * as api from "./apiService";

// Public REST API, authenticated with a personal API key. See docs/API.md.

type Handler = (req: ApiRequest) => Promise<unknown>;

/** Runs a handler and maps errors to JSON responses. */
export function handle(fn: Handler) {
  return async (req: ApiRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await fn(req));
    } catch (err: any) {
      if (err instanceof api.ApiError) return res.status(err.status).json({ error: err.message });
      if (err instanceof WorkspaceMissing) return res.status(404).json({ error: err.message });
      next(err);
    }
  };
}

/** Query-string values arrive as strings; convert the ones the schemas expect as numbers/booleans. */
function query(req: ApiRequest) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v !== "string") continue;
    out[k] = k === "limit" ? Number(v) : k === "overdue" ? v === "true" : v;
  }
  return out;
}

export const ipLimit = rateLimit({ name: "api-ip", max: 300, windowMs: 60_000, key: r => r.ip || "anon" });

export function createApiV1Router() {
  const router = express.Router();
  const read = [ipLimit, requireApiKey("read"), apiRateLimit];
  const draft = [ipLimit, requireApiKey("draft"), apiRateLimit];
  const uid = (req: ApiRequest) => req.apiKey!.uid;

  router.get("/me", ...read, handle(req => api.getAccount(uid(req))));
  router.get("/clients", ...read, handle(req => api.listClients(uid(req), query(req))));
  router.get("/clients/:id", ...read, handle(req => api.getClient(uid(req), String(req.params.id))));
  router.post("/clients", ...draft, handle(req => api.createClient(uid(req), req.apiKey!.name, req.body)));
  router.get("/documents", ...read, handle(req => api.listDocuments(uid(req), query(req))));
  router.get("/documents/:id", ...read, handle(req => api.getDocument(uid(req), String(req.params.id))));
  router.post("/documents", ...draft, handle(req => api.createDraftDocument(uid(req), req.apiKey!.name, req.body)));
  router.get("/expenses", ...read, handle(req => api.listExpenses(uid(req), query(req))));
  router.post("/expenses", ...draft, handle(req => api.addExpense(uid(req), req.apiKey!.name, req.body)));
  router.get("/projects", ...read, handle(req => api.listProjects(uid(req))));
  router.get("/summary", ...read, handle(req => api.getSummary(uid(req), query(req))));

  return router;
}
