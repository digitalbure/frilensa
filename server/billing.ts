import express, { type Response, type NextFunction } from "express";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";
import { getPlatformConfig } from "./platformConfig";
import { updateWorkspace, readWorkspace, readPlans, WorkspaceMissing } from "./workspace";
import { notifyEmail, later } from "./notify";
import { formatMoney } from "../src/lib/payNow";
import {
  addDays, daysLeft, effectivePlan, isPaidPlan, limitProblem, paypalCharge, periodEnd, planPrice,
  type BillingCycle, type BillingSettings, type LimitKind, type PayMethod, type Subscription
} from "../src/lib/billing";
import type { PlanTier } from "../src/types";

// Paid plans (see src/lib/billing.ts). Server-only collections (firestore.rules deny browser access):
//   subscriptions/{uid}             the plan someone has paid for (or was given)
//   subscription_payments/{id}      payments: manual ones waiting for an admin, and PayPal ones
//   ai_usage/{uid}_{YYYY-MM}        AI scans used this month
// Payments go to Frilensa (not to a business): manual transfers an admin approves, or PayPal with
// Frilensa's own keys (FRILENSA_PAYPAL_CLIENT_ID, FRILENSA_PAYPAL_SECRET, FRILENSA_PAYPAL_ENV).

export const SUBS = "subscriptions";
export const PAYMENTS = "subscription_payments";
export const AI_USAGE = "ai_usage";

export class BillingError extends Error { constructor(public status: number, message: string) { super(message); } }
const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(err => {
  if (err instanceof BillingError) return res.status(err.status).json({ error: err.message });
  next(err);
});
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Fiji", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const month = () => today().slice(0, 7);
const adminEmails = () => String(process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const PLAN_NAMES: Record<string, string> = { free: "Free", pro: "Pro", premium: "Premium" };

async function settings(): Promise<{ billing: BillingSettings; plans: any }> {
  const { config } = await getPlatformConfig();
  return { billing: config.billing, plans: config.plans };
}

export async function getSubscription(uid: string): Promise<Subscription | null> {
  return ((await getAdminDb().collection(SUBS).doc(uid).get()).data() as Subscription) || null;
}

/** The plan each of these users is on today (for the directory and other server checks). */
export async function plansFor(uids: string[]): Promise<Map<string, PlanTier>> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return new Map();
  const db = getAdminDb();
  const { billing } = await settings();
  // The plan older versions kept in the workspace counts as an early-access choice.
  const [subs, legacy] = await Promise.all([
    db.getAll(...unique.map(u => db.collection(SUBS).doc(u))),
    readPlans(unique)
  ]);
  const t = today();
  return new Map(subs.map(s => [s.id, effectivePlan(s.exists ? s.data() as Subscription : null, legacy.get(s.id), billing, t)]));
}

export async function planFor(uid: string): Promise<PlanTier> {
  return (await plansFor([uid])).get(uid) || "free";
}

/** Keeps the plan shown in the workspace in step (display only; the server never trusts it). */
async function showPlanInWorkspace(uid: string, plan: PlanTier) {
  try {
    await updateWorkspace(uid, raw => ({ set: { platformSettings: { ...(raw.platformSettings || {}), activePlan: plan } }, result: null }));
  } catch (err) {
    if (!(err instanceof WorkspaceMissing)) throw err;
  }
}

/**
 * Starts or extends a paid period. The same plan extends from the end of the current period; a
 * different plan starts today.
 */
export async function activatePlan(uid: string, plan: PlanTier, cycle: BillingCycle, method: PayMethod, note = "") {
  const db = getAdminDb();
  const ref = db.collection(SUBS).doc(uid);
  const t = today();
  const sub = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data() as Subscription | undefined;
    const extending = current && current.plan === plan && current.status === "active" && current.paidUntil && current.paidUntil >= t && current.method !== "early_access";
    const start = extending ? addDays(current!.paidUntil, 1) : t;
    const next: Subscription = { uid, plan, status: "active", method, cycle, paidUntil: periodEnd(start, cycle), updatedAt: new Date().toISOString(), ...(note ? { note } : {}) };
    tx.set(ref, { ...next, remindedFor: "" });
    return next;
  });
  await showPlanInWorkspace(uid, plan);
  return sub;
}

