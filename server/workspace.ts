import { FieldValue, type Transaction, type DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "./security";
import { normalizeWorkspace } from "../src/lib/normalizeWorkspace";
import { buildFlatDocumentRow, flatDocumentId, sanitizeForFirestore } from "../src/lib/flatDocuments";
import { SPLIT_LISTS, ORDER_FIELD, isSplitList, assembleWorkspace, planListWrite, stableJson, type SplitList } from "../src/lib/workspaceRecords";
import type { CRMData, CRMDocument } from "../src/types";

// Server-side access to a consultant's workspace, shared by the daily job, the public API, the
// MCP server, the portal, bookings and Pay now. A workspace is a head document (consultants/{uid})
// plus one record per item in subcollections (see src/lib/workspaceRecords.ts). Writes go through
// a transaction and keep the flat 'documents' copies (client portal and "view online" links) in step.

/** A workspace as stored, with missing lists defaulted and documents repaired. */
export function toData(raw: any): CRMData {
  return normalizeWorkspace({
    ...raw,
    userProfile: raw.userProfile || {},
    businesses: raw.businesses || [],
    clients: raw.clients || [],
    services: raw.services || [],
    projects: raw.projects || [],
    documents: raw.documents || [],
    expenses: raw.expenses || [],
    transactions: raw.transactions || [],
    recurringInvoices: raw.recurringInvoices || [],
    activityLogs: raw.activityLogs || [],
    activeBusinessId: raw.activeBusinessId || ""
  } as CRMData);
}

/** A workspace read inside a transaction, ready for writeWorkspace. */
export interface LoadedWorkspace {
  ref: DocumentReference;
  head: Record<string, any>;
  /** The workspace in its classic shape ({ documents: [...], clients: [...], ... }). */
  raw: any;
  stored: Record<SplitList, Map<string, string>>;
}

/** Reads a workspace (head and records), inside `tx` when given. Null if it doesn't exist. */
export async function loadWorkspace(uid: string, tx?: Transaction): Promise<LoadedWorkspace | null> {
  const ref = getAdminDb().collection("consultants").doc(uid);
  const read = (q: any): Promise<any> => tx ? tx.get(q) : q.get();
  const [headSnap, ...listSnaps] = await Promise.all([read(ref), ...SPLIT_LISTS.map(l => read(ref.collection(l)))]);
  if (!headSnap.exists) return null;
  const head = headSnap.data() as Record<string, any>;
  const records: Partial<Record<SplitList, any[]>> = {};
  const stored = {} as Record<SplitList, Map<string, string>>;
  SPLIT_LISTS.forEach((list, i) => {
    const docs = listSnaps[i].docs as any[];
    records[list] = docs.map(d => d.data());
    stored[list] = new Map(docs.map(d => [d.id, stableJson(d.data())]));
  });
  return { ref, head, raw: assembleWorkspace(head, records), stored };
}

/**
 * Writes top-level workspace fields in `tx`. Split lists are given whole (as the classic arrays)
 * and only the items that changed are written; other fields go to the head.
 */
export function writeWorkspace(tx: Transaction, ws: LoadedWorkspace, set: Record<string, unknown>) {
  const headPatch: Record<string, any> = {};
  const removals: Record<string, any> = {};
  for (const [key, value] of Object.entries(set)) {
    if (!isSplitList(key)) { headPatch[key] = value; continue; }
    const plan = planListWrite(Array.isArray(value) ? value : [], ws.stored[key], "all",
      id => console.warn(`[workspace] ${key} item ${id} is too large to store; skipped.`));
    plan.sets.forEach(w => tx.set(ws.ref.collection(key).doc(w.docId), w.data));
    plan.deletes.forEach(docId => tx.delete(ws.ref.collection(key).doc(docId)));
    headPatch[`${ORDER_FIELD}.${key}`] = plan.order;
    // The list now lives in records; drop the copy older builds kept in the head.
    if (Array.isArray(ws.head[key])) removals[key] = FieldValue.delete();
  }
  tx.update(ws.ref, { ...sanitizeForFirestore(headPatch), ...removals });
}

export async function readWorkspace(uid: string): Promise<{ raw: any; data: CRMData } | null> {
  const ws = await loadWorkspace(uid);
  return ws ? { raw: ws.raw, data: toData(ws.raw) } : null;
}

export interface WorkspaceChange<T> {
  /** Top-level workspace fields to replace (e.g. { clients: [...] }). */
  set: Record<string, unknown>;
  /** New documents to mirror into the flat 'documents' collection. */
  newDocuments?: CRMDocument[];
  result: T;
}

/**
 * Reads the workspace in a transaction, applies `change` and writes only the fields it returns.
 * Throws WorkspaceMissing if the user has no workspace yet.
 */
export async function updateWorkspace<T>(uid: string, change: (raw: any, data: CRMData) => WorkspaceChange<T>): Promise<T> {
  const db = getAdminDb();
  return db.runTransaction(async tx => {
    const ws = await loadWorkspace(uid, tx);
    if (!ws) throw new WorkspaceMissing();
    const raw = ws.raw;
    const data = toData(raw);
    const { set, newDocuments = [], result } = change(raw, data);
    const now = new Date().toISOString();
    writeWorkspace(tx, ws, { ...set, updatedAt: now });
    const consultantEmail = raw.consultantEmail || data.userProfile.email || "";
    for (const d of newDocuments) {
      const row = buildFlatDocumentRow(uid, consultantEmail, d,
        data.businesses.find(b => b.id === d.businessId), data.clients.find(c => c.id === d.clientId));
      tx.set(db.collection("documents").doc(flatDocumentId(uid, d.id)), row);
    }
    return result;
  });
}

export class WorkspaceMissing extends Error {
  constructor() {
    super("Open Frilensa once to set up your workspace before using the API.");
  }
}

export interface WorkspaceSummary {
  uid: string;
  name: string;
  email: string;
  plan: string;
  businesses: string[];
  clients: number;
  documents: number;
  projects: number;
  updatedAt: string;
}

/** One line per workspace for the admin panel: owner, plan, business names and how much is in it. */
export async function listWorkspaceSummaries(limit = 500): Promise<WorkspaceSummary[]> {
  const db = getAdminDb();
  const lists = ["businesses", "clients", "documents", "projects"] as const;
  const heads = await db.collection("consultants")
    .select("userProfile", "consultantEmail", "updatedAt", ORDER_FIELD, "platformSettings", ...lists)
    .limit(limit).get();
  const live = heads.docs.filter(d => !d.id.includes("@")); // email-keyed copies are left by older versions
  return Promise.all(live.map(async d => {
    const h = d.data() as any;
    const count = (list: string) => Math.max(h[ORDER_FIELD]?.[list]?.length || 0, Array.isArray(h[list]) ? h[list].length : 0);
    let businesses: string[] = Array.isArray(h.businesses) ? h.businesses.map((b: any) => b?.name).filter(Boolean) : [];
    if (h[ORDER_FIELD]?.businesses?.length) {
      const recs = await d.ref.collection("businesses").select("name").get();
      businesses = [...new Set([...businesses, ...recs.docs.map(r => r.get("name")).filter(Boolean)])];
    }
    return {
      uid: d.id,
      name: h.userProfile?.name || "",
      email: h.consultantEmail || h.userProfile?.email || "",
      plan: h.platformSettings?.activePlan || "free",
      businesses,
      clients: count("clients"),
      documents: count("documents"),
      projects: count("projects"),
      updatedAt: h.updatedAt || ""
    };
  }));
}
