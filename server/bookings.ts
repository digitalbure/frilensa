import crypto from "crypto";
import { z } from "zod";
import { getAdminDb, isEmail, sha256 } from "./security";
import { readWorkspace } from "./workspace";
import { appUrl, notifyConsultant, later } from "./notify";
import { ApiError, parse } from "./apiService";
import { publicCard } from "./rateCards";
import { emitEvent } from "./webhooks";
import { bookableServices, bookingQuestions, bookingProgress, checkBooking, BookingError, type BookingInput, type CheckedBooking } from "../src/lib/bookings";
import type { Business, CRMData, CRMDocument } from "../src/types";

// Booking requests from every channel (rate card, directory, apps through the API, and later the
// hosted page and widget) live in the server-only `quote_requests` collection, keyed to the
// consultant. They never touch the workspace until the consultant acts on one in the inbox.
// Progress (quote → invoice → paid) is worked out when read, from the workspace documents.

export const REQUESTS = "quote_requests";
export type Channel = "rate_card" | "directory" | "api" | "booking_page" | "widget";

async function load(uid: string): Promise<CRMData> {
  const ws = await readWorkspace(uid);
  if (!ws) throw new ApiError(404, "Open Frilensa once to set up your workspace before using the API.");
  return ws.data;
}

function pickBusiness(data: CRMData, businessId?: string): Business {
  if (businessId) {
    const b = data.businesses.find(x => x.id === businessId);
    if (!b) throw new ApiError(404, "Business not found.");
    return b;
  }
  if (data.businesses.length === 1) return data.businesses[0];
  if (data.businesses.length === 0) throw new ApiError(404, "Add a business in Frilensa first.");
  throw new ApiError(400, `businessId is required: this account has ${data.businesses.length} businesses (see GET /api/v1/me).`);
}

/** Everything an app or page needs to show a business's booking form. */
export function bookingFormFor(data: CRMData, business: Business) {
  const card = publicCard(data, business);
  return {
    businessId: business.id,
    business: card.business,
    currency: card.currency,
    vatRate: card.vatRate,
    terms: card.terms,
    intro: business.booking?.intro || business.rateCardIntro || "",
    afterMessage: business.booking?.afterMessage || "",
    services: bookableServices(data.services, business).map(s => ({
      id: s.id, name: s.name, description: s.description, rate: s.rate, unit: s.unit, category: s.category,
      billingInterval: s.billingInterval, minQuantity: s.minQuantity, maxQuantity: s.maxQuantity, vat: card.vatRate > 0 && s.taxable
    })),
    questions: bookingQuestions(business).map(q => ({
      id: q.id, type: q.type, label: q.label, help: q.help || "", required: Boolean(q.required),
      options: q.options || [], appliesToServiceIds: q.appliesToServiceIds || []
    }))
  };
}

// ---------- API input ----------

const text = (max: number) => z.string().trim().max(max);
const id = z.string().min(1).max(200);

export const bookingFormInput = { businessId: id.optional() };

export const createBookingInput = {
  businessId: id.optional().describe("Defaults to your only business"),
  name: text(120).min(1),
  email: z.string().trim().max(254).refine(isEmail, "Enter a valid email"),
  phone: text(40).optional(),
  company: text(120).optional(),
  message: text(3000).optional(),
  items: z.array(z.object({ serviceId: id, quantity: z.number().positive().max(100000), rate: z.number().optional().describe("Ignored: prices come from Frilensa") }).strict()).max(30).default([])
    .describe("Bookable services and quantities. Prices come from Frilensa; any rate sent is ignored"),
  answers: z.array(z.object({ questionId: id, value: z.union([z.string().max(3000), z.number(), z.boolean(), z.array(z.string().max(300)).max(30)]) }).strict()).max(50).default([])
    .describe("Answers to the business's booking questions (see get_booking_form)"),
  details: z.array(z.object({ label: z.string().max(60), value: z.string().max(500) }).strict()).max(30).default([])
    .describe("Extra facts your app collects, shown as-is"),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").optional(),
  location: text(300).optional(),
  source: z.object({
    app: text(60).min(1),
    reference: text(120).min(1).optional(),
    url: z.string().max(2000).url().refine(u => u.startsWith("https://"), "Must be an https URL").optional()
  }).strict().optional().describe("Your app's name and its own reference for this booking. Same app + reference returns the existing request")
};