/** Admins set a plan directly (a gift, a deal, or a correction). Free ends any paid time. */
export async function grantPlan(uid: string, plan: PlanTier, until: string, note: string) {
  const sub: Subscription = { uid, plan, status: "active", method: "admin", paidUntil: plan === "free" ? "" : until, updatedAt: new Date().toISOString(), ...(note ? { note } : {}) };
  await getAdminDb().collection(SUBS).doc(uid).set({ ...sub, remindedFor: "" });
  await showPlanInWorkspace(uid, plan);
  return sub;
}

/** The price of a plan for a cycle, checked against the current plan list. */
async function priceOf(plan: unknown, cycle: unknown) {
  const { billing, plans } = await settings();
  if (!isPaidPlan(plan)) throw new BillingError(400, "Choose Pro or Premium.");
  const c: BillingCycle = cycle === "annual" ? "annual" : "monthly";
  const amount = planPrice(plans[plan], c);
  if (!(amount > 0)) throw new BillingError(400, "This plan has no price yet. Contact Frilensa.");
  return { plan, cycle: c, amount, name: plans[plan].name as string, billing };
}

// ---------- AI scans ----------

/** Counts one AI scan, or refuses it when the plan's monthly scans are used up (billing on only). */
export async function useAiScan(uid: string) {
  const { billing, plans } = await settings();
  const ref = getAdminDb().collection(AI_USAGE).doc(`${uid}_${month()}`);
  if (!billing.enabled) { await ref.set({ uid, month: month(), scans: FieldValue.increment(1) }, { merge: true }); return null; }
  const plan = await planFor(uid);
  const used = Number((await ref.get()).data()?.scans) || 0;
  const problem = limitProblem(plans[plan], "aiScans", used);
  if (problem) return problem;
  await ref.set({ uid, month: month(), scans: used + 1 }, { merge: true });
  return null;
}

/** Whether one more of something fits the user's plan (server-created items, e.g. through the API). */
export async function serverLimitProblem(uid: string, kind: Exclude<LimitKind, "aiScans">, used: number) {
  const { billing, plans } = await settings();
  if (!billing.enabled) return null;
  return limitProblem(plans[await planFor(uid)], kind, used);
}

// ---------- PayPal (Frilensa's own account) ----------

