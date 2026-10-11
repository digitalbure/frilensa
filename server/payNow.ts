import express, { type NextFunction, type Response } from "express";
import { getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";
import { readWorkspace, updateWorkspace, WorkspaceMissing } from "./workspace";
import { notifyConsultant, later } from "./notify";
import { encryptSecret, decryptSecret, secretsConfigured } from "./secrets";
import { manualPayMethods, paypalQuote, formatMoney, homeRate, PAYPAL_CURRENCIES } from "../src/lib/payNow";
import { applyConfirmedPayment, addReceiptForInvoice } from "../src/lib/payments";

// "Pay now" on invoices. Bank, M-PAiSA and MyCash are manual: the client sees the business's
// details and reports the payment (portal.ts reportPayment). PayPal and card payments go to the
// business's own PayPal account using REST keys it saves here (secret encrypted, server-only
// collection `paypal_accounts`). The server creates and captures each order itself and only marks
// the invoice paid once PayPal confirms the capture for the right amount.

const ACCOUNTS = "paypal_accounts";
const CAPTURES = "paypal_captures";

export class PayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const apiBase = (env: string) => process.env.PAYPAL_API_BASE
  || (env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com");
const accountId = (uid: string, businessId: string) => `${uid}_${businessId}`.slice(0, 400);

interface PaypalAccount { uid: string; businessId: string; clientId: string; secret: string; env: "live" | "sandbox"; connectedAt: string }

async function paypalToken(clientId: string, secret: string, env: string): Promise<string> {
  const res = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new PayError(res.status === 401 ? 400 : 502, res.status === 401
    ? "PayPal didn't accept these keys. Check the client ID and secret, and that they're for the right mode (live or sandbox)."
    : "PayPal couldn't be reached. Please try again.");
  return body.access_token;
}

async function loadAccount(uid: string, businessId: string): Promise<PaypalAccount | null> {
  const snap = await getAdminDb().collection(ACCOUNTS).doc(accountId(uid, businessId)).get();
  return snap.exists ? (snap.data() as PaypalAccount) : null;
}

async function paypalCall(account: PaypalAccount, path: string, body?: unknown, requestId?: string) {
  const token = await paypalToken(account.clientId, decryptSecret(account.secret), account.env);
  const res = await fetch(`${apiBase(account.env)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** The live invoice from the workspace (the flat copy can lag behind). */
async function currentInvoice(consultantId: string, documentId: string) {
  const ws = await readWorkspace(consultantId);
  const doc = ws?.data.documents.find(d => d.id === documentId);
  if (!ws || !doc || doc.type !== "invoice" || doc.status === "draft") throw new PayError(404, "Invoice not found.");
  const business = ws.data.businesses.find(b => b.id === doc.businessId) || ws.data.businesses[0];
  return { data: ws.data, doc, business, home: ws.data.userProfile.defaultCurrency || "FJD" };
}

/** What the client can choose on this invoice. `flat` is the document's flat copy, already authorised. */
export async function payOptions(flat: any) {
  const { doc, business, home } = await currentInvoice(flat.consultantId, flat.id);
  const manual = manualPayMethods(business);
  const quote = doc.status === "paid" || doc.status === "cancelled" ? null : paypalQuote(doc, business, home);
  const account = business?.payNow?.paypal && quote ? await loadAccount(flat.consultantId, business.id) : null;
  return {
    status: doc.status,
    documentNumber: doc.documentNumber,
    currency: doc.currency || home,
    balance: quote?.balance ?? 0,
    reference: doc.documentNumber,
    bank: manual.bank ? { details: business!.bankDetails } : null,
    mpaisa: manual.mpaisa ? { number: business!.mPaisaId } : null,
    mycash: manual.mycash ? { number: business!.myCashId } : null,
    paypal: account && quote ? { clientId: account.clientId, env: account.env, card: business?.payNow?.paypalCard !== false, ...quote } : null
  };
}

export async function createPaypalOrder(flat: any) {
  const { doc, business, home } = await currentInvoice(flat.consultantId, flat.id);
  if (doc.status === "paid" || doc.status === "cancelled") throw new PayError(409, `This invoice is ${doc.status === "paid" ? "already paid" : "cancelled"}.`);
  const quote = paypalQuote(doc, business, home);
  const account = business?.payNow?.paypal ? await loadAccount(flat.consultantId, business.id) : null;
  if (!quote || !account) throw new PayError(409, "Online payment isn't available for this invoice.");
  const value = quote.total.toFixed(["HUF", "JPY", "TWD"].includes(quote.currency) ? 0 : 2);
  const r = await paypalCall(account, "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: doc.id.slice(0, 256),
      custom_id: `${flat.consultantId}:${doc.id}`.slice(0, 127),
      invoice_id: `${doc.documentNumber}-${Date.now().toString(36)}`.slice(0, 127),
      description: `Invoice ${doc.documentNumber}${business?.name ? ` from ${business.name}` : ""}`.slice(0, 127),
      amount: { currency_code: quote.currency, value }
    }],
    application_context: { shipping_preference: "NO_SHIPPING", brand_name: (business?.name || "Frilensa").slice(0, 127) }
  });
  if (!r.ok || !r.json.id) {
    console.warn("[paynow] order failed:", r.status, JSON.stringify(r.json).slice(0, 300));
    throw new PayError(502, "PayPal couldn't start the payment. Please try again.");
  }
  return { orderId: String(r.json.id) };
}

/** Captures an approved order and, once PayPal confirms it, marks the invoice paid and issues the receipt. */
export async function capturePaypalOrder(flat: any, orderId: unknown) {
  const id = String(orderId || "");
  if (!/^[A-Z0-9]{5,40}$/.test(id)) throw new PayError(400, "Invalid order.");
  const { doc, business } = await currentInvoice(flat.consultantId, flat.id);
  const account = business ? await loadAccount(flat.consultantId, business.id) : null;
  if (!account) throw new PayError(409, "Online payment isn't available for this invoice.");

  const r = await paypalCall(account, `/v2/checkout/orders/${id}/capture`, {}, `capture-${id}`);
  const unit = r.json?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  if (r.status === 422 && /ORDER_ALREADY_CAPTURED/.test(JSON.stringify(r.json))) {
    const done = await getAdminDb().collection(CAPTURES).where("orderId", "==", id).limit(1).get();
    if (!done.empty) return { ok: true, alreadyRecorded: true, receiptNumber: done.docs[0].data().receiptNumber || null };
  }
  if (!r.ok || r.json.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
    console.warn("[paynow] capture failed:", r.status, JSON.stringify(r.json).slice(0, 300));
    throw new PayError(402, "The payment didn't go through. You haven't been charged; please try again or choose another method.");
  }
  if ((capture.custom_id || unit.custom_id) !== `${flat.consultantId}:${doc.id}`) throw new PayError(400, "This payment is for a different invoice.");

  // A retry after a lost response returns the same capture: report what was recorded the first time.
  const seen = await getAdminDb().collection(CAPTURES).doc(String(capture.id).slice(0, 100)).get();
  if (seen.exists) return { ok: true, alreadyRecorded: true, receiptNumber: seen.data()!.receiptNumber || null, mismatch: Boolean(seen.data()!.mismatch) };

  const paidCurrency = String(capture.amount?.currency_code || "");
  const paidValue = Number(capture.amount?.value || 0);
  const breakdown = capture.seller_receivable_breakdown || {};
  const fee = Number(breakdown.paypal_fee?.value || 0);
  const captureRef = getAdminDb().collection(CAPTURES).doc(String(capture.id).slice(0, 100));

  const result = await updateWorkspace(flat.consultantId, (raw, data) => {
    const invoice = data.documents.find(d => d.id === doc.id);
    if (!invoice) throw new PayError(404, "Invoice not found.");
    const home = data.userProfile.defaultCurrency || "FJD";
    const biz = data.businesses.find(b => b.id === invoice.businessId) || data.businesses[0];
    const quote = paypalQuote(invoice, biz, home);
    const method = capture.payment_source?.card || r.json.payment_source?.card ? "Card (PayPal)" : "PayPal";
    const note = `Paid online by ${method}: ${formatMoney(paidCurrency, paidValue)}${quote?.surcharge ? ` incl. ${formatMoney(paidCurrency, quote.surcharge)} surcharge` : ""}${fee ? `, PayPal fee ${formatMoney(paidCurrency, fee)}` : ""}. PayPal capture ${capture.id}.`;
    if (invoice.status === "paid" || !quote || paidCurrency !== quote.currency || Math.abs(paidValue - quote.total) > 0.011) {
      // Money arrived but doesn't match what's owed now (already paid, or the invoice changed): keep it for the user to sort out.
      const logs = [{ id: `log-${Date.now()}`, type: "payment_received", title: "PayPal payment needs checking", description: `${invoice.documentNumber}: ${note} It didn't match the balance due, so the invoice wasn't changed.`, timestamp: new Date().toISOString(), entityType: "invoice", entityId: invoice.id }, ...(raw.activityLogs || [])].slice(0, 500);
      return { set: { activityLogs: logs }, result: { ok: true, mismatch: true, receiptNumber: null as string | null, invoice } };
    }
    const invoiceCurrency = invoice.currency || home;
    const toHome = homeRate(invoiceCurrency, biz, home);
    const paid = applyConfirmedPayment(data, invoice.id, {
      paymentMethod: method,
      paymentDate: new Date().toISOString().slice(0, 10),
      paidAmountForeign: invoice.total,
      paidAmountHome: Math.round(invoice.total * toHome * 100) / 100,
      exchangeRate: invoiceCurrency !== home ? toHome : undefined,
      paymentExchangeNotes: note
    });
    const { data: next, receipt } = addReceiptForInvoice(paid, invoice.id, { paymentMethod: method });
    const updated = next.documents.find(d => d.id === invoice.id)!;
    const logs = [{ id: `log-${Date.now()}`, type: "payment_received", title: "Paid online", description: `${invoice.documentNumber}: ${note}`, timestamp: new Date().toISOString(), entityType: "invoice", entityId: invoice.id, amount: invoice.total, currency: invoice.currency }, ...(raw.activityLogs || [])].slice(0, 500);
    return {
      set: { documents: next.documents, transactions: next.transactions, activityLogs: logs },
      newDocuments: [updated, ...(receipt ? [receipt] : [])],
      result: { ok: true, mismatch: false, receiptNumber: receipt?.documentNumber || null, invoice: updated }
    };
  });

  await captureRef.set({ orderId: id, captureId: capture.id, consultantId: flat.consultantId, documentId: doc.id, currency: paidCurrency, value: paidValue, fee, receiptNumber: result.receiptNumber, mismatch: result.mismatch, createdAt: new Date().toISOString() });
  later(notifyConsultant(flat.consultantId, {
    subject: result.mismatch ? `Check a PayPal payment for ${doc.documentNumber}` : `Invoice ${doc.documentNumber} paid online`,
    heading: result.mismatch ? "A PayPal payment needs checking" : "An invoice was paid online",
    lines: [
      `${flat.clientName || "Your client"} paid ${formatMoney(paidCurrency, paidValue)} by PayPal for invoice ${doc.documentNumber}.`,
      result.mismatch ? "It didn't match the balance due, so the invoice wasn't changed. Check it in Frilensa and PayPal." : `The invoice is marked paid${result.receiptNumber ? ` and receipt ${result.receiptNumber} was created` : ""}.`
    ],
    actionLabel: "Open Frilensa",
    actionPath: "/?tab=billing"
  }));
  return { ok: true, receiptNumber: result.receiptNumber, mismatch: result.mismatch };
}

export function payErrorHandler(name: string) {
  return (err: any, _req: any, res: Response, _next: NextFunction) => {
    if (err instanceof PayError) return res.status(err.status).json({ error: err.message });
    if (err instanceof WorkspaceMissing) return res.status(404).json({ error: "Invoice not found." });
    console.error(`[${name}] Request failed:`, err?.message || err);
    res.status(500).json({ error: "Payments are temporarily unavailable. Please try again shortly." });
  };
}

/** /api/payments: the signed-in user connects or disconnects a business's PayPal account. */
export function createPaymentsRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "payments-settings", max: 30, windowMs: 60_000 }));
  const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);

  const ownBusiness = async (uid: string, businessId: unknown) => {
    const ws = await readWorkspace(uid);
    const business = ws?.data.businesses.find(b => b.id === businessId);
    if (!business) throw new PayError(404, "Business not found.");
    return business;
  };

  router.get("/paypal", wrap(async (req, res) => {
    const business = await ownBusiness(req.user!.uid, req.query.businessId);
    const account = await loadAccount(req.user!.uid, business.id);
    res.json({ configured: secretsConfigured(), connected: Boolean(account), env: account?.env || null, clientId: account?.clientId || null, connectedAt: account?.connectedAt || null, currencies: PAYPAL_CURRENCIES });
  }));

  router.put("/paypal", wrap(async (req, res) => {
    if (!secretsConfigured()) throw new PayError(503, "Online payments aren't set up on this server yet.");
    const business = await ownBusiness(req.user!.uid, req.body?.businessId);
    const clientId = String(req.body?.clientId || "").trim();
    const secret = String(req.body?.secret || "").trim();
    const env = req.body?.env === "sandbox" ? "sandbox" : "live";
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(clientId) || !/^[A-Za-z0-9_-]{20,200}$/.test(secret)) throw new PayError(400, "Paste the client ID and secret from your PayPal app.");
    await paypalToken(clientId, secret, env); // Throws if PayPal rejects them.
    const account: PaypalAccount = { uid: req.user!.uid, businessId: business.id, clientId, secret: encryptSecret(secret), env, connectedAt: new Date().toISOString() };
    await getAdminDb().collection(ACCOUNTS).doc(accountId(req.user!.uid, business.id)).set(account);
    res.json({ connected: true, env, clientId });
  }));

  router.delete("/paypal", wrap(async (req, res) => {
    const business = await ownBusiness(req.user!.uid, req.query.businessId);
    await getAdminDb().collection(ACCOUNTS).doc(accountId(req.user!.uid, business.id)).delete();
    res.json({ connected: false });
  }));

  router.use(payErrorHandler("payments"));
  return router;
}
