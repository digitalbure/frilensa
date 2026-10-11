import { getAdminDb } from "./security";
import { normalizeDocuments } from "../src/lib/normalizeDocuments";
import { buildFlatDocumentRow, flatDocumentId, sanitizeForFirestore } from "../src/lib/flatDocuments";
import type { CRMData, CRMDocument } from "../src/types";

// Server-side access to a consultant's workspace (consultants/{uid}), shared by the daily job,
// the public API and the MCP server. Writes go through a transaction and keep the flat
// 'documents' copies (client portal and "view online" links) in step.

/** A workspace as stored, with missing lists defaulted and documents repaired. */
export function toData(raw: any): CRMData {
  return normalizeDocuments({
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

export async function readWorkspace(uid: string): Promise<{ raw: any; data: CRMData } | null> {
  const snap = await getAdminDb().collection("consultants").doc(uid).get();
  if (!snap.exists) return null;
  const raw = snap.data() as any;
  return { raw, data: toData(raw) };
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
  const wsRef = db.collection("consultants").doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(wsRef);
    if (!snap.exists) throw new WorkspaceMissing();
    const raw = snap.data() as any;
    const data = toData(raw);
    const { set, newDocuments = [], result } = change(raw, data);
    const now = new Date().toISOString();
    tx.update(wsRef, sanitizeForFirestore({ ...set, updatedAt: now }));
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