const ppEnv = () => process.env.FRILENSA_PAYPAL_ENV === "sandbox" ? "sandbox" : "live";
const ppBase = () => process.env.PAYPAL_API_BASE || (ppEnv() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com");
export const paypalConfigured = () => !!(process.env.FRILENSA_PAYPAL_CLIENT_ID && process.env.FRILENSA_PAYPAL_SECRET);

async function paypal(path: string, body?: unknown, requestId?: string) {
  const tokenRes = await fetch(`${ppBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.FRILENSA_PAYPAL_CLIENT_ID}:${process.env.FRILENSA_PAYPAL_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const token: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new BillingError(502, "PayPal couldn't be reached. Please try again, or pay another way.");
  const res = await fetch(`${ppBase()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

// ---------- Routes for the signed-in user ----------

export function createBillingRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "billing", max: 60, windowMs: 60_000 }));

  // Your plan, what you've paid, and how to pay.
  router.get("/", wrap(async (req, res) => {
    const uid = req.user!.uid;
    const db = getAdminDb();
    const [sub, plan, payments, usage, { billing }] = await Promise.all([
      getSubscription(uid), planFor(uid),
      db.collection(PAYMENTS).where("uid", "==", uid).limit(30).get(),
      db.collection(AI_USAGE).doc(`${uid}_${month()}`).get(),
      settings()
    ]);
    const list = payments.docs.map(d => d.data()).filter(p => p.status !== "awaiting_paypal").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({
      plan, subscription: sub, daysLeft: daysLeft(sub, today()), today: today(),
      aiScansUsed: Number(usage.data()?.scans) || 0,
      payments: list.map(({ uid: _u, ...p }) => p),
      billing: { ...billing, paypal: billing.paypal && paypalConfigured(), paypalClientId: billing.paypal && paypalConfigured() ? process.env.FRILENSA_PAYPAL_CLIENT_ID : "" }
    });
  }));

  // Early access: switch plans for free until billing is switched on.
  router.post("/early-access", wrap(async (req, res) => {
    const { billing } = await settings();
    if (billing.enabled) throw new BillingError(400, "Plans are paid now. Choose how you'd like to pay.");
    const plan = ["free", "pro", "premium"].includes(req.body?.plan) ? req.body.plan as PlanTier : null;
    if (!plan) throw new BillingError(400, "Choose Free, Pro or Premium.");
    const sub: Subscription = { uid: req.user!.uid, plan, status: "active", method: "early_access", paidUntil: "", updatedAt: new Date().toISOString() };
    await getAdminDb().collection(SUBS).doc(req.user!.uid).set({ ...sub, remindedFor: "" });
    await showPlanInWorkspace(req.user!.uid, plan);
    res.json({ plan, subscription: sub });
  }));

  // A bank, M-PAiSA or MyCash payment for an admin to check and approve.
  router.post("/manual", rateLimit({ name: "billing-manual", max: 10, windowMs: 60 * 60_000 }), wrap(async (req, res) => {
    const p = await priceOf(req.body?.plan, req.body?.cycle);
    if (!p.billing.enabled) throw new BillingError(400, "Plans are free during early access.");
    const method = ["bank", "mpaisa", "mycash"].includes(req.body?.method) ? req.body.method as PayMethod : null;
    const reference = String(req.body?.reference || "").trim().slice(0, 80);
    if (!method || !(method === "bank" ? p.billing.bankDetails : method === "mpaisa" ? p.billing.mpaisa : p.billing.mycash)) throw new BillingError(400, "Choose a way to pay.");
    if (reference.length < 3) throw new BillingError(400, "Enter the reference or transaction number of your payment.");
    const db = getAdminDb();
    const pending = await db.collection(PAYMENTS).where("uid", "==", req.user!.uid).where("status", "==", "pending").limit(5).get();
    if (pending.size >= 3) throw new BillingError(400, "You have payments waiting to be checked. Frilensa will be in touch soon.");
    const ref = db.collection(PAYMENTS).doc();
    const payment = {
      id: ref.id, uid: req.user!.uid, email: String(req.user!.email || ""), plan: p.plan, planName: p.name, cycle: p.cycle,
      amount: p.amount, currency: "FJD", method, reference, status: "pending", createdAt: new Date().toISOString()
    };
    await ref.set(payment);
    later(Promise.all(adminEmails().map(to => notifyEmail(to, {
      subject: `Plan payment to check: ${payment.planName} (${formatMoney("FJD", payment.amount)})`,
      heading: "A plan payment is waiting for you to check",
      lines: [`${payment.email} says they paid ${formatMoney("FJD", payment.amount)} by ${method === "bank" ? "bank transfer" : method === "mpaisa" ? "M-PAiSA" : "MyCash"} for ${payment.planName} (${payment.cycle}).`, `Reference: ${reference}`, "Approve it in Admin → Billing once it has arrived."],
      actionLabel: "Open the admin panel", actionPath: "/"
    }))));
    const { uid: _u, ...out } = payment;
    res.json({ payment: out });
  }));

  // PayPal: the server creates the order for the plan's price and captures it.
  router.post("/paypal/order", rateLimit({ name: "billing-paypal", max: 20, windowMs: 60 * 60_000 }), wrap(async (req, res) => {
    const p = await priceOf(req.body?.plan, req.body?.cycle);
    if (!p.billing.enabled) throw new BillingError(400, "Plans are free during early access.");
    if (!p.billing.paypal || !paypalConfigured()) throw new BillingError(400, "Card and PayPal payments aren't available yet. Choose another way to pay.");
    const value = paypalCharge(p.amount, p.billing);
    const uid = req.user!.uid;
    const r = await paypal("/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: `plan:${uid}:${p.plan}:${p.cycle}`.slice(0, 127),
        description: `Frilensa ${p.name} (${p.cycle === "annual" ? "1 year" : "1 month"})`.slice(0, 127),
        amount: { currency_code: p.billing.paypalCurrency, value: value.toFixed(2) }
      }],
      application_context: { shipping_preference: "NO_SHIPPING", brand_name: "Frilensa" }
    }, `plan-${uid}-${crypto.randomBytes(6).toString("hex")}`);
    if (!r.ok || !r.json.id) throw new BillingError(502, "PayPal couldn't start the payment. Please try again.");
    await getAdminDb().collection(PAYMENTS).doc(`pp_${r.json.id}`).set({
      id: `pp_${r.json.id}`, uid, email: String(req.user!.email || ""), plan: p.plan, planName: p.name, cycle: p.cycle, amount: p.amount, currency: "FJD",
      charged: value, chargedCurrency: p.billing.paypalCurrency, method: "paypal", reference: r.json.id, status: "awaiting_paypal", createdAt: new Date().toISOString()
    });
    res.json({ orderId: r.json.id });
  }));

  router.post("/paypal/capture", rateLimit({ name: "billing-paypal", max: 20, windowMs: 60 * 60_000 }), wrap(async (req, res) => {
    const orderId = String(req.body?.orderId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
    const db = getAdminDb();
    const ref = db.collection(PAYMENTS).doc(`pp_${orderId}`);
    const payment = (await ref.get()).data();
    if (!orderId || !payment || payment.uid !== req.user!.uid) throw new BillingError(404, "Payment not found.");
    if (payment.status === "approved") return res.json({ ok: true, plan: payment.plan, already: true });
    const r = await paypal(`/v2/checkout/orders/${orderId}/capture`, {}, `capture-${orderId}`);
    const unit = r.json.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const ok = r.ok && r.json.status === "COMPLETED" && capture?.status === "COMPLETED"
      && (capture?.custom_id || unit?.custom_id) === `plan:${payment.uid}:${payment.plan}:${payment.cycle}`.slice(0, 127)
      && capture.amount?.currency_code === payment.chargedCurrency && Number(capture.amount?.value) + 0.005 >= Number(payment.charged);
    if (!ok) {
      await ref.update({ status: "failed", updatedAt: new Date().toISOString() });
      throw new BillingError(402, "PayPal didn't confirm the payment, so your plan hasn't changed. Nothing extra was charged if the payment didn't go through.");
    }
    // Recorded once: a retried capture finds the payment approved.
    const first = await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data();
      if (cur?.status === "approved") return false;
      tx.update(ref, { status: "approved", captureId: capture.id, approvedAt: new Date().toISOString() });
      return true;
    });
    const sub = first ? await activatePlan(payment.uid, payment.plan, payment.cycle, "paypal", `PayPal ${capture.id}`) : await getSubscription(payment.uid);
    if (first) later(notifyEmail(payment.email, {
      subject: `You're on ${payment.planName}`,
      heading: `Thanks, your ${payment.planName} plan is active`,
      lines: [`We received ${formatMoney(payment.chargedCurrency, payment.charged)} by PayPal.`, `Your plan is paid until ${sub?.paidUntil}.`],
      actionLabel: "Open Frilensa", actionPath: "/"
    }));
    res.json({ ok: true, plan: payment.plan, subscription: sub });
  }));
  return router;
}

