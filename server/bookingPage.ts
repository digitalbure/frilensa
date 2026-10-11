import express, { type NextFunction, type Response } from "express";
import crypto from "crypto";
import { getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";
import { readWorkspace } from "./workspace";
import { notifyEmail, later } from "./notify";
import { bookingFormWithAvailability, checkDate, saveBookingRequest } from "./bookings";
import { bookableServices, bookingQuestions, checkBooking, BookingError } from "../src/lib/bookings";
import { formatMoney } from "../src/lib/payNow";

// Hosted booking page (/book/<slug>) and the website widget that opens it in an overlay
// (/embed/booking.js). Both are public, so they carry spam guards: IP limits, a honeypot field,
// a signed form token with a minimum fill time, a daily cap per business, and Cloudflare
// Turnstile when TURNSTILE_SECRET is set. Slugs are unique across Frilensa (server-only
// collection `booking_slugs`); the business's own settings say whether its page is on.

const SLUGS = "booking_slugs";
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set([
  "admin", "api", "app", "assets", "auth", "billing", "blog", "book", "booking", "bookings", "dashboard", "docs", "embed",
  "frilensa", "help", "home", "login", "logout", "mcp", "new", "null", "oauth", "pay", "portal", "pricing", "rates",
  "settings", "signin", "signup", "static", "support", "terms", "privacy", "test", "undefined", "www"
]);
const MIN_FILL_MS = () => Number(process.env.BOOKING_MIN_FILL_MS ?? 3000);
const DAILY_CAP = () => Number(process.env.BOOKING_PAGE_DAILY_CAP ?? 50);
const TOKEN_TTL_MS = 24 * 60 * 60_000;

export class PageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3 to 40 lowercase letters, numbers and hyphens, starting and ending with a letter or number.";
  if (RESERVED.has(slug)) return "That address is reserved. Try another.";
  return null;
}

const signKey = () => process.env.PORTAL_SESSION_SECRET || "frilensa-dev-booking";
const sign = (slug: string, ts: number) => crypto.createHmac("sha256", signKey()).update(`book|${slug}|${ts}`).digest("base64url").slice(0, 32);
export const formToken = (slug: string, ts = Date.now()) => `${ts}.${sign(slug, ts)}`;

function checkFormToken(slug: string, token: unknown) {
  const [tsRaw, mac] = String(token || "").split(".");
  const ts = Number(tsRaw);
  if (!ts || !mac || mac.length !== 32 || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(slug, ts)))) {
    throw new PageError(400, "This form has expired. Reload the page and try again.");
  }
  const age = Date.now() - ts;
  if (age > TOKEN_TTL_MS) throw new PageError(400, "This form has expired. Reload the page and try again.");
  if (age < MIN_FILL_MS()) throw new PageError(400, "That was quick. Please check your details and send again.");
}

async function verifyTurnstile(token: unknown, ip?: string) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return;
  const body = new URLSearchParams({ secret, response: String(token || ""), ...(ip ? { remoteip: ip } : {}) });
  const res = await fetch(process.env.TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const json: any = await res.json().catch(() => ({}));
  if (!json.success) throw new PageError(400, "Please complete the check that you're not a robot.");
}

/** The business behind a slug, if its booking page is switched on. */
async function loadPage(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const snap = await getAdminDb().collection(SLUGS).doc(slug).get();
  const owner = snap.data() as { uid: string; businessId: string } | undefined;
  if (!owner) return null;
  const ws = await readWorkspace(owner.uid);
  const business = ws?.data.businesses.find(b => b.id === owner.businessId);
  const page = business?.booking?.page;
  if (!ws || !business || !page?.enabled || page.slug !== slug) return null;
  return { uid: owner.uid, data: ws.data, business };
}

/** The booking page's public link for a business, when its page is on. */
export function bookingPageUrl(business: any) {
  const p = business?.booking?.page;
  return p?.enabled && p.slug ? `/book/${p.slug}` : null;
}

const dailyCounts = new Map<string, { day: string; n: number }>();
function underDailyCap(key: string) {
  const day = new Date().toISOString().slice(0, 10);
  const c = dailyCounts.get(key);
  if (!c || c.day !== day) { dailyCounts.set(key, { day, n: 1 }); return true; }
  if (c.n >= DAILY_CAP()) return false;
  c.n++;
  return true;
}

const asyncHandler = (h: (req: any, res: Response) => Promise<unknown>) => (req: any, res: Response, next: NextFunction) =>
  h(req, res).catch(err => err instanceof PageError ? res.status(err.status).json({ error: err.message }) : next(err));

