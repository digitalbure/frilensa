import express, { type NextFunction, type Response } from "express";
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import { getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";
import { readWorkspace } from "./workspace";
import { encryptSecret, decryptSecret, secretsConfigured } from "./secrets";
import type { CRMData } from "../src/types";

// Webhooks: a user's endpoints get booking events as they happen. Each delivery is signed
// (HMAC-SHA256 over "<timestamp>.<raw body>" with the endpoint's secret) and retried with backoff
// for 24 hours. Endpoints (secret encrypted) live in the server-only `webhooks` collection,
// deliveries in `webhook_deliveries`.

export const WEBHOOK_EVENTS = ["booking_request.created", "booking_request.stage_changed"] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
const HOOKS = "webhooks";
const DELIVERIES = "webhook_deliveries";
const MAX_HOOKS = 10;
const RETRY_FOR_MS = 24 * 60 * 60_000;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000];
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "1"; // tests only

interface Hook { id: string; uid: string; url: string; events: WebhookEvent[]; secret: string; createdAt: string; active: boolean }

class HookError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function privateAddress(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Rejects non-https URLs and ones that point at private or internal addresses. */
async function checkUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new HookError(400, "Enter a full https:// URL."); }
  if (allowPrivate()) return u;
  if (u.protocol !== "https:") throw new HookError(400, "Webhook URLs must use https.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") throw new HookError(400, "That address can't receive webhooks.");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new HookError(400, "That address can't be found.");
  if (addrs.some(a => privateAddress(a.address))) throw new HookError(400, "That address can't receive webhooks.");
  return u;
}

export function signPayload(secret: string, timestamp: string, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Queues an event for every active endpoint of the user that wants it, and tries to send it now. */
export async function emitEvent(uid: string, event: WebhookEvent, data: Record<string, unknown>) {
  try {
    const hooks = (await getAdminDb().collection(HOOKS).where("uid", "==", uid).limit(MAX_HOOKS).get()).docs
      .map(d => d.data() as Hook).filter(h => h.active !== false && h.events.includes(event));
    await Promise.all(hooks.map(h => queue(h, event, data)));
  } catch (err: any) {
    console.warn("[webhooks] Could not queue event:", err?.message || err);
  }
}

async function queue(h: Hook, event: string, data: Record<string, unknown>, test = false) {
  const ref = getAdminDb().collection(DELIVERIES).doc();
  const now = new Date().toISOString();
  const payload = JSON.stringify({ id: ref.id, event, createdAt: now, ...(test ? { test: true } : {}), ...data });
  await ref.set({ id: ref.id, webhookId: h.id, uid: h.uid, event, payload, attempts: 0, status: "pending", nextAttemptAt: now, createdAt: now, test });
  await attempt(ref.id);
  return ref.id;
}

/** One delivery attempt. Claims the delivery first so two instances don't send it twice. */
async function attempt(deliveryId: string) {
  const db = getAdminDb();
  const ref = db.collection(DELIVERIES).doc(deliveryId);
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || d.status !== "pending" || (d.lockedUntil && d.lockedUntil > Date.now())) return null;
    tx.update(ref, { lockedUntil: Date.now() + 30_000 });
    return d;
  });
  if (!claimed) return;
  const hookSnap = await db.collection(HOOKS).doc(claimed.webhookId).get();
  const hook = hookSnap.data() as Hook | undefined;
  if (!hook || hook.active === false) {
    await ref.update({ status: "failed", lastError: "Endpoint removed", lockedUntil: 0 });
    return;
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  let status = 0, error = "";
  try {
    await checkUrl(hook.url);
    const res = await fetch(hook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Frilensa-Webhooks/1",
        "Frilensa-Event": claimed.event,
        "Frilensa-Delivery": deliveryId,
        "Frilensa-Timestamp": timestamp,
        "Frilensa-Signature": `t=${timestamp},v1=${signPayload(decryptSecret(hook.secret), timestamp, claimed.payload)}`
      },
      body: claimed.payload
    });
    status = res.status;
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (err: any) {
    error = err?.message || "Request failed";
  }
  const attempts = (claimed.attempts || 0) + 1;
  const now = Date.now();
  if (!error) {
    await ref.update({ status: "delivered", attempts, lastStatus: status, lastError: "", deliveredAt: new Date(now).toISOString(), lockedUntil: 0 });
    return;
  }
  const next = now + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
  const giveUp = claimed.test || next - new Date(claimed.createdAt).getTime() > RETRY_FOR_MS;
  await ref.update({
    status: giveUp ? "failed" : "pending", attempts, lastStatus: status || null, lastError: error.slice(0, 300),
    nextAttemptAt: new Date(next).toISOString(), lockedUntil: 0
  });
}