// ---------- Admin ----------

export function createAdminBillingRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin-billing", max: 120, windowMs: 60_000 }));

  router.get("/", wrap(async (_req, res) => {
    const db = getAdminDb();
    const [payments, subs] = await Promise.all([
      db.collection(PAYMENTS).orderBy("createdAt", "desc").limit(200).get(),
      db.collection(SUBS).limit(1000).get()
    ]);
    const t = today();
    const list = subs.docs.map(d => d.data() as Subscription).filter(s => s.plan !== "free");
    // Owners' emails, to recognise them.
    const emails = new Map<string, string>();
    for (let i = 0; i < list.length; i += 100) {
      const r = await getAuth(getAdminApp()).getUsers(list.slice(i, i + 100).map(x => ({ uid: x.uid }))).catch(() => ({ users: [] as any[] }));
      r.users.forEach((u: any) => emails.set(u.uid, u.email || ""));
    }
    res.json({
      today: t, paypalConfigured: paypalConfigured(),
      payments: payments.docs.map(d => d.data()).filter(p => p.status !== "awaiting_paypal"),
      subscriptions: list.map(s => ({ ...s, email: emails.get(s.uid) || "", daysLeft: daysLeft(s, t) }))
    });
  }));

  router.post("/payments/:id/approve", wrap(async (req, res) => {
    const db = getAdminDb();
    const ref = db.collection(PAYMENTS).doc(String(req.params.id).slice(0, 64));
    const ok = await db.runTransaction(async tx => {
      const p = (await tx.get(ref)).data();
      if (!p || p.status !== "pending") return null;
      tx.update(ref, { status: "approved", approvedAt: new Date().toISOString(), approvedBy: req.user?.email || "" });
      return p;
    });
    if (!ok) throw new BillingError(409, "This payment isn't waiting for approval.");
    const sub = await activatePlan(ok.uid, ok.plan, ok.cycle, ok.method, `${ok.method} ${ok.reference}`);
    later(notifyEmail(ok.email, {
      subject: `You're on ${ok.planName}`,
      heading: `Your payment arrived and ${ok.planName} is active`,
      lines: [`Thanks for your payment of ${formatMoney("FJD", ok.amount)} (reference ${ok.reference}).`, `Your plan is paid until ${sub.paidUntil}.`],
      actionLabel: "Open Frilensa", actionPath: "/"
    }));
    res.json({ ok: true, subscription: sub });
  }));

  router.post("/payments/:id/reject", wrap(async (req, res) => {
    const ref = getAdminDb().collection(PAYMENTS).doc(String(req.params.id).slice(0, 64));
    const p = (await ref.get()).data();
    if (!p || p.status !== "pending") throw new BillingError(409, "This payment isn't waiting for approval.");
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    await ref.update({ status: "rejected", reason, rejectedAt: new Date().toISOString() });
    later(notifyEmail(p.email, {
      subject: "We couldn't find your plan payment",
      heading: "We couldn't match your payment",
      lines: [`We couldn't find your payment of ${formatMoney("FJD", p.amount)} with reference ${p.reference}.`, reason ? `Note from Frilensa: ${reason}` : "", "Reply to this email if you think this is a mistake."].filter(Boolean),
      actionLabel: "Open Frilensa", actionPath: "/"
    }));
    res.json({ ok: true });
  }));

  // Set someone's plan directly. `until` is the last paid day (empty: open-ended).
  router.put("/subscriptions/:uid", wrap(async (req, res) => {
    const uid = String(req.params.uid).slice(0, 128);
    const plan = ["free", "pro", "premium"].includes(req.body?.plan) ? req.body.plan as PlanTier : null;
    if (!plan) throw new BillingError(400, "Choose Free, Pro or Premium.");
    const until = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.until || "") ? req.body.until : "";
    if (!(await readWorkspace(uid))) throw new BillingError(404, "Workspace not found.");
    res.json({ subscription: await grantPlan(uid, plan, until, String(req.body?.note || "").trim().slice(0, 200)) });
  }));
  return router;
}

