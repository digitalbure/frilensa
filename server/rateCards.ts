import express, { type NextFunction, type Response } from "express";
import crypto from "crypto";
import { getAdminDb, requireUser, rateLimit, isEmail, randomToken, type AuthedRequest } from "./security";
import { notifyConsultant, later } from "./notify";
import { syncBookingStages } from "./webhooks";
import { readWorkspace } from "./workspace";
import { rateCardServices as libRateCardServices } from "../src/lib/bookings";

// Shareable rate cards: /?rates=<token> shows one business's services and rates, read live from the
// workspace, and lets a prospective client ask for a quote. The token-to-workspace mapping lives in
// the server-only `rate_cards` collection; requests land in the server-only `quote_requests`
// collection (not the workspace, so strangers can't fill it) until the consultant acts on them.
const CARDS = "rate_cards";
const REQUESTS = "quote_requests";
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const REQUEST_STATUSES = ["quoted", "dismissed"];

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asyncRouter() {
  const router = express.Router();
  for (const method of ["get", "post", "patch", "delete"] as const) {
    const original = router[method].bind(router) as any;
    (router as any)[method] = (path: string, ...handlers: any[]) =>
      original(path, ...handlers.map(h => (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)));
  }
  return router;
}

function onErrors(router: express.Router, name: string) {
  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error(`[${name}] Request failed:`, err?.message || err);
    res.status(500).json({ error: "Rate cards are temporarily unavailable. Please try again shortly." });
  });
}

/** Services the business lists on its rate card: active, for this business (or all), not hidden. */
export function rateCardServices(data: any, businessId: string) {
  return libRateCardServices(data.services, businessId);
}

async function loadCard(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const snap = await getAdminDb().collection(CARDS).doc(token).get();
  const card = snap.data() as { uid: string; businessId: string } | undefined;
  if (!card) return null;
  const ws = await readWorkspace(card.uid);
  const business = ws?.data.businesses.find(b => b.id === card.businessId);
  // A card stops working if the business was deleted or its link was replaced.
  if (!ws || !business || business.rateCardToken !== token) return null;
  return { card, data: ws.data, business };
}

