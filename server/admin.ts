import express, { type NextFunction, type Response } from "express";
import { getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";

// Platform admin tools for the shared directory: every listing and every directory booking, with
// edit and delete. Admins are the verified accounts in ADMIN_EMAILS (comma-separated), the same
// list the app is built with (VITE_ADMIN_EMAILS).

const LISTINGS = "directory_listings";
const BOOKINGS = "directory_bookings";
const REQUESTS = "quote_requests";

const adminEmails = () => String(process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const email = String(req.user?.email || "").toLowerCase();
  if (!email || !adminEmails().includes(email)) return res.status(403).json({ error: "Only platform admins can do this." });
  next();
}

const str = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : undefined;
const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin", max: 120, windowMs: 60_000 }));

  router.get("/directory", wrap(async (_req, res) => {
    const db = getAdminDb();
    const [listings, bookings] = await Promise.all([db.collection(LISTINGS).limit(1000).get(), db.collection(BOOKINGS).limit(1000).get()]);
    const byNewest = (a: any, b: any) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    res.json({ listings: listings.docs.map(d => ({ ...d.data(), uid: d.id })).sort(byNewest), bookings: bookings.docs.map(d => ({ ...d.data(), id: d.id })).sort(byNewest) });
  }));

  // Edit a listing: what shows in the directory, whether it's public, and the verified badge.
  router.patch("/directory/listings/:uid", wrap(async (req, res) => {
    const ref = getAdminDb().collection(LISTINGS).doc(String(req.params.uid).slice(0, 128));
    if (!(await ref.get()).exists) return res.status(404).json({ error: "Listing not found." });
    const b = req.body || {};
    const patch: Record<string, unknown> = {};
    for (const [k, max] of [["name", 120], ["category", 80], ["city", 80], ["directoryBio", 1500], ["brandSlogan", 160], ["phone", 40], ["rateUnit", 30]] as const) {
      const v = str(b[k], max); if (v !== undefined) patch[k] = v;
    }
    if (b.email !== undefined) patch.email = isEmail(b.email) ? String(b.email).trim() : "";
    if (b.startingRate !== undefined) { const n = Number(b.startingRate); patch.startingRate = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; }
    if (typeof b.listed === "boolean") patch.listed = b.listed;
    if (typeof b.isFrcsVerified === "boolean") patch.isFrcsVerified = b.isFrcsVerified;
    if (patch.name === "") return res.status(400).json({ error: "A listing needs a name." });
    patch.updatedAt = new Date().toISOString();
    patch.editedByAdmin = req.user!.email;
    await ref.update(patch);
    res.json({ listing: { ...(await ref.get()).data(), uid: ref.id } });
  }));

  router.delete("/directory/listings/:uid", wrap(async (req, res) => {
    await getAdminDb().collection(LISTINGS).doc(String(req.params.uid).slice(0, 128)).delete();
    res.json({ ok: true });
  }));

  // Delete a booking, and its copy in the provider's bookings inbox if it hasn't been acted on.
  router.delete("/directory/bookings/:id", wrap(async (req, res) => {
    const db = getAdminDb();
    const id = String(req.params.id).slice(0, 128);
    await db.collection(BOOKINGS).doc(id).delete();
    const copies = await db.collection(REQUESTS).where("directoryBookingId", "==", id).limit(5).get();
    await Promise.all(copies.docs.filter(d => d.data().status === "new").map(d => d.ref.delete()));
    res.json({ ok: true });
  }));

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[admin] Request failed:", err?.message || err);
    res.status(500).json({ error: "The admin tools are temporarily unavailable." });
  });
  return router;
}