/** Retries deliveries that are due. Runs every minute while the server is up, and from the daily job. */
export async function retryDueDeliveries(limit = 50) {
  try {
    const snap = await getAdminDb().collection(DELIVERIES).where("status", "==", "pending").limit(500).get();
    const now = new Date().toISOString();
    const due = snap.docs.map(d => d.data()).filter(d => d.nextAttemptAt <= now).slice(0, limit);
    for (const d of due) await attempt(d.id);
    return due.length;
  } catch (err: any) {
    console.warn("[webhooks] Retry sweep failed:", err?.message || err);
    return 0;
  }
}

let timer: NodeJS.Timeout | null = null;
export function startWebhookRetries() {
  if (timer) return;
  timer = setInterval(() => { retryDueDeliveries().catch(() => {}); }, 60_000);
  timer.unref();
}

// ---------- Stage changes ----------

/**
 * Works out every booking request's stage and fires booking_request.stage_changed for those that
 * moved since last time. Called after server-side changes, after the browser saves documents,
 * and from the daily job. Only users with a stage_changed endpoint are checked; the first check
 * after an endpoint is added records stages without firing.
 */
export async function syncBookingStages(uid: string, data?: CRMData) {
  try {
    const db = getAdminDb();
    const hooks = (await db.collection(HOOKS).where("uid", "==", uid).limit(MAX_HOOKS).get()).docs.map(d => d.data() as Hook)
      .filter(h => h.active !== false && h.events.includes("booking_request.stage_changed"));
    if (!hooks.length) return 0;
    const { bookingView, REQUESTS } = await import("./bookings");
    const ws = data || (await readWorkspace(uid))?.data;
    if (!ws) return 0;
    const snap = await db.collection(REQUESTS).where("uid", "==", uid).limit(2000).get();
    let fired = 0;
    for (const doc of snap.docs) {
      const r = doc.data();
      const view = bookingView(r, ws.documents);
      if (r.lastStage === view.stage) continue;
      await doc.ref.update({ lastStage: view.stage });
      if (r.lastStage === undefined && view.stage === "new") continue;
      if (r.lastStage === undefined && r.createdAt < (hooks.map(h => h.createdAt).sort()[0] || "")) continue; // baseline for older requests
      await Promise.all(hooks.map(h => queue(h, "booking_request.stage_changed", { previousStage: r.lastStage ?? null, bookingRequest: view })));
      fired++;
    }
    return fired;
  } catch (err: any) {
    console.warn("[webhooks] Stage sync failed:", err?.message || err);
    return 0;
  }
}

/** Daily: stage checks for every user with endpoints, then due retries. */
export async function dailyWebhookSweep() {
  const snap = await getAdminDb().collection(HOOKS).limit(5000).get();
  const uids = [...new Set(snap.docs.map(d => d.data().uid as string))];
  let fired = 0;
  for (const uid of uids) fired += await syncBookingStages(uid);
  const retried = await retryDueDeliveries(500);
  return { webhookUsers: uids.length, stageEvents: fired, retried };
}

// ---------- Settings routes ----------

const view = (h: Hook) => ({ id: h.id, url: h.url, events: h.events, createdAt: h.createdAt, active: h.active !== false });

