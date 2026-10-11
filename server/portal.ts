import { notifyConsultant, later } from "./notify";
import { sendDocumentFile } from "./files";
import express, { type Response, type NextFunction } from "express";
import {
  getAdminDb, requireUser, rateLimit, isEmail, sha256, randomToken, hashPin, verifyPin,
  signPortalSession, verifyPortalSession, type AuthedRequest, type PortalClaims
} from "./security";

// Server-only collection; Firestore rules deny all browser access.
const ACCESS = "portal_access";

function accessDocId(consultantId: string, email: string) {
  return `${consultantId}_${sha256(email).slice(0, 32)}`;
}

function normEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

const PUBLIC_BUSINESS_FIELDS = [
  "id", "name", "colorTheme", "logoType", "logoSymbol", "logoText", "logoUrl", "brandSlogan",
  "address", "email", "phone", "tin", "bankDetails", "mPaisaId", "myCashId", "currency", "isPrimary"
];
const PUBLIC_CLIENT_FIELDS = ["id", "name", "email", "phone", "company", "address", "currency", "tin", "subscriptions"];
const PUBLIC_SERVICE_FIELDS = ["id", "name", "description", "rate", "unit", "category", "currency", "billingCycle", "isSubscription"];

function pick<T extends Record<string, any>>(obj: T | undefined | null, keys: string[]) {
  if (!obj) return null;
  const out: Record<string, any> = {};
  keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

async function loadWorkspace(consultantId: string) {
  const snap = await getAdminDb().collection("consultants").doc(consultantId).get();
  return snap.exists ? (snap.data() as any) : null;
}

function findClient(workspace: any, clientId: string, email: string) {
  return (workspace?.clients || []).find((c: any) =>
    c.id === clientId || (email && normEmail(c.email) === email)
  ) || null;
}

interface PortalRequest extends AuthedRequest {
  portal?: PortalClaims;
}

async function requirePortal(req: PortalRequest, res: Response, next: NextFunction) {
  const match = (req.headers.authorization || "").match(/^Portal (.+)$/);
  const claims = match ? verifyPortalSession(match[1]) : null;
  if (!claims) return res.status(401).json({ error: "Your portal session has expired. Please open your link again." });
  // Revoking access ends existing sessions too.
  const access = await getAdminDb().collection(ACCESS).doc(accessDocId(claims.consultantId, claims.email)).get();
  if (!access.exists || (!access.data()?.tokenHash && !access.data()?.pinHash)) {
    return res.status(401).json({ error: "Portal access has been revoked. Please contact your consultant." });
  }
  req.portal = claims;
  next();
}

function sessionResponse(claims: Omit<PortalClaims, "exp">) {
  const { token, exp } = signPortalSession(claims);
  return { sessionToken: token, email: claims.email, clientName: claims.clientName, expiresAt: exp };
}

/** Updates a document both in the flat collection and inside the consultant's workspace. */
export async function updateClientDocument(
  claims: Pick<PortalClaims, "consultantId" | "clientId">,
  documentId: string,
  check: (current: any) => string | null,
  patch: (current: any) => Record<string, any>
): Promise<{ status: number; error?: string; doc?: any }> {
  const db = getAdminDb();
  // Flat copies are keyed "{consultantId}_{documentId}"; older builds used the bare id.
  const namespacedRef = db.collection("documents").doc(`${claims.consultantId}_${documentId}`);
  const flatRef = (await namespacedRef.get()).exists ? namespacedRef : db.collection("documents").doc(documentId);
  const workspaceRef = db.collection("consultants").doc(claims.consultantId);

  return db.runTransaction(async tx => {
    const [flatSnap, wsSnap] = await Promise.all([tx.get(flatRef), tx.get(workspaceRef)]);
    const flat = flatSnap.exists ? flatSnap.data() : null;
    if (!flat || flat.consultantId !== claims.consultantId || flat.clientId !== claims.clientId || flat.status === "draft") {
      return { status: 404, error: "Document not found." };
    }
    const problem = check(flat);
    if (problem) return { status: 409, error: problem };

    const changes = { ...patch(flat), updatedAt: new Date().toISOString() };
    tx.update(flatRef, changes);
    if (wsSnap.exists) {
      const ws = wsSnap.data() as any;
      const documents = (ws.documents || []).map((d: any) => d.id === documentId ? { ...d, ...changes } : d);
      tx.update(workspaceRef, { documents, updatedAt: changes.updatedAt });
    }
    return { status: 200, doc: { ...flat, ...changes } };
  });
}

function money(d: any) {
  return `${d.currency || "FJD"} $${Number(d.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Express 4 does not catch rejected promises from async handlers; forward them to the error handler.
type DocumentOwner = Pick<PortalClaims, "consultantId" | "clientId">;

/** Accepts a sent quote on behalf of its client. */
export function acceptQuote(owner: DocumentOwner, documentId: string) {
  return updateClientDocument(
    owner, documentId,
    d => d.type !== "quote" ? "Only quotes can be accepted." : d.status === "accepted" ? "This quote is already accepted." : d.status !== "sent" ? "This quote can no longer be accepted." : null,
    () => ({ status: "accepted", acceptedAt: new Date().toISOString() })
  ).then(result => {
    if (result.doc) later(notifyConsultant(owner.consultantId, {
      subject: `Quote ${result.doc.documentNumber} accepted by ${result.doc.clientName || "your client"}`,
      heading: "A client accepted your quote",
      lines: [`${result.doc.clientName || "Your client"} accepted quote ${result.doc.documentNumber} (${money(result.doc)}).`, "You can now turn it into an invoice."],
      actionLabel: "Open Frilensa",
      actionPath: "/?tab=dashboard"
    }));
    return result;
  });
}

/** Records a payment the client says they made; the consultant confirms it. Status is unchanged. */
export async function reportPayment(owner: DocumentOwner, documentId: string, rawMethod: unknown, rawReference: unknown) {
  const method = String(rawMethod || "").slice(0, 60).trim();
  const reference = String(rawReference || "").slice(0, 120).trim();
  if (!method || !reference) return { status: 400, error: "Enter the payment method and transaction reference." };
  const reportedAt = new Date().toISOString();
  return updateClientDocument(
    owner, documentId,
    d => d.type !== "invoice" ? "Payments can only be reported against invoices." : d.status === "paid" ? "This invoice is already marked as paid." : null,
    d => ({
      clientPaymentReport: { method, reference, reportedAt, status: "pending" },
      notes: `${d.notes || ""}\n[Client reported payment on ${reportedAt.slice(0, 10)}: ${method}, ref ${reference}. Awaiting confirmation.]`.trim()
    })
  ).then(result => {
    if (result.doc) later(notifyConsultant(owner.consultantId, {
      subject: `Payment reported for ${result.doc.documentNumber}: please confirm`,
      heading: "A client reported a payment",
      lines: [
        `${result.doc.clientName || "Your client"} says they paid invoice ${result.doc.documentNumber} (${money(result.doc)}).`,
        `Method: ${method}. Reference: ${reference}.`,
        "Check your account, then confirm or reject it in your payments inbox."
      ],
      actionLabel: "Review payment",
      actionPath: "/?tab=dashboard"
    }));
    return result;
  });
}

function asyncRouter() {
  const router = express.Router();
  for (const method of ["get", "post"] as const) {
    const original = router[method].bind(router) as any;
    (router as any)[method] = (path: string, ...handlers: any[]) =>
      original(path, ...handlers.map(h => (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)));
  }
  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[portal] Request failed:", err?.message || err);
    res.status(500).json({ error: "The portal is temporarily unavailable. Please try again shortly." });
  });

  return router;
}

export function createPortalRouter() {
  const router = asyncRouter();

  // ----- Consultant-managed access (Firebase-authenticated) -----

  router.post("/admin/link", requireUser, rateLimit({ name: "portal-admin", max: 60, windowMs: 60_000 }), async (req: AuthedRequest, res) => {
    const email = normEmail(req.body?.email);
    const clientId = String(req.body?.clientId || "");
    if (!isEmail(email) || !clientId) return res.status(400).json({ error: "The client needs a valid email address." });
    const consultantId = req.user!.uid;
    const token = randomToken();
    await getAdminDb().collection(ACCESS).doc(accessDocId(consultantId, email)).set({
      consultantId, email, clientId,
      clientName: String(req.body?.clientName || "").slice(0, 200),
      tokenHash: sha256(token),
      tokenCreatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    res.json({ token });
  });

  router.post("/admin/pin", requireUser, rateLimit({ name: "portal-admin", max: 60, windowMs: 60_000 }), async (req: AuthedRequest, res) => {
    const email = normEmail(req.body?.email);
    const clientId = String(req.body?.clientId || "");
    const pin = String(req.body?.pin || "").trim();
    if (!isEmail(email) || !clientId) return res.status(400).json({ error: "The client needs a valid email address." });
    if (!/^\d{6,10}$/.test(pin)) return res.status(400).json({ error: "PIN must be 6 to 10 digits." });
    const consultantId = req.user!.uid;
    await getAdminDb().collection(ACCESS).doc(accessDocId(consultantId, email)).set({
      consultantId, email, clientId,
      clientName: String(req.body?.clientName || "").slice(0, 200),
      pinHash: hashPin(pin),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    res.json({ ok: true });
  });

  router.post("/admin/revoke", requireUser, async (req: AuthedRequest, res) => {
    const email = normEmail(req.body?.email);
    if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const consultantId = req.user!.uid;
    const db = getAdminDb();
    await db.collection(ACCESS).doc(accessDocId(consultantId, email)).delete();
    // Clean up credentials written by older builds as well.
    const legacy = await db.collection("clients_auth").doc(email).get();
    if (legacy.exists && legacy.data()?.consultantId === consultantId) {
      const legacyToken = legacy.data()?.accessToken;
      if (legacyToken) await db.collection("client_tokens").doc(String(legacyToken)).delete().catch(() => {});
      await legacy.ref.delete();
    }
    res.json({ ok: true });
  });

  router.get("/admin/status", requireUser, async (req: AuthedRequest, res) => {
    const email = normEmail(req.query.email);
    if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const snap = await getAdminDb().collection(ACCESS).doc(accessDocId(req.user!.uid, email)).get();
    const data = snap.data() || {};
    res.json({ hasPin: Boolean(data.pinHash), hasLink: Boolean(data.tokenHash) });
  });

  // ----- Client sign-in -----

  router.post("/session",
    rateLimit({ name: "portal-login", max: 10, windowMs: 15 * 60_000, key: req => `${req.ip}:${normEmail(req.body?.email) || "token"}` }),
    async (req, res) => {
      const db = getAdminDb();
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";

      if (token) {
        if (token.length > 200) return res.status(400).json({ error: "This link isn't valid. Ask your consultant for a new one." });
        const byHash = await db.collection(ACCESS).where("tokenHash", "==", sha256(token)).limit(1).get();
        if (!byHash.empty) {
          const a = byHash.docs[0].data();
          const ws = await loadWorkspace(a.consultantId);
          if (!findClient(ws, a.clientId, a.email)) return res.status(401).json({ error: "This portal link is no longer active." });
          return res.json(sessionResponse({ consultantId: a.consultantId, clientId: a.clientId, email: a.email, clientName: a.clientName || "" }));
        }

        // Links created by older builds: accepted only while the consultant's client record still holds the
        // same token (revoking it in the app cleared it), then migrated to a hashed credential.
        const legacy = await db.collection("client_tokens").doc(token).get();
        if (legacy.exists) {
          const l = legacy.data() as any;
          const email = normEmail(l.email);
          const ws = await loadWorkspace(l.consultantId);
          const client = findClient(ws, l.clientId, email);
          if (client && client.accessToken === token) {
            await db.collection(ACCESS).doc(accessDocId(l.consultantId, email)).set({
              consultantId: l.consultantId, email, clientId: client.id, clientName: client.name || "",
              tokenHash: sha256(token), tokenCreatedAt: l.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true });
            await legacy.ref.delete().catch(() => {});
            return res.json(sessionResponse({ consultantId: l.consultantId, clientId: client.id, email, clientName: client.name || "" }));
          }
        }
        return res.status(401).json({ error: "This portal link isn't valid any more. Ask your consultant for a new one." });
      }

      const email = normEmail(req.body?.email);
      const pin = String(req.body?.pin || "").trim();
      if (!isEmail(email) || !pin) return res.status(400).json({ error: "Enter your email and PIN." });
      const candidates = await db.collection(ACCESS).where("email", "==", email).limit(20).get();
      for (const d of candidates.docs) {
        const a = d.data();
        if (verifyPin(pin, a.pinHash)) {
          return res.json(sessionResponse({ consultantId: a.consultantId, clientId: a.clientId, email, clientName: a.clientName || "" }));
        }
      }
      return res.status(401).json({ error: "Email or PIN is incorrect." });
    });

  // ----- Client portal data and actions -----

  router.get("/data", requirePortal, async (req: PortalRequest, res) => {
    const claims = req.portal!;
    const db = getAdminDb();
    const ws = await loadWorkspace(claims.consultantId);
    const client = findClient(ws, claims.clientId, claims.email);
    if (!ws || !client) return res.status(404).json({ error: "Your account could not be found. Please contact your consultant." });

    const businesses: any[] = ws.businesses || [];
    const business = businesses.find(b => b.isPrimary) || businesses[0] || null;

    const docsSnap = await db.collection("documents")
      .where("consultantId", "==", claims.consultantId)
      .where("clientId", "==", client.id)
      .get();
    const byId = new Map<string, any>();
    docsSnap.docs.forEach(snap => {
      const d = snap.data();
      const id = d.id || snap.id;
      const namespaced = snap.id === `${claims.consultantId}_${id}`;
      if (!byId.has(id) || namespaced) byId.set(id, d);
    });
    const documents = [...byId.values()]
      .filter(d => d.status !== "draft")
      .map(d => {
        const { consultantId, consultantEmail, ...rest } = d;
        return rest;
      });

    const msgSnap = await db.collection("support_messages")
      .where("consultantId", "==", claims.consultantId)
      .where("clientEmail", "==", claims.email)
      .get();
    const messages = msgSnap.docs.map(d => d.data())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json({
      client: pick(client, PUBLIC_CLIENT_FIELDS),
      business: pick(business, PUBLIC_BUSINESS_FIELDS),
      documents,
      projects: (ws.projects || []).filter((p: any) => p.clientId === client.id),
      services: (ws.services || []).map((s: any) => pick(s, PUBLIC_SERVICE_FIELDS)),
      messages
    });
  });

  // Receipts attached to one of this client's issued documents.
  router.get("/documents/:id/files/:fileId", requirePortal, async (req: PortalRequest, res, next) => {
    try {
      const claims = req.portal!;
      const db = getAdminDb();
      const namespaced = await db.collection("documents").doc(`${claims.consultantId}_${req.params.id}`).get();
      const d = namespaced.exists ? namespaced.data() : (await db.collection("documents").doc(req.params.id).get()).data();
      if (!d || d.consultantId !== claims.consultantId || d.clientId !== claims.clientId || d.status === "draft") {
        return res.status(404).json({ error: "File not found." });
      }
      await sendDocumentFile(d, req.params.fileId, res);
    } catch (err) {
      next(err);
    }
  });

  router.post("/documents/:id/accept", requirePortal, rateLimit({ name: "portal-action", max: 30, windowMs: 60_000, key: r => (r as PortalRequest).portal!.email }), async (req: PortalRequest, res) => {
    const result = await acceptQuote(req.portal!, req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  router.post("/documents/:id/report-payment", requirePortal, rateLimit({ name: "portal-action", max: 30, windowMs: 60_000, key: r => (r as PortalRequest).portal!.email }), async (req: PortalRequest, res) => {
    const result = await reportPayment(req.portal!, req.params.id, req.body?.method, req.body?.reference);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  router.post("/messages", requirePortal, rateLimit({ name: "portal-msg", max: 20, windowMs: 10 * 60_000, key: r => (r as PortalRequest).portal!.email }), async (req: PortalRequest, res) => {
    const claims = req.portal!;
    const text = String(req.body?.message || "").trim();
    if (!text) return res.status(400).json({ error: "Type a message first." });
    const categories = ["general", "invoice_inquiry", "quote_question", "payment_proof", "urgent_support"];
    const category = categories.includes(req.body?.category) ? req.body.category : "general";
    const ref = getAdminDb().collection("support_messages").doc();
    const message = {
      id: ref.id,
      consultantId: claims.consultantId,
      clientId: claims.clientId,
      clientName: claims.clientName,
      clientEmail: claims.email,
      sender: "client",
      subject: String(req.body?.subject || "Client message").slice(0, 200),
      message: text.slice(0, 5000),
      category,
      ...(req.body?.documentRefId ? { documentRefId: String(req.body.documentRefId).slice(0, 120) } : {}),
      status: "unread",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await ref.set(message);
    later(notifyConsultant(claims.consultantId, {
      subject: `New message from ${claims.clientName || claims.email}`,
      heading: "You have a new client message",
      lines: [`${claims.clientName || claims.email}: ${message.subject}`, message.message.slice(0, 500)],
      actionLabel: "Reply in Frilensa",
      actionPath: "/?tab=dashboard"
    }));
    res.json({ message });
  });

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[portal] Request failed:", err?.message || err);
    res.status(500).json({ error: "The portal is temporarily unavailable. Please try again shortly." });
  });

  return router;
}
