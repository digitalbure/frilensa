import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";
import { readWorkspace } from "./workspace";
import { saveBookingRequest } from "./bookings";
import { notifyEmail, later } from "./notify";
import { CONDITIONS, RENT_UNITS, SERVICE_UNITS, isValidCategory, type ListingKind } from "../src/lib/marketplaceTaxonomy";
import { addDays, availableFor, cleanRental, isDate, quoteDetails, quoteRental, usedByDay, type RentalOptions, type RentalQuote } from "../src/lib/marketplaceRental";

// The marketplace: gear to rent or buy, and services, listed by Frilensa users or by Frilensa itself on a
// provider's behalf (as their agent). Anyone can browse; listing and requesting need an account.
// - A user's first listing waits for admin review; once one is approved, their listings go live straight away.
// - A request for a user's listing becomes a booking request in their inbox (quote_requests, channel
//   "marketplace"), so they quote and invoice as usual. Requests for agent listings go to the admins
//   (marketplace_requests), who pass them on and record a commission.
// Server-only collections; firestore.rules deny browser access.

export const LISTINGS = "marketplace_listings";
export const REQUESTS = "marketplace_requests";
const SELLERS = "marketplace_sellers";
// Brands admins add (with a logo) for listers to pick from.
export const BRANDS = "marketplace_brands";
// Confirmed rental bookings and the lister's own blocked dates; they decide what's available.
export const HOLDS = "marketplace_bookings";
const MAX_BRAND_LOGO_BYTES = 300 * 1024;
const MAX_LISTINGS_PER_USER = 50;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Status = "pending" | "live" | "hidden" | "rejected";
export interface Listing {
  id: string; kind: ListingKind; status: Status;
  ownerUid: string | null; businessId: string | null; providerName: string; managed: boolean;
  agent?: { contactName: string; email: string; phone: string; commissionPercent: number; notes: string };
  title: string; description: string; industry: string; category: string; city: string;
  forRent?: boolean; forSale?: boolean; rent?: { amount: number; unit: string } | null; salePrice?: number | null;
  condition?: string; brand?: string; brandId?: string; model?: string;
  rental?: RentalOptions | null;
  price?: { amount: number; unit: string; from: boolean } | null;
  currency: string; photos: { id: string; ext: string; type: string }[];
  createdAt: string; updatedAt: string; reviewedAt?: string; rejectReason?: string;
}