/** GET /api/public/book/:slug and POST /api/public/book/:slug/request (no sign-in). */
export function createPublicBookingRouter() {
  const router = express.Router();
  router.use(rateLimit({ name: "book-page", max: 60, windowMs: 60_000, key: req => req.ip || "anon" }));

  router.get("/:slug", asyncHandler(async (req, res) => {
    const found = await loadPage(String(req.params.slug));
    if (!found) return res.status(404).json({ error: "This booking page isn't available. Contact the business directly." });
    res.setHeader("Cache-Control", "no-store");
    res.json({ form: await bookingFormWithAvailability(found.uid, found.data, found.business), formToken: formToken(found.business.booking!.page!.slug!), turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null });
  }));

  router.post("/:slug/request", rateLimit({ name: "book-page-send", max: Number(process.env.BOOKING_PAGE_IP_LIMIT ?? 5), windowMs: 60 * 60_000, key: req => req.ip || "anon" }), asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);
    const found = await loadPage(slug);
    if (!found) return res.status(404).json({ error: "This booking page isn't available." });
    const body = req.body || {};
    // Bots fill in every field; people never see this one. Pretend it worked.
    if (body.website) return res.json({ ok: true, ref: `QR-${crypto.randomBytes(3).toString("hex").toUpperCase()}` });
    checkFormToken(slug, body.formToken);
    await verifyTurnstile(body.turnstileToken, req.ip);

    const name = String(body.name || "").trim().slice(0, 120);
    const email = isEmail(body.email) ? String(body.email).trim() : "";
    if (!name || !email) throw new PageError(400, "Please add your name and email.");
    const { uid, data, business } = found;
    let checked;
    try {
      checked = checkBooking(bookableServices(data.services, business), bookingQuestions(business), {
        items: Array.isArray(body.items) ? body.items : [],
        answers: Array.isArray(body.answers) ? body.answers : []
      });
    } catch (err) {
      if (err instanceof BookingError) throw new PageError(400, err.message);
      throw err;
    }
    const message = String(body.message || "").trim().slice(0, 3000);
    if (checked.items.length === 0 && !message && checked.details.length === 0) throw new PageError(400, "Choose at least one service or tell them what you need.");
    const problem = await checkDate(uid, data, business, checked.eventDate);
    if (problem) throw new PageError(409, problem);
    if (!underDailyCap(`${uid}:${business.id}`)) throw new PageError(429, "This business has had a lot of booking requests today. Please contact them directly.");

    const embed = body.embed === true;
    const hostUrl = typeof body.hostUrl === "string" && /^https:\/\/[^\s]{3,2000}$/.test(body.hostUrl) ? body.hostUrl.slice(0, 2000) : "";
    const { request } = await saveBookingRequest({
      uid, data, business, checked,
      contact: { name, email, phone: String(body.phone || "").trim().slice(0, 40), company: String(body.company || "").trim().slice(0, 120), message },
      channel: embed ? "widget" : "booking_page",
      ...(embed ? { source: { app: hostUrl ? new URL(hostUrl).host : "Website", url: hostUrl } } : {})
    });

    // Optional acknowledgement to the person who just sent the form. Nothing about documents or payments.
    if (business.booking?.page?.ackEmail) {
      const r = request;
      later(notifyEmail(email, {
        subject: `We've got your booking request ${r.ref}`,
        heading: `Thanks, ${name}`,
        lines: [
          `${business.name || "The business"} has your booking request (${r.ref}). They'll be in touch.`,
          ...r.items.map((i: any) => `${i.quantity} × ${i.name}`),
          ...r.details.map((d: any) => `${d.label}: ${d.value}`),
          r.estimate > 0 ? `Estimate: ${formatMoney(r.currency, r.estimate)} before VAT. The quote you receive may differ.` : "",
          business.booking?.afterMessage || ""
        ].filter(Boolean),
        actionLabel: "",
        actionPath: "",
        fromName: business.name || "Frilensa",
        replyTo: business.email,
        footer: `Sent by Frilensa for ${business.name || "the business"}. Reply to this email to contact them.`
      }));
    }
    res.json({ ok: true, ref: request.ref, afterMessage: business.booking?.afterMessage || "" });
  }));

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[book-page] Request failed:", err?.message || err);
    res.status(500).json({ error: "Booking is temporarily unavailable. Please try again shortly." });
  });
  return router;
}

/** /api/booking-page: claim an address for a business's booking page. */
export function createBookingPageRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "booking-page-settings", max: 30, windowMs: 60_000 }));

  router.put("/", asyncHandler(async (req: AuthedRequest, res) => {
    const uid = req.user!.uid;
    const businessId = String(req.body?.businessId || "");
    const slug = String(req.body?.slug || "").trim().toLowerCase();
    const problem = slugProblem(slug);
    if (problem) throw new PageError(400, problem);
    const ws = await readWorkspace(uid);
    if (!ws?.data.businesses.some(b => b.id === businessId)) throw new PageError(404, "Business not found.");
    const db = getAdminDb();
    const ref = db.collection(SLUGS).doc(slug);
    const old = await db.collection(SLUGS).where("uid", "==", uid).where("businessId", "==", businessId).limit(10).get();
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const owner = snap.data();
      if (owner && (owner.uid !== uid || owner.businessId !== businessId)) throw new PageError(409, "That address is taken. Try another.");
      old.docs.filter(d => d.id !== slug).forEach(d => tx.delete(d.ref));
      tx.set(ref, { uid, businessId, createdAt: owner?.createdAt || new Date().toISOString() });
    });
    res.json({ slug });
  }));

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[booking-page] Request failed:", err?.message || err);
    res.status(500).json({ error: "Couldn't save the booking page. Please try again." });
  });
  return router;
}