/** /api/webhooks (signed in): manage endpoints. /api/events/document-changed: the browser saved documents. */
export function createWebhooksRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "webhooks", max: 60, windowMs: 60_000 }));
  const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) =>
    h(req, res).catch(err => err instanceof HookError ? res.status(err.status).json({ error: err.message }) : next(err));
  const own = async (uid: string, id: string) => {
    const snap = await getAdminDb().collection(HOOKS).doc(String(id).slice(0, 64)).get();
    const h = snap.data() as Hook | undefined;
    if (!h || h.uid !== uid) throw new HookError(404, "Webhook not found.");
    return h;
  };

  router.get("/", wrap(async (req, res) => {
    const snap = await getAdminDb().collection(HOOKS).where("uid", "==", req.user!.uid).limit(MAX_HOOKS).get();
    res.json({ configured: secretsConfigured(), events: WEBHOOK_EVENTS, webhooks: snap.docs.map(d => view(d.data() as Hook)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
  }));

  router.post("/", wrap(async (req, res) => {
    if (!secretsConfigured()) throw new HookError(503, "Webhooks aren't set up on this server yet.");
    const uid = req.user!.uid;
    const url = (await checkUrl(String(req.body?.url || "").trim().slice(0, 2000))).toString();
    const events = (Array.isArray(req.body?.events) ? req.body.events : []).filter((e: string) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (!events.length) throw new HookError(400, "Choose at least one event.");
    const db = getAdminDb();
    const existing = await db.collection(HOOKS).where("uid", "==", uid).limit(MAX_HOOKS).get();
    if (existing.size >= MAX_HOOKS) throw new HookError(409, `You can have up to ${MAX_HOOKS} webhooks.`);
    const ref = db.collection(HOOKS).doc();
    const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
    const hook: Hook = { id: ref.id, uid, url, events, secret: encryptSecret(secret), createdAt: new Date().toISOString(), active: true };
    await ref.set(hook);
    // Shown once; Frilensa keeps it encrypted to sign deliveries.
    res.json({ webhook: view(hook), secret });
  }));

  router.delete("/:id", wrap(async (req, res) => {
    const h = await own(req.user!.uid, req.params.id);
    await getAdminDb().collection(HOOKS).doc(h.id).delete();
    res.json({ ok: true });
  }));

  router.post("/:id/test", wrap(async (req, res) => {
    const h = await own(req.user!.uid, req.params.id);
    const id = await queue(h, "booking_request.created", {
      bookingRequest: { id: "test", ref: "QR-TEST00", channel: "api", status: "new", stage: "new", source: { app: "Test", reference: "TEST", url: null }, details: [{ label: "Test", value: "This is a test delivery from Frilensa" }] }
    }, true);
    const d = (await getAdminDb().collection(DELIVERIES).doc(id).get()).data();
    res.json({ delivery: { id, status: d?.status, lastStatus: d?.lastStatus ?? null, lastError: d?.lastError || "" } });
  }));

  router.get("/:id/deliveries", wrap(async (req, res) => {
    const h = await own(req.user!.uid, req.params.id);
    const snap = await getAdminDb().collection(DELIVERIES).where("webhookId", "==", h.id).limit(200).get();
    const list = snap.docs.map(d => d.data()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 25)
      .map(d => ({ id: d.id, event: d.event, status: d.status, attempts: d.attempts, lastStatus: d.lastStatus ?? null, lastError: d.lastError || "", createdAt: d.createdAt, test: Boolean(d.test) }));
    res.json({ deliveries: list });
  }));

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[webhooks] Request failed:", err?.message || err);
    res.status(500).json({ error: "Webhooks are temporarily unavailable." });
  });
  return router;
}

export function createEventsRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "events", max: 30, windowMs: 60_000 }));
  router.post("/document-changed", async (req: AuthedRequest, res) => {
    const fired = await syncBookingStages(req.user!.uid);
    res.json({ ok: true, stageEvents: fired });
  });
  return router;
}
