import express, { type NextFunction, type Response } from "express";
import { getAdminDb, rateLimit } from "./security";
import { acceptQuote, reportPayment } from "./portal";

// Public "view online" links: /?doc=<shareToken>. Whoever holds the link (the client the document
// was sent to) can see that one issued document and act on it. Nothing else is reachable.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

async function findSharedDocument(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const snap = await getAdminDb().collection("documents").where("shareToken", "==", token).limit(5).get();
  if (snap.empty) return null;
  // Prefer the owner-namespaced copy if an older un-namespaced copy still exists.
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  const best = docs.find(d => d.id === `${d.data.consultantId}_${d.data.id}`) || docs[0];
  return best.data;
}

function publicView(d: any) {
  const {
    consultantId, consultantEmail, shareToken, clientEmail,
    businessName, businessColorTheme, businessLogoType, businessLogoSymbol, businessLogoText,
    businessLogoUrl, businessBrandSlogan, businessAddress, businessEmail, businessPhone,
    businessTin, businessBankDetails, businessMPaisaId, businessMyCashId,
    clientName, ...document
  } = d;
  return {
    document,
    client: { name: clientName || "" },
    business: {
      name: businessName || "",
      colorTheme: businessColorTheme || "#0284c7",
      logoType: businessLogoType, logoSymbol: businessLogoSymbol, logoText: businessLogoText, logoUrl: businessLogoUrl,
      brandSlogan: businessBrandSlogan, address: businessAddress, email: businessEmail, phone: businessPhone,
      tin: businessTin, bankDetails: businessBankDetails, mPaisaId: businessMPaisaId, myCashId: businessMyCashId
    }
  };
}

function asyncRouter() {
  const router = express.Router();
  for (const method of ["get", "post"] as const) {
    const original = router[method].bind(router) as any;
    (router as any)[method] = (path: string, ...handlers: any[]) =>
      original(path, ...handlers.map(h => (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)));
  }
  return router;
}

export function createPublicDocumentsRouter() {
  const router = asyncRouter();
  router.use(rateLimit({ name: "public-doc", max: 60, windowMs: 60_000, key: req => req.ip || "anon" }));

  router.get("/:token", async (req, res) => {
    const d = await findSharedDocument(req.params.token);
    if (!d) return res.status(404).json({ error: "This document link isn't valid. Ask the sender for a new link." });
    if (d.status === "draft") return res.status(404).json({ error: "This document hasn't been issued yet. Please check back later or contact the sender." });
    res.json(publicView(d));
  });

  router.post("/:token/accept", async (req, res) => {
    const d = await findSharedDocument(req.params.token);
    if (!d || d.status === "draft") return res.status(404).json({ error: "Document not found." });
    const result = await acceptQuote({ consultantId: d.consultantId, clientId: d.clientId }, d.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  router.post("/:token/report-payment", async (req, res) => {
    const d = await findSharedDocument(req.params.token);
    if (!d || d.status === "draft") return res.status(404).json({ error: "Document not found." });
    const result = await reportPayment({ consultantId: d.consultantId, clientId: d.clientId }, d.id, req.body?.method, req.body?.reference);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[public-doc] Request failed:", err?.message || err);
    res.status(500).json({ error: "Documents are temporarily unavailable. Please try again shortly." });
  });

  return router;
}