const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);
const text = (v: unknown, max: number) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null; };
const adminEmails = () => String(process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const bucket = () => getStorage(getAdminApp()).bucket(process.env.FILES_BUCKET!);
const photoPath = (listingId: string, p: { id: string; ext: string }) => `marketplace/${listingId}/${p.id}.${p.ext}`;

/** Validates listing fields. Returns the fields to save, or an error message. */
function cleanListing(b: any, kind: ListingKind): Partial<Listing> | string {
  const title = text(b.title, 100);
  if (title.length < 3) return "Give the listing a title.";
  const industry = text(b.industry, 40), category = text(b.category, 40);
  if (!isValidCategory(kind, industry, category)) return "Choose an industry and a category.";
  const out: Partial<Listing> = {
    title, industry, category,
    description: text(b.description, 3000),
    city: text(b.city, 60),
    currency: "FJD"
  };
  if (kind === "gear") {
    const forRent = b.forRent === true, forSale = b.forSale === true;
    if (!forRent && !forSale) return "Choose rent, sell or both.";
    const rentAmount = forRent ? money(b.rent?.amount) : null;
    if (forRent && !rentAmount) return "Enter the rental price.";
    const unit = (RENT_UNITS as readonly string[]).includes(b.rent?.unit) ? b.rent.unit : "day";
    const salePrice = forSale ? money(b.salePrice) : null;
    if (forSale && !salePrice) return "Enter the sale price.";
    const rental = forRent ? cleanRental(b.rental) : null;
    if (typeof rental === "string") return rental;
    Object.assign(out, {
      rental,
      forRent, forSale,
      rent: forRent ? { amount: rentAmount!, unit } : null,
      salePrice: forSale ? salePrice : null,
      condition: CONDITIONS.some(c2 => c2.id === b.condition) ? b.condition : "good",
      brand: text(b.brand, 60), brandId: text(b.brandId, 40), model: text(b.model, 60)
    });
  } else {
    const amount = money(b.price?.amount);
    const unit = (SERVICE_UNITS as readonly string[]).includes(b.price?.unit) ? b.price.unit : "job";
    Object.assign(out, { price: amount ? { amount, unit, from: b.price?.from === true } : null });
  }
  return out;
}

/** Fills in the brand name from the brand list (or keeps the lister's own name for one that isn't listed). */
async function resolveBrand(fields: Partial<Listing>): Promise<Partial<Listing> | string> {
  if (!fields.brandId) return { ...fields, brandId: "" };
  const brand = (await getAdminDb().collection(BRANDS).doc(fields.brandId).get()).data();
  if (!brand) return "That brand isn't in the list any more. Choose another, or pick Other.";
  return { ...fields, brand: brand.name };
}

/** Today's date in Fiji. */
const fijiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Fiji", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Confirmed bookings and blocks for a listing. */
async function holdsFor(listingId: string) {
  const snap = await getAdminDb().collection(HOLDS).where("listingId", "==", listingId).limit(1000).get();
  return snap.docs.map(d => d.data() as Hold).filter(h => h.status !== "cancelled");
}
interface Hold {
  id: string; listingId: string; ownerUid: string | null; kind: "booking" | "block";
  from: string; to: string; quantity: number; status: "confirmed" | "cancelled";
  requestId?: string; requesterUid?: string; name?: string; note?: string; createdAt: string;
}

/** What anyone may see of a listing. */
export function publicListing(l: Listing) {
  const { ownerUid, businessId, agent, status, rejectReason, reviewedAt, ...rest } = l;
  return { ...rest, photos: l.photos.map(p => ({ id: p.id, url: `/api/public/marketplace/photos/${l.id}/${p.id}` })) };
}

/** What the owner (or an admin) sees: everything except the agent's commission terms for owners. */
function ownListing(l: Listing, admin = false) {
  const { agent, ...rest } = l;
  return { ...rest, ...(admin && agent ? { agent } : {}), photos: publicListing(l).photos };
}

// Live listings, cached briefly: the marketplace is browsed far more than it changes.
let liveCache: { at: number; listings: Listing[] } | null = null;
async function liveListings() {
  if (liveCache && Date.now() - liveCache.at < 30_000) return liveCache.listings;
  const snap = await getAdminDb().collection(LISTINGS).where("status", "==", "live").limit(2000).get();
  liveCache = { at: Date.now(), listings: snap.docs.map(d => d.data() as Listing) };
  return liveCache.listings;
}
const invalidate = () => { liveCache = null; };

function priceFor(l: Listing, mode: string) {
  return mode === "buy" ? l.salePrice || 0 : l.kind === "gear" ? l.rent?.amount || 0 : l.price?.amount || 0;
}

/** Search and filters for the browse page. */
export function filterListings(all: Listing[], q: Record<string, unknown>) {
  const kind = q.kind === "service" ? "service" : "gear";
  const mode = kind === "gear" ? (q.mode === "buy" ? "buy" : "rent") : "service";
  const words = text(q.q, 100).toLowerCase().split(/\s+/).filter(Boolean);
  const industry = text(q.industry, 40), category = text(q.category, 40), city = text(q.city, 60).toLowerCase();
  let list = all.filter(l => l.kind === kind && (kind === "service" || (mode === "buy" ? l.forSale : l.forRent)));
  const brand = text(q.brand, 40);
  if (brand) list = list.filter(l => l.brandId === brand);
  if (industry) list = list.filter(l => l.industry === industry);
  if (category) list = list.filter(l => l.category === category);
  if (city) list = list.filter(l => l.city.toLowerCase() === city);
  if (words.length) list = list.filter(l => {
    const hay = `${l.title} ${l.description} ${l.brand || ""} ${l.model || ""} ${l.providerName} ${l.city}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
  const sort = q.sort === "price_asc" || q.sort === "price_desc" ? q.sort : "newest";
  list = [...list].sort((a, b) => sort === "newest" ? b.createdAt.localeCompare(a.createdAt)
    : (sort === "price_asc" ? 1 : -1) * (priceFor(a, mode) - priceFor(b, mode)));
  const cities = [...new Set(all.filter(l => l.kind === kind).map(l => l.city).filter(Boolean))].sort();
  return { mode, listings: list.slice(0, 200), total: list.length, cities };
}

async function isTrusted(uid: string) {
  return (await getAdminDb().collection(SELLERS).doc(uid).get()).data()?.trusted === true;
}

async function savePhoto(listing: Listing, dataUrl: unknown) {
  if (!process.env.FILES_BUCKET) return { error: "Photo uploads aren't set up on this server yet.", status: 503 };
  if (listing.photos.length >= MAX_PHOTOS) return { error: `A listing can have up to ${MAX_PHOTOS} photos.`, status: 400 };
  const m = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { error: "Upload a JPG, PNG or WebP photo.", status: 400 };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_PHOTO_BYTES) return { error: "That photo is too large.", status: 413 };
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8, isPng = buf[0] === 0x89 && buf[1] === 0x50, isWebp = buf.subarray(8, 12).toString("ascii") === "WEBP";
  const type = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : "";
  if (type !== m[1]) return { error: "That file isn't a valid photo.", status: 400 };
  const photo = { id: crypto.randomBytes(8).toString("hex"), ext: PHOTO_TYPES[type], type };
  await bucket().file(photoPath(listing.id, photo)).save(buf, { contentType: type, resumable: false });
  return { photo };
}

async function removePhotos(listing: Listing) {
  if (!process.env.FILES_BUCKET) return;
  await bucket().deleteFiles({ prefix: `marketplace/${listing.id}/` }).catch(() => {});
}

// ---------- Brands ----------

let brandCache: { at: number; brands: any[] } | null = null;
async function listBrands() {
  if (brandCache && Date.now() - brandCache.at < 60_000) return brandCache.brands;
  const snap = await getAdminDb().collection(BRANDS).limit(500).get();
  const brands = snap.docs.map(d => d.data())
    .map(b => ({ id: b.id, name: b.name, logoUrl: b.logoVersion ? `/api/public/marketplace/brands/${b.id}/logo?v=${b.logoVersion}` : "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  brandCache = { at: Date.now(), brands };
  return brands;
}

/** A brand logo: PNG, JPEG or WebP, checked by its first bytes. */
function parseBrandLogo(dataUrl: unknown): { buf: Buffer; mime: string } | string {
  const m = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return "Upload the logo as a PNG, JPG or WebP image.";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_BRAND_LOGO_BYTES) return "That logo is too large. Use one under 300 KB.";
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString("ascii") === "PNG";
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  const mime = isPng ? "image/png" : isJpeg ? "image/jpeg" : isWebp ? "image/webp" : "";
  if (mime !== m[1]) return "That file isn't a valid PNG, JPG or WebP image.";
  return { buf, mime };
}

// ---------- Calendar: bookings, blocked dates and the requests for a listing ----------

type RequestSource = {
  /** The requests for this listing, newest first. */
  list: (l: Listing) => Promise<any[]>;
  /** One request for this listing, or null. */
  get: (l: Listing, id: string) => Promise<{ ref: FirebaseFirestore.DocumentReference; data: any } | null>;
};

/** Requests in the owner's booking inbox (quote_requests) for one of their listings. */
const inboxRequests: RequestSource = {
  list: async l => (await getAdminDb().collection("quote_requests").where("listingId", "==", l.id).limit(200).get()).docs
    .map(d => d.data()).filter(r => r.uid === l.ownerUid),
  get: async (l, id) => {
    const ref = getAdminDb().collection("quote_requests").doc(String(id).slice(0, 64));
    const data = (await ref.get()).data();
    return data && data.uid === l.ownerUid && data.listingId === l.id ? { ref, data } : null;
  }
};
/** Requests for an agent listing (marketplace_requests), handled by the admins. */
const agentRequests: RequestSource = {
  list: async l => (await getAdminDb().collection(REQUESTS).where("listingId", "==", l.id).limit(200).get()).docs.map(d => d.data()),
  get: async (l, id) => {
    const ref = getAdminDb().collection(REQUESTS).doc(String(id).slice(0, 64));
    const data = (await ref.get()).data();
    return data && data.listingId === l.id ? { ref, data } : null;
  }
};

function calendarRoutes(router: express.Router, load: (req: AuthedRequest) => Promise<Listing | null>, source: RequestSource) {
  const needRental = (l: Listing | null) => l && l.kind === "gear" && l.forRent ? l : null;

  router.get("/listings/:id/calendar", wrap(async (req, res) => {
    const l = needRental(await load(req));
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const [holds, requests] = await Promise.all([holdsFor(l.id), source.list(l)]);
    res.json({
      quantity: l.rental?.quantity || 1,
      holds: holds.filter(h => h.to >= addDays(fijiToday(), -60)).sort((a, b) => a.from.localeCompare(b.from)),
      requests: requests.filter(r => r.rental).map(r => ({
        id: r.id, name: r.name, email: r.email, phone: r.phone || "", message: r.message || "",
        estimate: r.estimate, rental: r.rental, bookingId: r.marketplaceBookingId || "",
        status: r.lastStage || r.status, createdAt: r.createdAt
      })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    });
  }));

  // Block dates (the item is away, in repair, or booked elsewhere).
  router.post("/listings/:id/blocks", wrap(async (req, res) => {
    const l = needRental(await load(req));
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const b = req.body || {};
    if (!isDate(b.from) || !isDate(b.to) || b.to < b.from) return res.status(400).json({ error: "Choose the dates to block." });
    const total = l.rental?.quantity || 1;
    const quantity = Math.min(total, Math.max(1, Math.round(Number(b.quantity) || total)));
    const ref = getAdminDb().collection(HOLDS).doc();
    const hold: Hold = { id: ref.id, listingId: l.id, ownerUid: l.ownerUid, kind: "block", from: b.from, to: b.to, quantity, status: "confirmed", note: text(b.note, 200), createdAt: new Date().toISOString() };
    await ref.set(hold);
    res.json({ hold });
  }));

  // Confirm a request: its dates are taken (if they're still free) and the renter is told.
  router.post("/listings/:id/confirm", wrap(async (req, res) => {
    const l = needRental(await load(req));
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const found = await source.get(l, req.body?.requestId);
    const q = found?.data?.rental as RentalQuote | undefined;
    if (!found || !q) return res.status(404).json({ error: "Request not found." });
    if (found.data.marketplaceBookingId) return res.status(409).json({ error: "This request is already confirmed." });
    const db = getAdminDb();
    const ref = db.collection(HOLDS).doc();
    const hold: Hold = {
      id: ref.id, listingId: l.id, ownerUid: l.ownerUid, kind: "booking", from: q.from, to: q.to, quantity: q.quantity, status: "confirmed",
      requestId: found.data.id, requesterUid: found.data.requesterUid || "", name: text(found.data.name, 80), createdAt: new Date().toISOString()
    };
    // Checked and written together, so two confirmations can't take the same last unit.
    const ok = await db.runTransaction(async tx => {
      const snap = await tx.get(db.collection(HOLDS).where("listingId", "==", l.id).limit(1000));
      const holds = snap.docs.map(d => d.data() as Hold).filter(h => h.status !== "cancelled");
      if (availableFor(l.rental?.quantity || 1, holds, q.from, q.to) < q.quantity) return false;
      tx.set(ref, hold);
      tx.update(found.ref, { marketplaceBookingId: ref.id, updatedAt: hold.createdAt });
      return true;
    });
    if (!ok) return res.status(409).json({ error: "Those dates are already booked. Block or cancel something else first, or reply to the renter with other dates." });
    if (isEmail(found.data.email)) later(notifyEmail(found.data.email, {
      subject: `Booking confirmed: ${l.title}`,
      heading: `${l.providerName} confirmed your booking`,
      lines: [...quoteDetails(q, l.category).map(d => `${d.label}: ${d.value}`), `Estimated total: FJD ${q.total.toFixed(2)}`, "They'll send you a quote or invoice for payment."],
      actionLabel: "Open Frilensa", actionPath: "/"
    }));
    res.json({ hold });
  }));

  // Free the dates again: removes a block, or cancels a confirmed booking.
  router.delete("/listings/:id/holds/:holdId", wrap(async (req, res) => {
    const l = needRental(await load(req));
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const ref = getAdminDb().collection(HOLDS).doc(String(req.params.holdId).slice(0, 64));
    const h = (await ref.get()).data() as Hold | undefined;
    if (!h || h.listingId !== l.id) return res.status(404).json({ error: "Not found." });
    if (h.kind === "block") await ref.delete();
    else {
      await ref.update({ status: "cancelled", cancelledAt: new Date().toISOString() });
      const r = h.requestId ? await source.get(l, h.requestId) : null;
      if (r) await r.ref.update({ marketplaceBookingId: "" });
    }
    res.json({ ok: true });
  }));
}

/** Removes a listing's bookings and blocks (when the listing is deleted). */
async function removeHolds(listingId: string) {
  const db = getAdminDb();
  const snap = await db.collection(HOLDS).where("listingId", "==", listingId).limit(1000).get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

// ---------- Public: browse ----------

export function createPublicMarketplaceRouter() {
  const router = express.Router();
  router.use(rateLimit({ name: "public-marketplace", max: 240, windowMs: 60_000, key: r => r.ip || "anon" }));
  router.get("/listings", wrap(async (req, res) => {
    const result = filterListings(await liveListings(), req.query as any);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ...result, listings: result.listings.map(publicListing) });
  }));
  router.get("/listings/:id", wrap(async (req, res) => {
    const snap = await getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64)).get();
    const l = snap.data() as Listing | undefined;
    if (!l || l.status !== "live") return res.status(404).json({ error: "This listing isn't available." });
    res.json({ listing: publicListing(l) });
  }));
  // Which days are booked out (or partly booked) over the next months. No names or details.
  router.get("/listings/:id/availability", wrap(async (req, res) => {
    const snap = await getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64)).get();
    const l = snap.data() as Listing | undefined;
    if (!l || l.status !== "live" || !l.forRent) return res.status(404).json({ error: "This listing isn't available." });
    const from = isDate(req.query.from) && String(req.query.from) >= fijiToday() ? String(req.query.from) : fijiToday();
    const to = addDays(from, Math.min(400, Math.max(1, Number(req.query.days) || 120)) - 1);
    const quantity = l.rental?.quantity || 1;
    const used = usedByDay(await holdsFor(l.id), from, to);
    const available: Record<string, number> = {};
    for (const [d, n] of Object.entries(used)) available[d] = Math.max(0, quantity - n);
    res.setHeader("Cache-Control", "no-store");
    res.json({ from, to, today: fijiToday(), quantity, available });
  }));
  router.get("/brands", wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ brands: await listBrands() });
  }));
  router.get("/brands/:id/logo", wrap(async (req, res) => {
    const b = (await getAdminDb().collection(BRANDS).doc(String(req.params.id).slice(0, 40)).get()).data();
    if (!b?.logo) return res.status(404).end();
    res.setHeader("Content-Type", b.logoMime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.send(Buffer.from(b.logo, "base64"));
  }));
  router.get("/photos/:listingId/:photoId", wrap(async (req, res) => {
    const snap = await getAdminDb().collection(LISTINGS).doc(String(req.params.listingId).slice(0, 64)).get();
    const l = snap.data() as Listing | undefined;
    const p = l?.photos.find(x => x.id === req.params.photoId);
    if (!l || !p || !process.env.FILES_BUCKET) return res.status(404).end();
    const [buf] = await bucket().file(photoPath(l.id, p)).download();
    res.setHeader("Content-Type", p.type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  }));
  return router;
}

// ---------- Signed in: my listings and requests ----------

export function createMarketplaceRouter() {
  const router = express.Router();
  router.use(requireUser);
  const limit = rateLimit({ name: "marketplace", max: 120, windowMs: 60_000 });

  router.get("/mine", limit, wrap(async (req, res) => {
    const uid = req.user!.uid;
    const db = getAdminDb();
    const [mine, sentInbox, sentAgent] = await Promise.all([
      db.collection(LISTINGS).where("ownerUid", "==", uid).limit(200).get(),
      db.collection("quote_requests").where("requesterUid", "==", uid).limit(100).get(),
      db.collection(REQUESTS).where("requesterUid", "==", uid).limit(100).get()
    ]);
    const sent = [
      ...sentInbox.docs.map(d => d.data()).map(r => ({ id: r.id, listingId: r.listingId, title: r.items?.[0]?.name || "", mode: r.marketplaceMode, providerName: r.businessName, estimate: r.estimate, status: r.lastStage || r.status, createdAt: r.createdAt })),
      ...sentAgent.docs.map(d => d.data()).map(r => ({ id: r.id, listingId: r.listingId, title: r.listingTitle, mode: r.mode, providerName: r.providerName, estimate: r.estimate, status: r.status, createdAt: r.createdAt }))
    ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({
      listings: mine.docs.map(d => ownListing(d.data() as Listing)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      sent,
      trusted: await isTrusted(uid)
    });
  }));

  router.post("/listings", limit, wrap(async (req, res) => {
    const uid = req.user!.uid;
    const kind: ListingKind = req.body?.kind === "service" ? "service" : "gear";
    const cleaned = cleanListing(req.body || {}, kind);
    const fields = typeof cleaned === "string" ? cleaned : await resolveBrand(cleaned);
    if (typeof fields === "string") return res.status(400).json({ error: fields });
    const ws = await readWorkspace(uid);
    if (!ws) return res.status(400).json({ error: "Set up your Frilensa workspace first." });
    const business = ws.data.businesses.find(b => b.id === req.body?.businessId) || ws.data.businesses.find(b => b.id === ws.data.activeBusinessId) || ws.data.businesses[0];
    if (!business) return res.status(400).json({ error: "Add a business first." });
    const db = getAdminDb();
    const count = (await db.collection(LISTINGS).where("ownerUid", "==", uid).count().get()).data().count;
    if (count >= MAX_LISTINGS_PER_USER) return res.status(400).json({ error: `You can have up to ${MAX_LISTINGS_PER_USER} listings.` });
    const ref = db.collection(LISTINGS).doc();
    const now = new Date().toISOString();
    const listing: Listing = {
      id: ref.id, kind, status: (await isTrusted(uid)) ? "live" : "pending",
      ownerUid: uid, businessId: business.id, providerName: business.name || "Frilensa user", managed: false,
      photos: [], createdAt: now, updatedAt: now, ...(fields as any)
    };
    await ref.set(listing);
    invalidate();
    if (listing.status === "pending") later(Promise.all(adminEmails().map(to => notifyEmail(to, {
      subject: `Marketplace listing to review: ${listing.title}`,
      heading: "A new marketplace listing is waiting for review",
      lines: [`${listing.providerName} listed "${listing.title}". Their first listing needs your approval before it goes live.`],
      actionLabel: "Review listings", actionPath: "/"
    }))));
    res.json({ listing: ownListing(listing) });
  }));

  // Owner edits (and admins, through the admin routes).
  const ownListingOr404 = async (uid: string, id: string) => {
    const snap = await getAdminDb().collection(LISTINGS).doc(String(id).slice(0, 64)).get();
    const l = snap.data() as Listing | undefined;
    return l && l.ownerUid === uid ? l : null;
  };

  router.patch("/listings/:id", limit, wrap(async (req, res) => {
    const l = await ownListingOr404(req.user!.uid, req.params.id);
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const cleaned = cleanListing({ ...l, ...req.body }, l.kind);
    const fields = typeof cleaned === "string" ? cleaned : await resolveBrand(cleaned);
    if (typeof fields === "string") return res.status(400).json({ error: fields });
    // Owners can hide and re-show their own listing; review status is the admins' to change.
    let status = l.status;
    if (req.body?.status === "hidden" && l.status === "live") status = "hidden";
    if (req.body?.status === "live" && l.status === "hidden") status = "live";
    if (l.status === "rejected" && req.body?.resubmit === true) status = "pending";
    const updated: Listing = { ...l, ...(fields as any), status, updatedAt: new Date().toISOString() };
    await getAdminDb().collection(LISTINGS).doc(l.id).set(updated);
    invalidate();
    res.json({ listing: ownListing(updated) });
  }));

  router.delete("/listings/:id", limit, wrap(async (req, res) => {
    const l = await ownListingOr404(req.user!.uid, req.params.id);
    if (!l) return res.status(404).json({ error: "Listing not found." });
    await getAdminDb().collection(LISTINGS).doc(l.id).delete();
    await removePhotos(l);
    await removeHolds(l.id);
    invalidate();
    res.json({ ok: true });
  }));

  router.post("/listings/:id/photos", rateLimit({ name: "marketplace-photos", max: 60, windowMs: 60 * 60_000 }), wrap(async (req, res) => {
    const l = await ownListingOr404(req.user!.uid, req.params.id);
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const r = await savePhoto(l, req.body?.dataUrl);
    if ("error" in r) return res.status(r.status!).json({ error: r.error });
    const updated = { ...l, photos: [...l.photos, r.photo!], updatedAt: new Date().toISOString() };
    await getAdminDb().collection(LISTINGS).doc(l.id).set(updated);
    invalidate();
    res.json({ listing: ownListing(updated) });
  }));

  router.delete("/listings/:id/photos/:photoId", limit, wrap(async (req, res) => {
    const l = await ownListingOr404(req.user!.uid, req.params.id);
    const p = l?.photos.find(x => x.id === req.params.photoId);
    if (!l || !p) return res.status(404).json({ error: "Photo not found." });
    if (process.env.FILES_BUCKET) await bucket().file(photoPath(l.id, p)).delete().catch(() => {});
    const updated = { ...l, photos: l.photos.filter(x => x.id !== p.id), updatedAt: new Date().toISOString() };
    await getAdminDb().collection(LISTINGS).doc(l.id).set(updated);
    invalidate();
    res.json({ listing: ownListing(updated) });
  }));

  // A request to rent, buy or book. For a user's listing it lands in their booking inbox; for an
  // agent listing it goes to the admins.
  router.post("/listings/:id/requests", rateLimit({ name: "marketplace-request", max: 20, windowMs: 60 * 60_000 }), wrap(async (req, res) => {
    const uid = req.user!.uid;
    const email = String(req.user!.email || "").toLowerCase();
    const snap = await getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64)).get();
    const l = snap.data() as Listing | undefined;
    if (!l || l.status !== "live") return res.status(404).json({ error: "This listing isn't available." });
    if (l.ownerUid === uid) return res.status(400).json({ error: "This is your own listing." });
    const b = req.body || {};
    const mode = l.kind === "service" ? "service" : b.mode === "buy" ? "buy" : "rent";
    if (mode === "buy" && !l.forSale) return res.status(400).json({ error: "This item isn't for sale." });
    if (mode === "rent" && l.kind === "gear" && !l.forRent) return res.status(400).json({ error: "This item isn't for rent." });
    const from = isDate(b.from) ? b.from : "";
    const to = isDate(b.to) ? b.to : "";
    // Rentals: the price, deposit and choices are worked out here from the listing, and the dates must be free.
    let rental: RentalQuote | null = null;
    if (mode === "rent") {
      const q = quoteRental(l, b, fijiToday());
      if (typeof q === "string") return res.status(400).json({ error: q });
      if (availableFor(l.rental?.quantity || 1, await holdsFor(l.id), q.from, q.to) < q.quantity) {
        return res.status(409).json({ error: (l.rental?.quantity || 1) > 1 ? "Not enough are free on those dates. Try fewer, or other dates." : "Those dates are already booked. Please choose other dates." });
      }
      rental = q;
    }
    const quantity = rental ? rental.quantity : Math.min(1000, Math.max(1, Math.round(Number(b.quantity) || 1)));
    const offer = mode === "buy" ? money(b.offer) || l.salePrice || 0 : null;
    const rate = mode === "buy" ? offer! : l.kind === "gear" ? l.rent!.amount : l.price?.amount || 0;
    const unit = mode === "buy" ? "item" : l.kind === "gear" ? l.rent!.unit : l.price?.unit || "job";
    const estimate = rental ? rental.total : Math.round(rate * quantity * 100) / 100;
    const name = text(b.name, 80) || String(req.user!.name || email.split("@")[0]);
    const phone = text(b.phone, 40);
    const message = text(b.message, 2000);
    const details = [
      { label: "Marketplace", value: `${mode === "buy" ? "Wants to buy" : mode === "rent" ? "Wants to rent" : "Wants to book"}: ${l.title}` },
      ...(rental ? quoteDetails(rental, l.category) : [
        ...(from ? [{ label: "Date", value: from }] : []),
        ...(to ? [{ label: "Until", value: to }] : [])
      ]),
      ...(mode === "buy" && offer !== l.salePrice ? [{ label: "Offer", value: `FJD ${offer!.toFixed(2)} (asking ${l.salePrice?.toFixed(2)})` }] : [])
    ];

    if (l.managed || !l.ownerUid) {
      const ref = getAdminDb().collection(REQUESTS).doc();
      const now = new Date().toISOString();
      const request = {
        id: ref.id, listingId: l.id, listingTitle: l.title, providerName: l.providerName, mode,
        requesterUid: uid, name, email, phone, message, from, to, quantity, rate, unit, estimate,
        offer, rental, status: "new", commissionPercent: l.agent?.commissionPercent ?? null, commissionAmount: null, notes: "",
        createdAt: now, updatedAt: now
      };
      await ref.set(request);
      later(Promise.all(adminEmails().map(to2 => notifyEmail(to2, {
        subject: `Marketplace request for ${l.title}`,
        heading: `${name} sent a request for ${l.providerName}'s listing`,
        lines: [...details.map(d => `${d.label}: ${d.value}`), message ? `Their note: ${message}` : "", `Reply to ${email}${phone ? ` or ${phone}` : ""}.`].filter(Boolean),
        actionLabel: "Open the admin panel", actionPath: "/"
      }))));
      return res.json({ ok: true, requestId: ref.id });
    }

    const ws = await readWorkspace(l.ownerUid);
    const business = ws?.data.businesses.find(x => x.id === l.businessId) || ws?.data.businesses[0];
    if (!ws || !business) return res.status(404).json({ error: "This listing isn't available." });
    const { request } = await saveBookingRequest({
      uid: l.ownerUid, data: ws.data, business,
      checked: {
        items: rental
          ? rental.lines.map((x, i) => ({ serviceId: `mkt_${l.id}_${i}`, name: x.label, unit: x.unit, rate: x.rate, quantity: x.quantity }))
          : [{ serviceId: `mkt_${l.id}`, name: l.title, unit, rate, quantity }],
        estimate, details,
        ...(from ? { eventDate: from } : {}),
        ...(rental?.pickupTime ? { startTime: rental.pickupTime } : {}),
        ...(rental ? { location: rental.pickup.address ? `${rental.pickup.name}, ${rental.pickup.address}` : rental.pickup.name } : {})
      } as any,
      contact: { name, email, phone, message },
      channel: "marketplace",
      extra: { requesterUid: uid, listingId: l.id, marketplaceMode: mode, ...(rental ? { rental } : {}) }
    });
    res.json({ ok: true, requestId: request.id });
  }));

  // The owner's calendar for each of their rental listings.
  calendarRoutes(router, async req => ownListingOr404(req.user!.uid, req.params.id), inboxRequests);
  return router;
}