function logoUrl(url: unknown) {
  const u = typeof url === "string" ? url : "";
  if (/^https:\/\//.test(u) && u.length < 2000) return u;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(u) && u.length < 400_000) return u;
  return "";
}

export function publicCard(data: any, business: any) {
  const profile = data.userProfile || {};
  const vatOn = profile.enableTax !== false && Number(profile.defaultVatRate) > 0;
  return {
    business: {
      name: business.name || "",
      brandSlogan: business.brandSlogan || business.tagline || "",
      colorTheme: /^#[0-9a-fA-F]{3,8}$/.test(business.colorTheme || "") ? business.colorTheme : "#0284c7",
      logoType: business.logoType, logoSymbol: business.logoSymbol, logoText: business.logoText, logoUrl: logoUrl(business.logoUrl),
      email: business.email || "", phone: business.phone || "", address: business.address || ""
    },
    intro: business.rateCardIntro || "",
    currency: profile.defaultCurrency || "FJD",
    vatRate: vatOn ? Number(profile.defaultVatRate) : 0,
    terms: {
      text: business.quoteTerms || "",
      paymentTermsDays: Number(business.paymentTermsDays) || 14,
      quoteValidDays: Number(business.quoteValidDays) || 30
    },
    services: rateCardServices(data, business.id).map((s: any) => ({
      id: s.id, name: s.name || "", description: s.description || "", rate: Number(s.rate) || 0, unit: s.unit || "",
      category: s.category || "", billingInterval: s.billingInterval || "one-time",
      minQuantity: Number(s.minQuantity) > 1 ? Number(s.minQuantity) : 1,
      vat: vatOn && s.isTaxable !== false
    }))
  };
}

/** GET /api/public/rate-cards/:token, POST /api/public/rate-cards/:token/request (no sign-in). */
export function createPublicRateCardsRouter() {
  const router = asyncRouter();
  router.use(rateLimit({ name: "rate-card", max: 60, windowMs: 60_000, key: req => req.ip || "anon" }));

  router.get("/:token", async (req, res) => {
    const found = await loadCard(req.params.token);
    if (!found) return res.status(404).json({ error: "This rate card link isn't valid. Ask the business for a new link." });
    res.setHeader("Cache-Control", "no-store");
    const p = found.business.booking?.page;
    res.json({ ...publicCard(found.data, found.business), bookingUrl: p?.enabled && p.slug ? `/book/${p.slug}` : null });
  });

  router.post("/:token/request",
    rateLimit({ name: "rate-card-request", max: 5, windowMs: 60 * 60_000, key: req => req.ip || "anon" }),
    rateLimit({ name: "rate-card-request-card", max: 30, windowMs: 24 * 60 * 60_000, key: req => String(req.params.token) }),
    async (req, res) => {
      const found = await loadCard(req.params.token);
      if (!found) return res.status(404).json({ error: "This rate card link isn't valid." });
      const body = req.body || {};
      const name = str(body.name, 120);
      const email = isEmail(body.email) ? String(body.email).trim() : "";
      if (!name || !email) return res.status(400).json({ error: "Please add your name and email." });

      const services = new Map(rateCardServices(found.data, found.business.id).map((s: any) => [s.id, s]));
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).flatMap((it: any) => {
        const s: any = services.get(String(it?.serviceId || ""));
        const quantity = Math.round(Number(it?.quantity) * 100) / 100;
        if (!s || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return [];
        return [{ serviceId: s.id, name: s.name || "", unit: s.unit || "", rate: Number(s.rate) || 0, quantity }];
      });
      const message = str(body.message, 3000);
      if (items.length === 0 && !message) return res.status(400).json({ error: "Choose at least one service or describe what you need." });

      const estimate = Math.round(items.reduce((sum: number, it: any) => sum + it.rate * it.quantity, 0) * 100) / 100;
      const ref = getAdminDb().collection(REQUESTS).doc();
      const request = {
        id: ref.id,
        ref: `QR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
        uid: found.card.uid,
        businessId: found.business.id,
        businessName: found.business.name || "",
        name, email,
        phone: str(body.phone, 40),
        company: str(body.company, 120),
        message,
        items,
        currency: found.data.userProfile.defaultCurrency || "FJD",
        estimate,
        status: "new",
        channel: "rate_card",
        createdAt: new Date().toISOString()
      };
      await ref.set(request);
      later(notifyConsultant(found.card.uid, {
        subject: `New booking request ${request.ref} from ${name}`,
        heading: "New booking request from your rate card",
        lines: [
          `${name}${request.company ? ` (${request.company})` : ""} asked for a quote${items.length ? ` for ${items.map((i: any) => `${i.quantity} × ${i.name}`).join(", ")}` : ""}.`,
          message ? `Their note: ${message.slice(0, 500)}` : "",
          `Reply to ${email}, or create the quote in Frilensa.`
        ].filter(Boolean),
        actionLabel: "View booking request",
        actionPath: "/?tab=dashboard"
      }));
      res.json({ ok: true, ref: request.ref });
    });

  onErrors(router, "rate-card");
  return router;
}

/** /api/rate-cards: turn a business's rate card link on or off, and handle quote requests. */
export function createRateCardsRouter() {
  const router = asyncRouter();
  router.use(requireUser);
  router.use(rateLimit({ name: "rate-cards", max: 120, windowMs: 60_000 }));

  // Registers a new link for a business. The browser saves the token on the business, which
  // also retires any earlier link (loadCard checks the business's current token).
  router.post("/", async (req: AuthedRequest, res) => {
    const uid = req.user!.uid;
    const businessId = str(req.body?.businessId, 100);
    const ws = await readWorkspace(uid);
    if (!ws?.data.businesses.some(b => b.id === businessId)) return res.status(404).json({ error: "Business not found." });
    const db = getAdminDb();
    const old = await db.collection(CARDS).where("uid", "==", uid).where("businessId", "==", businessId).limit(20).get();
    const batch = db.batch();
    old.docs.forEach(d => batch.delete(d.ref));
    const token = randomToken(18);
    batch.set(db.collection(CARDS).doc(token), { uid, businessId, createdAt: new Date().toISOString() });
    await batch.commit();
    res.json({ token });
  });

  router.delete("/:token", async (req: AuthedRequest, res) => {
    if (!TOKEN_RE.test(req.params.token)) return res.json({ ok: true });
    const ref = getAdminDb().collection(CARDS).doc(req.params.token);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.uid === req.user!.uid) await ref.delete();
    res.json({ ok: true });
  });

  router.get("/requests", async (req: AuthedRequest, res) => {
    const snap = await getAdminDb().collection(REQUESTS).where("uid", "==", req.user!.uid).where("status", "==", "new").limit(100).get();
    const requests = snap.docs.map(d => d.data()).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ requests });
  });

  router.patch("/requests/:id", async (req: AuthedRequest, res) => {
    const status = req.body?.status;
    if (!REQUEST_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status." });
    const ref = getAdminDb().collection(REQUESTS).doc(String(req.params.id).slice(0, 64));
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.uid !== req.user!.uid) return res.status(404).json({ error: "Request not found." });
    await ref.update({ status, documentId: str(req.body?.documentId, 100), updatedAt: new Date().toISOString() });
    later(syncBookingStages(req.user!.uid));
    res.json({ ok: true });
  });

  onErrors(router, "rate-cards");
  return router;
}