// ---------- Daily: reminders and expiry ----------

/** Reminds people 7 days and 1 day before a paid plan runs out, and moves lapsed plans back to Free. */
export async function dailyBillingSweep(t = today()) {
  const { billing } = await settings();
  const summary = { billingReminders: 0, plansExpired: 0 };
  if (!billing.enabled) return summary;
  const db = getAdminDb();
  const snap = await db.collection(SUBS).where("status", "==", "active").limit(5000).get();
  for (const d of snap.docs) {
    const s = d.data() as Subscription & { remindedFor?: string };
    if (!isPaidPlan(s.plan) || !s.paidUntil || s.method === "early_access") continue;
    const left = daysLeft(s, t)!;
    const user = await getAuth(getAdminApp()).getUser(s.uid).catch(() => null);
    const email = user?.email || "";
    if (left < -billing.graceDays) {
      await d.ref.update({ status: "expired", updatedAt: new Date().toISOString() });
      await showPlanInWorkspace(s.uid, "free");
      summary.plansExpired++;
      if (email) later(notifyEmail(email, {
        subject: "Your Frilensa plan has ended", heading: `Your ${PLAN_NAMES[s.plan]} plan has ended`,
        lines: ["You're on the Free plan now. Everything you've made is still there.", "Renew any time in Settings → Plan."], actionLabel: "Renew", actionPath: "/?tab=settings"
      }));
      continue;
    }
    const key = left <= 1 ? `${s.paidUntil}:1` : left <= 7 ? `${s.paidUntil}:7` : "";
    if (key && s.remindedFor !== key && email) {
      await d.ref.update({ remindedFor: key });
      summary.billingReminders++;
      later(notifyEmail(email, {
        subject: left < 0 ? "Your Frilensa plan has run out" : `Your Frilensa plan ends ${left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`,
        heading: `Renew your ${PLAN_NAMES[s.plan]} plan`,
        lines: [`It's paid until ${s.paidUntil}.${billing.graceDays ? ` It keeps working for ${billing.graceDays} more days after that.` : ""}`, "Renew in Settings → Plan to keep your limits and features."],
        actionLabel: "Renew", actionPath: "/?tab=settings"
      }));
    }
  }
  return summary;
}