// ---------- Admin: review, agent listings, commission ----------

export function createAdminMarketplaceRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin-marketplace", max: 120, windowMs: 60_000 }));

  router.get("/", wrap(async (_req, res) => {
    const db = getAdminDb();
    const [listings, requests] = await Promise.all([
      db.collection(LISTINGS).orderBy("updatedAt", "desc").limit(1000).get(),
      db.collection(REQUESTS).orderBy("createdAt", "desc").limit(300).get()
    ]);
    res.json({ listings: listings.docs.map(d => ownListing(d.data() as Listing, true)), requests: requests.docs.map(d => d.data()) });
  }));

  const cleanAgent = (b: any) => {
    const email = text(b?.email, 120).toLowerCase();
    if (email && !isEmail(email)) return "Enter a valid email for the provider, or leave it empty.";
    const pct = Number(b?.commissionPercent);
    return { contactName: text(b?.contactName, 80), email, phone: text(b?.phone, 40), commissionPercent: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 10, notes: text(b?.notes, 500) };
  };

  // A listing Frilensa manages for a provider (as their agent).
  router.post("/listings", wrap(async (req, res) => {
    const kind: ListingKind = req.body?.kind === "service" ? "service" : "gear";
    const cleaned = cleanListing(req.body || {}, kind);
    const fields = typeof cleaned === "string" ? cleaned : await resolveBrand(cleaned);
    if (typeof fields === "string") return res.status(400).json({ error: fields });
    const providerName = text(req.body?.providerName, 80);
    if (!providerName) return res.status(400).json({ error: "Enter the provider's name." });
    const agent = cleanAgent(req.body?.agent);
    if (typeof agent === "string") return res.status(400).json({ error: agent });
    const ref = getAdminDb().collection(LISTINGS).doc();
    const now = new Date().toISOString();
    const listing: Listing = { id: ref.id, kind, status: "live", ownerUid: null, businessId: null, providerName, managed: true, agent, photos: [], createdAt: now, updatedAt: now, ...(fields as any) };
    await ref.set(listing);
    invalidate();
    res.json({ listing: ownListing(listing, true) });
  }));

  router.patch("/listings/:id", wrap(async (req, res) => {
    const ref = getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64));
    const l = (await ref.get()).data() as Listing | undefined;
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const b = req.body || {};
    const editing = ["title", "description", "industry", "category", "city", "forRent", "forSale", "rent", "salePrice", "condition", "brand", "brandId", "model", "price", "rental"].some(k => k in b);
    const cleaned = editing ? cleanListing({ ...l, ...b }, l.kind) : {};
    const fields = typeof cleaned === "string" ? cleaned : editing ? await resolveBrand(cleaned) : {};
    if (typeof fields === "string") return res.status(400).json({ error: fields });
    const now = new Date().toISOString();
    const updated: Listing = { ...l, ...(fields as any), updatedAt: now };
    if (["live", "hidden", "rejected"].includes(b.status)) {
      updated.status = b.status;
      updated.reviewedAt = now;
      updated.rejectReason = b.status === "rejected" ? text(b.rejectReason, 300) : "";
      // Approving a user's listing trusts them: their next listings go live straight away.
      if (b.status === "live" && l.ownerUid) await getAdminDb().collection(SELLERS).doc(l.ownerUid).set({ trusted: true, approvedAt: now }, { merge: true });
    }
    if (l.managed) {
      if (typeof b.providerName === "string" && text(b.providerName, 80)) updated.providerName = text(b.providerName, 80);
      if (b.agent) { const agent = cleanAgent(b.agent); if (typeof agent === "string") return res.status(400).json({ error: agent }); updated.agent = agent; }
    }
    await ref.set(updated);
    invalidate();
    res.json({ listing: ownListing(updated, true) });
  }));

  router.post("/listings/:id/photos", wrap(async (req, res) => {
    const ref = getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64));
    const l = (await ref.get()).data() as Listing | undefined;
    if (!l) return res.status(404).json({ error: "Listing not found." });
    const r = await savePhoto(l, req.body?.dataUrl);
    if ("error" in r) return res.status(r.status!).json({ error: r.error });
    const updated = { ...l, photos: [...l.photos, r.photo!], updatedAt: new Date().toISOString() };
    await ref.set(updated);
    invalidate();
    res.json({ listing: ownListing(updated, true) });
  }));

  router.delete("/listings/:id", wrap(async (req, res) => {
    const ref = getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64));
    const l = (await ref.get()).data() as Listing | undefined;
    if (!l) return res.status(404).json({ error: "Listing not found." });
    await ref.delete();
    await removePhotos(l);
    await removeHolds(l.id);
    invalidate();
    res.json({ ok: true });
  }));

  // Progress on a request for an agent listing, and the commission earned.
  router.patch("/requests/:id", wrap(async (req, res) => {
    const ref = getAdminDb().collection(REQUESTS).doc(String(req.params.id).slice(0, 64));
    const r = (await ref.get()).data();
    if (!r) return res.status(404).json({ error: "Request not found." });
    const b = req.body || {};
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (["new", "contacted", "won", "lost"].includes(b.status)) patch.status = b.status;
    if ("commissionAmount" in b) patch.commissionAmount = b.commissionAmount === null || b.commissionAmount === "" ? null : money(b.commissionAmount);
    if (typeof b.notes === "string") patch.notes = text(b.notes, 1000);
    await ref.update(patch);
    res.json({ request: { ...r, ...patch } });
  }));

  // Calendars for every rental listing; requests come from the inbox (users' listings) or the admins' list (agent listings).
  const loadAny = async (req: AuthedRequest) => (await getAdminDb().collection(LISTINGS).doc(String(req.params.id).slice(0, 64)).get()).data() as Listing | null || null;
  router.get("/listings/:id/calendar", async (req: AuthedRequest, res, next) => {
    const l = await loadAny(req).catch(() => null);
    if (l && !l.managed) return res.status(403).json({ error: "The owner manages this listing's calendar." });
    next();
  });
  calendarRoutes(router, async req => { const l = await loadAny(req); return l?.managed ? l : null; }, agentRequests);

  // Brands listers choose from.
  router.post("/brands", wrap(async (req, res) => {
    const name = text(req.body?.name, 60);
    if (!name) return res.status(400).json({ error: "Enter the brand name." });
    const db = getAdminDb();
    const existing = await db.collection(BRANDS).where("nameLower", "==", name.toLowerCase()).limit(1).get();
    if (!existing.empty) return res.status(409).json({ error: `${name} is already in the list.` });
    const ref = db.collection(BRANDS).doc();
    const brand: any = { id: ref.id, name, nameLower: name.toLowerCase(), createdAt: new Date().toISOString(), logoVersion: "" };
    if (req.body?.logoDataUrl) {
      const logo = parseBrandLogo(req.body.logoDataUrl);
      if (typeof logo === "string") return res.status(400).json({ error: logo });
      Object.assign(brand, { logo: logo.buf.toString("base64"), logoMime: logo.mime, logoVersion: crypto.createHash("sha256").update(logo.buf).digest("hex").slice(0, 12) });
    }
    await ref.set(brand);
    brandCache = null;
    res.json({ brand: (await listBrands()).find(b => b.id === ref.id) });
  }));
  router.patch("/brands/:id", wrap(async (req, res) => {
    const db = getAdminDb();
    const ref = db.collection(BRANDS).doc(String(req.params.id).slice(0, 40));
    const current = (await ref.get()).data();
    if (!current) return res.status(404).json({ error: "Brand not found." });
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.name === "string") {
      const name = text(req.body.name, 60);
      if (!name) return res.status(400).json({ error: "Enter the brand name." });
      const clash = await db.collection(BRANDS).where("nameLower", "==", name.toLowerCase()).limit(2).get();
      if (clash.docs.some(d => d.id !== ref.id)) return res.status(409).json({ error: `${name} is already in the list.` });
      Object.assign(patch, { name, nameLower: name.toLowerCase() });
    }
    if (req.body?.logoDataUrl) {
      const logo = parseBrandLogo(req.body.logoDataUrl);
      if (typeof logo === "string") return res.status(400).json({ error: logo });
      Object.assign(patch, { logo: logo.buf.toString("base64"), logoMime: logo.mime, logoVersion: crypto.createHash("sha256").update(logo.buf).digest("hex").slice(0, 12) });
    } else if (req.body?.removeLogo === true) Object.assign(patch, { logo: "", logoMime: "", logoVersion: "" });
    await ref.update(patch);
    // Listings show the brand's current name.
    if (patch.name) {
      const using = await db.collection(LISTINGS).where("brandId", "==", ref.id).limit(1000).get();
      await Promise.all(using.docs.map(d => d.ref.update({ brand: patch.name })));
      invalidate();
    }
    brandCache = null;
    res.json({ brand: (await listBrands()).find(b => b.id === ref.id) });
  }));
  // Listings that used a removed brand keep its name as plain text.
  router.delete("/brands/:id", wrap(async (req, res) => {
    const db = getAdminDb();
    const id = String(req.params.id).slice(0, 40);
    const using = await db.collection(LISTINGS).where("brandId", "==", id).limit(1000).get();
    await Promise.all(using.docs.map(d => d.ref.update({ brandId: "" })));
    await db.collection(BRANDS).doc(id).delete();
    brandCache = null;
    invalidate();
    res.json({ ok: true, listingsUpdated: using.size });
  }));
  return router;
}

export const _test = { cleanListing, filterListings };
