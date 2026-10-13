import { sanitizeForFirestore } from './flatDocuments';

// A workspace is stored as one small "head" document (consultants/{uid}: profile, settings,
// retainers) plus one document per item for the lists that grow, in subcollections named after
// the list (consultants/{uid}/documents/{id}, consultants/{uid}/clients/{id}, ...). This keeps every
// stored document far below Firestore's 1 MB limit however much a business does.
//
// Older builds kept those lists as arrays inside the head. Reads combine both forms, so workspaces
// move over on their next save and a tab still running an older build can't lose anything.
// Shared by the app (lib/db.ts) and the server (server/workspace.ts).

export const SPLIT_LISTS = [
  'businesses', 'clients', 'services', 'projects', 'documents', 'expenses', 'transactions',
  'activityLogs', 'aiConversations', 'aiMemories'
] as const;
export type SplitList = typeof SPLIT_LISTS[number];

/** Head field holding each split list's item order, as ids: { documents: ['d2', 'd1'], ... }. */
export const ORDER_FIELD = 'recordOrder';

export const isSplitList = (key: string): key is SplitList => (SPLIT_LISTS as readonly string[]).includes(key);

/** Firestore document id for an item id ("/" isn't allowed, nor "." / ".." / "__x__"). */
export function recordDocId(id: string): string {
  const enc = encodeURIComponent(String(id));
  return /^\.{1,2}$|^__.*__$/.test(enc) ? `id_${enc}` : enc;
}

/** JSON with object keys sorted, so equal values compare equal whatever order Firestore returns. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).filter(k => (value as any)[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson((value as any)[k])}`).join(',')}}`;
}

const time = (item: any) => {
  const t = item?.updatedAt ? new Date(item.updatedAt).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/**
 * Combines a head document with its item records into the classic workspace shape
 * ({ documents: [...], clients: [...], ... }). Where an item is both in an old head array and in
 * a record, the newer one (by updatedAt) wins, and the record on a tie.
 */
export function assembleWorkspace(head: Record<string, any>, records: Partial<Record<SplitList, any[]>>): Record<string, any> {
  const { [ORDER_FIELD]: order, ...raw } = head || {};
  for (const list of SPLIT_LISTS) {
    const legacy: any[] = Array.isArray(raw[list]) ? raw[list] : [];
    const recs = records[list] || [];
    if (!recs.length) { raw[list] = legacy; continue; }
    const byId = new Map<string, any>();
    const loose: any[] = [];
    legacy.forEach(item => item?.id ? byId.set(String(item.id), item) : item && loose.push(item));
    recs.forEach(rec => {
      if (!rec?.id) return;
      const id = String(rec.id);
      const old = byId.get(id);
      if (!old || time(rec) >= time(old)) byId.set(id, rec);
    });
    const seen = new Set<string>();
    const out: any[] = [];
    const take = (id: string) => { if (!seen.has(id) && byId.has(id)) { seen.add(id); out.push(byId.get(id)); } };
    (Array.isArray(order?.[list]) ? order[list] : []).forEach((id: unknown) => take(String(id)));
    legacy.forEach(item => item?.id && take(String(item.id)));
    recs.forEach(rec => rec?.id && take(String(rec.id)));
    raw[list] = [...out, ...loose];
  }
  return raw;
}

export interface ListWritePlan {
  sets: { docId: string; data: Record<string, any>; json: string }[];
  deletes: string[];
  /** Item ids in list order, for the head's ORDER_FIELD. */
  order: string[];
}

/** Largest item we try to store; Firestore's hard limit is 1 MiB per document. */
const MAX_RECORD_CHARS = 900_000;
const HEAVY_FIELDS = ['pdfDataUrl', 'receiptImage', 'signature', 'attachments'];

function fitRecord(data: Record<string, any>, json: string): { data: Record<string, any>; json: string } | null {
  if (json.length <= MAX_RECORD_CHARS) return { data, json };
  const slim = { ...data };
  HEAVY_FIELDS.forEach(k => delete slim[k]);
  const slimJson = stableJson(slim);
  return slimJson.length <= MAX_RECORD_CHARS ? { data: slim, json: slimJson } : null;
}

/**
 * Works out which records to write for one list.
 * - `stored`: record doc id → stableJson of what's stored now.
 * - `mayDelete`: which stored records may be removed when missing from `items`. The server passes
 *   'all' (it read the whole list in the same transaction); the app passes only the ids it had
 *   before, so an item someone else just added is never deleted by a device that hasn't seen it.
 */
export function planListWrite(items: any[], stored: Map<string, string>, mayDelete: 'all' | Set<string>, onSkip?: (id: string) => void): ListWritePlan {
  const plan: ListWritePlan = { sets: [], deletes: [], order: [] };
  const keep = new Set<string>();
  for (const item of items || []) {
    if (!item?.id) continue;
    const docId = recordDocId(String(item.id));
    if (keep.has(docId)) continue;
    keep.add(docId);
    plan.order.push(String(item.id));
    const data = sanitizeForFirestore(item) as Record<string, any>;
    const fitted = fitRecord(data, stableJson(data));
    if (!fitted) { onSkip?.(String(item.id)); continue; }
    if (stored.get(docId) !== fitted.json) plan.sets.push({ docId, ...fitted });
  }
  for (const docId of stored.keys()) {
    if (keep.has(docId)) continue;
    if (mayDelete === 'all' || mayDelete.has(docId)) plan.deletes.push(docId);
  }
  return plan;
}

/** Record doc ids for a list of items. */
export function recordIds(items: any[]): Set<string> {
  return new Set((items || []).filter(i => i?.id).map(i => recordDocId(String(i.id))));
}