export const listBookingsInput = {
  since: z.string().max(40).optional().describe("Only requests changed at or after this time (ISO 8601)"),
  app: text(60).optional(),
  channel: z.enum(["rate_card", "directory", "api", "booking_page", "widget"]).optional(),
  businessId: id.optional(),
  limit: z.number().int().min(1).max(200).default(50)
};

// ---------- Storing ----------

export interface NewBooking {
  uid: string;
  data: CRMData;
  business: Business;
  checked: CheckedBooking;
  contact: { name: string; email: string; phone?: string; company?: string; message?: string };
  channel: Channel;
  source?: { app?: string; reference?: string; url?: string };
  via?: string;
  viaKeyId?: string;
  extra?: Record<string, unknown>;
  /** Skip the consultant email (the caller sends its own). */
  quiet?: boolean;
}

/** Saves a booking request (idempotent on source app + reference) and emails the consultant. */
export async function saveBookingRequest(b: NewBooking): Promise<{ created: boolean; request: any }> {
  const db = getAdminDb();
  const ref = b.source?.app && b.source?.reference
    ? db.collection(REQUESTS).doc(`bk_${sha256(`${b.uid}|${b.source.app}|${b.source.reference}`).slice(0, 40)}`)
    : db.collection(REQUESTS).doc();
  const now = new Date().toISOString();
  const request = {
    id: ref.id,
    ref: `QR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    uid: b.uid,
    businessId: b.business.id,
    businessName: b.business.name || "",
    name: b.contact.name,
    email: b.contact.email,
    phone: b.contact.phone || "",
    company: b.contact.company || "",
    message: b.contact.message || "",
    items: b.checked.items,
    currency: b.data.userProfile.defaultCurrency || "FJD",
    estimate: b.checked.estimate,
    details: b.checked.details,
    ...(b.checked.eventDate ? { eventDate: b.checked.eventDate } : {}),
    ...(b.checked.startTime ? { startTime: b.checked.startTime } : {}),
    ...(b.checked.location ? { location: b.checked.location } : {}),
    ...(b.source ? { source: { app: b.source.app || "", reference: b.source.reference || "", url: b.source.url || "" } } : {}),
    ...(b.via ? { via: b.via } : {}),
    ...(b.viaKeyId ? { viaKeyId: b.viaKeyId } : {}),
    ...(b.extra || {}),
    channel: b.channel,
    status: "new",
    lastStage: "new",
    createdAt: now,
    updatedAt: now
  };
  const created = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) return { created: false, request: snap.data() };
    tx.set(ref, request);
    return { created: true, request };
  });
  if (created.created) later(emitEvent(b.uid, "booking_request.created", { bookingRequest: bookingView(created.request, b.data.documents) }));
  if (created.created && !b.quiet) {
    const r = created.request;
    const where = b.channel === "api" ? ` via ${b.via || b.source?.app || "an app"}` : b.channel === "rate_card" ? " from your rate card" : b.channel === "booking_page" ? " from your booking page" : b.channel === "widget" ? " from your website" : "";
    later(notifyConsultant(b.uid, {
      subject: `New booking request ${r.ref}${where}`,
      heading: `New booking request${where}`,
      lines: [
        `${r.name}${r.company ? ` (${r.company})` : ""} asked to book${r.items.length ? ` ${r.items.map((i: any) => `${i.quantity} × ${i.name}`).join(", ")}` : ""}${r.eventDate ? ` for ${r.eventDate}` : ""}.`,
        ...r.details.slice(0, 8).map((d: any) => `${d.label}: ${d.value}`),
        r.message ? `Their note: ${String(r.message).slice(0, 500)}` : "",
        `Reply to ${r.email}, or create the quote in Frilensa.`
      ].filter(Boolean),
      actionLabel: "View booking request",
      actionPath: "/?tab=dashboard"
    }));
  }
  return created;
}

export async function getBookingForm(uid: string, input: unknown) {
  const q = parse(bookingFormInput, input);
  const data = await load(uid);
  return bookingFormFor(data, pickBusiness(data, q.businessId));
}

export async function createBookingRequest(uid: string, apiKey: { id: string; name: string }, input: unknown) {
  const q = parse(createBookingInput, input);
  const data = await load(uid);
  const business = pickBusiness(data, q.businessId);
  let checked: CheckedBooking;
  try {
    checked = checkBooking(bookableServices(data.services, business), bookingQuestions(business), q as BookingInput);
  } catch (err) {
    if (err instanceof BookingError) throw new ApiError(err.status, err.message);
    throw err;
  }
  if (checked.items.length === 0 && !q.message && checked.details.length === 0) {
    throw new ApiError(400, "Add at least one bookable service, an answer or a message.");
  }
  const { created, request } = await saveBookingRequest({
    uid, data, business, checked,
    contact: { name: q.name, email: q.email.trim(), phone: q.phone, company: q.company, message: q.message },
    channel: "api", source: q.source, via: apiKey.name, viaKeyId: apiKey.id
  });
  return { created, body: { id: request.id, ref: request.ref, status: request.status, estimate: request.estimate, currency: request.currency } };
}

// ---------- Progress ----------

function docLink(d: CRMDocument) {
  return d.status !== "draft" && d.shareToken ? appUrl(`/?doc=${encodeURIComponent(d.shareToken)}`) : null;
}

export function bookingView(r: any, documents: CRMDocument[]) {
  const { stage, quote, invoices, updatedAt } = bookingProgress(r, documents);
  return {
    id: r.id, ref: r.ref, channel: r.channel || "rate_card", status: r.status || "new", stage, businessId: r.businessId,
    name: r.name, email: r.email, phone: r.phone || null, company: r.company || null, message: r.message || null,
    items: (r.items || []).map((i: any) => ({ serviceId: i.serviceId, name: i.name, unit: i.unit, rate: i.rate, quantity: i.quantity })),
    estimate: r.estimate ?? 0, currency: r.currency || "FJD",
    details: r.details || [], eventDate: r.eventDate || null, startTime: r.startTime || null, location: r.location || null,
    source: r.source ? { app: r.source.app || null, reference: r.source.reference || null, url: r.source.url || null } : null,
    via: r.via || null,
    createdAt: r.createdAt, updatedAt,
    quote: quote ? { id: quote.id, number: quote.documentNumber, status: quote.status, total: quote.total, currency: quote.currency || r.currency || "FJD", onlineUrl: docLink(quote) } : null,
    invoices: invoices.map(i => {
      const amountPaid = i.status === "paid" ? i.total : i.status === "partial" ? (i.partiallyPaidAmount || 0) : 0;
      return {
        id: i.id, number: i.documentNumber, status: i.status, total: i.total, currency: i.currency || r.currency || "FJD",
        amountPaid, balance: Math.max(0, Math.round((i.total - amountPaid) * 100) / 100), dueDate: i.dueDate || null, onlineUrl: docLink(i)
      };
    })
  };
}

export async function getBookingRequest(uid: string, requestId: string) {
  const snap = await getAdminDb().collection(REQUESTS).doc(String(requestId).slice(0, 100)).get();
  const r = snap.data();
  if (!r || r.uid !== uid) throw new ApiError(404, "Booking request not found.");
  const data = await load(uid);
  return { bookingRequest: bookingView(r, data.documents) };
}

export async function listBookingRequests(uid: string, input: unknown) {
  const q = parse(listBookingsInput, input);
  if (q.since && isNaN(new Date(q.since).getTime())) throw new ApiError(400, "since: use an ISO 8601 date or time.");
  const [snap, data] = await Promise.all([getAdminDb().collection(REQUESTS).where("uid", "==", uid).limit(2000).get(), load(uid)]);
  const since = q.since ? new Date(q.since).toISOString() : "";
  const rows = snap.docs.map(d => d.data())
    .filter(r => !q.app || r.source?.app === q.app || r.via === q.app)
    .filter(r => !q.channel || (r.channel || "rate_card") === q.channel)
    .filter(r => !q.businessId || r.businessId === q.businessId)
    .map(r => bookingView(r, data.documents))
    .filter(v => !since || v.updatedAt >= since)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { total: rows.length, bookingRequests: rows.slice(0, q.limit) };
}
