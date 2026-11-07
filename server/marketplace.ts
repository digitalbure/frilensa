import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";
import { readWorkspace } from "./workspace";
import { saveBookingRequest } from "./bookings";
import { notifyEmail, later } from "./notify";
import { CONDITIONS, RENT_UNITS, SERVICE_UNITS, isValidCategory, type ListingKind } from "../src/lib/marketplaceTaxonomy";

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
  condition?: string; brand?: string; model?: string;
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
    Object.assign(out, {
      forRent, forSale,
      rent: forRent ? { amount: rentAmount!, unit } : null,
      salePrice: forSale ? salePrice : null,
      condition: CONDITIONS.some(c2 => c2.id === b.condition) ? b.condition : "good",
      brand: text(b.brand, 60), model: text(b.model, 60)
    });
  } else {
    const amount = money(b.price?.amount);
    const unit = (SERVICE_UNITS as readonly string[]).includes(b.price?.unit) ? b.price.unit : "job";
    Object.assign(out, { price: amount ? { amount, unit, from: b.price?.from === true } : null });
  }
  return out;
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
    const fields = cleanListing(req.body || {}, kind);
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
    const fields = cleanListing({ ...l, ...req.body }, l.kind);
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
    const from = /^\d{4}-\d{2}-\d{2}$/.test(b.from) ? b.from : "";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(b.to) ? b.to : "";
    if (mode === "rent" && (!from || !to || to < from)) return res.status(400).json({ error: "Choose the dates you need it." });
    const quantity = Math.min(1000, Math.max(1, Math.round(Number(b.quantity) || 1)));
    const offer = mode === "buy" ? money(b.offer) || l.salePrice || 0 : null;
    const rate = mode === "buy" ? offer! : l.kind === "gear" ? l.rent!.amount : l.price?.amount || 0;
    const unit = mode === "buy" ? "item" : l.kind === "gear" ? l.rent!.unit : l.price?.unit || "job";
    const estimate = Math.round(rate * quantity * 100) / 100;
    const name = text(b.name, 80) || String(req.user!.name || email.split("@")[0]);
    const phone = text(b.phone, 40);
    const message = text(b.message, 2000);
    const details = [
      { label: "Marketplace", value: `${mode === "buy" ? "Wants to buy" : mode === "rent" ? "Wants to rent" : "Wants to book"}: ${l.title}` },
      ...(from ? [{ label: mode === "rent" ? "From" : "Date", value: from }] : []),
      ...(to ? [{ label: "Until", value: to }] : []),
      ...(mode === "buy" && offer !== l.salePrice ? [{ label: "Offer", value: `FJD ${offer!.toFixed(2)} (asking ${l.salePrice?.toFixed(2)})` }] : [])
    ];

    if (l.managed || !l.ownerUid) {
      const ref = getAdminDb().collection(REQUESTS).doc();
      const now = new Date().toISOString();
      const request = {
        id: ref.id, listingId: l.id, listingTitle: l.title, providerName: l.providerName, mode,
        requesterUid: uid, name, email, phone, message, from, to, quantity, rate, unit, estimate,
        offer, status: "new", commissionPercent: l.agent?.commissionPercent ?? null, commissionAmount: null, notes: "",
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
      checked: { items: [{ serviceId: `mkt_${l.id}`, name: l.title, unit, rate, quantity }], estimate, details, ...(from ? { eventDate: from } : {}) } as any,
      contact: { name, email, phone, message },
      channel: "marketplace",
      extra: { requesterUid: uid, listingId: l.id, marketplaceMode: mode }
    });
    res.json({ ok: true, requestId: request.id });
  }));
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
    const fields = cleanListing(req.body || {}, kind);
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
    const editing = ["title", "description", "industry", "category", "city", "forRent", "forSale", "rent", "salePrice", "condition", "brand", "model", "price"].some(k => k in b);
    const fields = editing ? cleanListing({ ...l, ...b }, l.kind) : {};
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
  return router;
}

export const _test = { cleanListing, filterListings };
