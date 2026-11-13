import crypto from "crypto";
import express, { type NextFunction, type Response } from "express";
import { getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";
import type { ApiRequest } from "./apiKeys";
import { MAX_BATCH, MAX_SYNCED_GEAR, cleanGearItem, sourceName, sourceSlug, type SyncedGear } from "../src/lib/gearSync";

// Gear synced from another app (Packer Tools and others). See src/lib/gearSync.ts and docs/API.md.
// Server-only collection synced_gear: one document per user, source app and item.
//   - The other app, with the user's API key or OAuth connection (draft access), sends and removes items
//     through /api/v1/gear. That only changes this copy, never anything else in the workspace.
//   - The user sees the copy in the app (/api/gear) and records what they made from each item.

const GEAR = "synced_gear";

export class GearError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const docId = (uid: string, source: string, externalId: string) =>
  `${uid}_${source}_${crypto.createHash("sha256").update(externalId).digest("hex").slice(0, 32)}`;

const view = (g: SyncedGear & { uid?: string }) => { const { uid: _uid, ...rest } = g; return rest; };

async function countFor(uid: string) {
  return (await getAdminDb().collection(GEAR).where("uid", "==", uid).count().get()).data().count;
}

/** Adds or updates items for a user. Returns how many were added and updated, and any items that couldn't be used. */
export async function upsertGear(uid: string, source: unknown, sourceLabel: unknown, items: { externalId: unknown; body: any }[]) {
  const slug = sourceSlug(source);
  const label = sourceName(slug, sourceLabel);
  const db = getAdminDb();
  const errors: { externalId: string; error: string }[] = [];
  const clean = items.map(i => ({ raw: i, c: cleanGearItem(i.body, i.externalId) }));
  const ok = clean.filter(x => typeof x.c !== "string") as { c: Exclude<ReturnType<typeof cleanGearItem>, string> }[];
  clean.filter(x => typeof x.c === "string").forEach(x => errors.push({ externalId: String(x.raw.externalId ?? x.raw.body?.externalId ?? ""), error: x.c as string }));
  if (!ok.length) return { added: 0, updated: 0, errors };
  const refs = ok.map(x => db.collection(GEAR).doc(docId(uid, slug, x.c.externalId)));
  const snaps = await db.getAll(...refs);
  const adding = snaps.filter(s => !s.exists).length;
  if (adding && (await countFor(uid)) + adding > MAX_SYNCED_GEAR) {
    throw new GearError(400, `You can sync up to ${MAX_SYNCED_GEAR} items.`);
  }
  const now = new Date().toISOString();
  const batch = db.batch();
  ok.forEach((x, i) => {
    const prev = snaps[i].data() as (SyncedGear & { uid: string }) | undefined;
    const item: SyncedGear & { uid: string } = {
      ...x.c, id: refs[i].id, uid, source: slug, sourceName: label, removed: false, syncedAt: now, links: prev?.links || {}
    };
    batch.set(refs[i], item);
  });
  await batch.commit();
  return { added: adding, updated: ok.length - adding, errors };
}

const handleApi = (fn: (req: ApiRequest) => Promise<unknown>) => async (req: ApiRequest, res: Response, next: NextFunction) => {
  try { res.json(await fn(req)); } catch (err: any) {
    if (err instanceof GearError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

/** /api/v1/gear routes, mounted inside the API router behind its key checks (draft access to change). */
export function addGearApiRoutes(router: express.Router, read: any[], draft: any[]) {
  const uid = (req: ApiRequest) => req.apiKey!.uid;

  router.get("/gear", ...read, handleApi(async req => {
    const source = req.query.source ? sourceSlug(req.query.source) : "";
    let q = getAdminDb().collection(GEAR).where("uid", "==", uid(req));
    if (source) q = q.where("source", "==", source);
    const snap = await q.get();
    return { gear: snap.docs.map(d => view(d.data() as SyncedGear)).filter(g => !g.removed).sort((a, b) => a.name.localeCompare(b.name)) };
  }));

  router.put("/gear/:externalId", ...draft, handleApi(async req => {
    const result = await upsertGear(uid(req), req.body?.source ?? req.query.source, req.body?.sourceName, [{ externalId: req.params.externalId, body: req.body }]);
    if (result.errors.length) throw new GearError(400, result.errors[0].error);
    return { ok: true, ...result };
  }));

  router.post("/gear/batch", ...draft, handleApi(async req => {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) throw new GearError(400, "Send { source, items: [...] }.");
    if (items.length > MAX_BATCH) throw new GearError(400, `Send up to ${MAX_BATCH} items at a time.`);
    return upsertGear(uid(req), req.body.source, req.body.sourceName, items.map((body: any) => ({ externalId: body?.externalId ?? body?.id, body })));
  }));

  // Gone from the other app: kept (so the user's services and listings still make sense) but marked removed.
  router.delete("/gear/:externalId", ...draft, handleApi(async req => {
    const ref = getAdminDb().collection(GEAR).doc(docId(uid(req), sourceSlug(req.query.source), String(req.params.externalId).slice(0, 120)));
    const snap = await ref.get();
    if (!snap.exists) throw new GearError(404, "No synced item with that id.");
    await ref.update({ removed: true, syncedAt: new Date().toISOString() });
    return { ok: true };
  }));
}

/** /api/gear: the signed-in user's synced gear in the app. */
export function createGearRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "gear", max: 120, windowMs: 60_000 }));
  const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) =>
    h(req, res).catch(err => err instanceof GearError ? res.status(err.status).json({ error: err.message }) : next(err));
  const own = async (uid: string, id: string) => {
    const ref = getAdminDb().collection(GEAR).doc(String(id).slice(0, 200));
    const g = (await ref.get()).data() as (SyncedGear & { uid: string }) | undefined;
    if (!g || g.uid !== uid) throw new GearError(404, "Item not found.");
    return { ref, g };
  };

  router.get("/", wrap(async (req, res) => {
    const snap = await getAdminDb().collection(GEAR).where("uid", "==", req.user!.uid).get();
    res.json({ gear: snap.docs.map(d => view(d.data() as SyncedGear)).sort((a, b) => a.name.localeCompare(b.name)) });
  }));

  // What the user made from an item, so changes in the other app can be offered as updates.
  router.post("/:id/links", wrap(async (req, res) => {
    const { ref, g } = await own(req.user!.uid, String(req.params.id));
    const clean = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : undefined;
    const links = {
      ...g.links,
      ...(req.body?.serviceId !== undefined ? { serviceId: clean(req.body.serviceId) } : {}),
      ...(req.body?.listingId !== undefined ? { listingId: clean(req.body.listingId) } : {}),
      linkedVersion: g.updatedAt
    };
    Object.keys(links).forEach(k => (links as any)[k] === undefined && delete (links as any)[k]);
    await ref.update({ links });
    res.json({ gear: view({ ...g, links }) });
  }));

  router.delete("/:id", wrap(async (req, res) => {
    const { ref } = await own(req.user!.uid, String(req.params.id));
    await ref.delete();
    res.json({ ok: true });
  }));

  return router;
}
