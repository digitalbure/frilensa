import express, { type Response, type NextFunction } from "express";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";
import { listWorkspaceSummaries } from "./workspace";
import { plansFor } from "./billing";

// Analytics for platform admins (Admin → Analytics), and the app's usage events behind them.
// - The app sends which screens and actions people use (names only, never what they typed). They're kept as
//   one document per person per day, app_activity/{uid}_{YYYY-MM-DD}: counts by screen and action, the kind of
//   device and the app version. Deleted with the account, and after 400 days by the daily job.
// - Reports read the server-only collections directly (accounts, flat documents, booking requests,
//   marketplace, plans, AI use, API keys, errors). Exports for studies use anonymous ids.

export const ACTIVITY = "app_activity";
const KEEP_DAYS = 400;
const NAME = /^[a-z][a-z0-9_]{1,39}$/;
const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);
const fijiDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Fiji", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const round2 = (n: number) => Math.round(n * 100) / 100;
const inc = (m: Record<string, number>, k: string, by = 1) => { m[k] = (m[k] || 0) + by; };
const top = (m: Record<string, number>, n = 10) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

/** A stable anonymous id for exports (the same person always gets the same id; it can't be turned back into theirs). */
export function anonId(uid: string) {
  const salt = process.env.ANALYTICS_SALT || process.env.PORTAL_SESSION_SECRET || "frilensa";
  return crypto.createHmac("sha256", salt).update(String(uid)).digest("hex").slice(0, 12);
}

// ---------- Usage events from the app ----------

/** POST /api/analytics/events: screens and actions the signed-in person used, in small batches. */
export function createAnalyticsRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "analytics", max: 30, windowMs: 60_000 }));
  router.post("/events", wrap(async (req, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 100) : [];
    // Add up repeats in the batch first: one increment per name.
    const counts: Record<string, number> = {};
    let n = 0;
    for (const e of events) {
      const kind = e?.type === "action" ? "actions" : e?.type === "screen" ? "screens" : null;
      const name = String(e?.name || "");
      if (!kind || !NAME.test(name)) continue;
      inc(counts, `${kind}.${name}`);
      n++;
    }
    const updates: Record<string, any> = {};
    for (const [key, count] of Object.entries(counts)) updates[key] = FieldValue.increment(count);
    if (!n) return res.json({ ok: true, recorded: 0 });
    const uid = req.user!.uid;
    const date = fijiDate();
    const device = ["phone", "tablet", "desktop"].includes(req.body?.device) ? req.body.device : "";
    const version = String(req.body?.version || "").replace(/[^0-9.]/g, "").slice(0, 12);
    const ref = getAdminDb().collection(ACTIVITY).doc(`${uid}_${date}`);
    // Create the day's document first, then add the counts (dotted paths need an existing document).
    // Device and version keep their last known values when a batch doesn't say.
    await ref.set({ uid, date, ...(device ? { device } : {}), ...(version ? { version } : {}), updatedAt: new Date().toISOString(), events: FieldValue.increment(n) }, { merge: true });
    await ref.update(updates);
    res.json({ ok: true, recorded: n });
  }));
  return router;
}

/** Removes usage records older than KEEP_DAYS (daily job). */
export async function purgeOldActivity() {
  const cutoff = addDays(fijiDate(), -KEEP_DAYS);
  const snap = await getAdminDb().collection(ACTIVITY).where("date", "<", cutoff).limit(2000).get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
  return { activityPurged: snap.size };
}

// ---------- Reports ----------

interface Account { uid: string; email: string; created: string; lastSignIn: string; verified: boolean; provider: string; disabled: boolean }

async function allAccounts(max = 20000): Promise<Account[]> {
  const out: Account[] = [];
  let token: string | undefined;
  do {
    const page = await getAuth(getAdminApp()).listUsers(1000, token);
    for (const u of page.users) out.push({
      uid: u.uid, email: u.email || "",
      created: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : "",
      lastSignIn: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : "",
      verified: !!u.emailVerified, provider: u.providerData[0]?.providerId || "password", disabled: !!u.disabled
    });
    token = page.pageToken;
  } while (token && out.length < max);
  return out;
}

/** Everything in a date range, from a collection with an ISO date or timestamp field. */
async function inRange(collection: string, field: string, from: string, to: string, limit = 20000) {
  const snap = await getAdminDb().collection(collection).where(field, ">=", from).where(field, "<=", `${to}`).limit(limit).get();
  return snap.docs.map(d => d.data());
}

const reportCache = new Map<string, { at: number; value: any }>();

/** The full analytics report for the last `days` days (cached for five minutes). */
export async function buildReport(days: number) {
  const key = String(days);
  const cached = reportCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const db = getAdminDb();
  const today = fijiDate();
  const from = addDays(today, -(days - 1));
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const months = [...new Set(dates.map(d => d.slice(0, 7)))];

  const [accounts, activity, docs, requests, listings, mktRequests, holds, subs, payments, keys, hooks, errors, dirListings, dirBookings, summaries] = await Promise.all([
    allAccounts(),
    inRange(ACTIVITY, "date", addDays(from, -35), today),
    inRange("documents", "issueDate", from, today),
    inRange("quote_requests", "createdAt", from, today),
    db.collection("marketplace_listings").limit(5000).get().then(s => s.docs.map(d => d.data())),
    inRange("marketplace_requests", "createdAt", from, today),
    db.collection("marketplace_bookings").where("kind", "==", "booking").limit(5000).get().then(s => s.docs.map(d => d.data())),
    db.collection("subscriptions").limit(20000).get().then(s => s.docs.map(d => d.data())),
    db.collection("subscription_payments").where("status", "==", "approved").limit(20000).get().then(s => s.docs.map(d => d.data())),
    db.collection("api_keys").limit(20000).get().then(s => s.docs.map(d => d.data())),
    db.collection("webhooks").limit(20000).get().then(s => s.size),
    db.collection("client_errors").limit(2000).get().then(s => s.docs.map(d => d.data())),
    db.collection("directory_listings").where("listed", "==", true).limit(5000).get().then(s => s.size),
    inRange("directory_bookings", "createdAt", from, today),
    listWorkspaceSummaries(5000)
  ]);
  const aiUsage = (await Promise.all(months.map(m => db.collection("ai_usage").where("month", "==", m).limit(20000).get()))).flatMap(s => s.docs.map(d => d.data()));

  // Users
  const live = accounts.filter(a => !a.disabled);
  const signupsByDay: Record<string, number> = {};
  for (const a of accounts) { const d = a.created ? fijiDate(new Date(a.created)) : ""; if (d >= from) inc(signupsByDay, d); }
  const providers: Record<string, number> = {};
  live.forEach(a => inc(providers, a.provider === "google.com" ? "Google" : a.provider === "password" ? "Email and password" : a.provider));

  // Engagement
  const byDate = new Map<string, Set<string>>();
  const screens: Record<string, number> = {}, actions: Record<string, number> = {}, devices: Record<string, number> = {}, versions: Record<string, number> = {};
  const activeDaysByUser: Record<string, Set<string>> = {};
  for (const a of activity as any[]) {
    if (!byDate.has(a.date)) byDate.set(a.date, new Set());
    byDate.get(a.date)!.add(a.uid);
    (activeDaysByUser[a.uid] ||= new Set()).add(a.date);
    if (a.date < from) continue;
    Object.entries(a.screens || {}).forEach(([k, v]) => inc(screens, k, Number(v) || 0));
    Object.entries(a.actions || {}).forEach(([k, v]) => inc(actions, k, Number(v) || 0));
    inc(devices, a.device || "unknown");
    if (a.version) inc(versions, a.version);
  }
  const uniqueBetween = (a: string, b: string) => { const s = new Set<string>(); for (const [d, u] of byDate) if (d >= a && d <= b) u.forEach(x => s.add(x)); return s.size; };
  const activeSeries = dates.map(d => ({ date: d, active: byDate.get(d)?.size || 0, signups: signupsByDay[d] || 0 }));

  // Retention: people who signed up in each of the last 8 weeks, and whether they came back in later weeks.
  const created = new Map(accounts.map(a => [a.uid, a.created ? fijiDate(new Date(a.created)) : ""]));
  const cohorts = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(today, -7 * (8 - i)), end = addDays(start, 6);
    const members = accounts.filter(a => { const c = created.get(a.uid) || ""; return c >= start && c <= end; });
    const weeks = [1, 2, 3, 4].map(w => {
      const ws = addDays(start, 7 * w);
      if (ws > today) return null;
      const we = addDays(ws, 6);
      const back = members.filter(m => [...(activeDaysByUser[m.uid] || [])].some(d => d >= ws && d <= we)).length;
      return members.length ? Math.round(back / members.length * 100) : 0;
    });
    return { week: start, size: members.length, weeks };
  });

  // Workspaces and plans
  const plans = await plansFor(summaries.map(s => s.uid));
  const planCount: Record<string, number> = {};
  summaries.forEach(s => inc(planCount, plans.get(s.uid) || "free"));
  const withDocs = summaries.filter(s => s.documents > 0).length;
  const avg = (k: "clients" | "documents" | "projects") => summaries.length ? round2(summaries.reduce((t, s) => t + s[k], 0) / summaries.length) : 0;

  // Documents and money (issued in the range)
  const byType: Record<string, number> = {}, byStatus: Record<string, number> = {};
  const money: Record<string, { invoiced: number; paid: number; outstanding: number; count: number }> = {};
  const invoicedByMonth: Record<string, Record<string, number>> = {};
  const docOwners = new Set<string>();
  for (const d of docs as any[]) {
    inc(byType, d.type || "other");
    docOwners.add(d.consultantId);
    if (d.type !== "invoice") continue;
    inc(byStatus, d.status || "draft");
    if (d.status === "draft" || d.status === "cancelled") continue;
    const cur = d.currency || "FJD";
    const m = (money[cur] ||= { invoiced: 0, paid: 0, outstanding: 0, count: 0 });
    const total = Number(d.total) || 0;
    const paid = d.status === "paid" ? total : Math.min(total, Number(d.amountPaid) || 0);
    m.invoiced += total; m.paid += paid; m.outstanding += Math.max(0, total - paid); m.count++;
    (invoicedByMonth[String(d.issueDate).slice(0, 7)] ||= {})[cur] = round2(((invoicedByMonth[String(d.issueDate).slice(0, 7)] || {})[cur] || 0) + total);
  }
  Object.values(money).forEach(m => { m.invoiced = round2(m.invoiced); m.paid = round2(m.paid); m.outstanding = round2(m.outstanding); });
  const quotes = (docs as any[]).filter(d => d.type === "quote");
  const quotesWon = quotes.filter(d => ["accepted", "converted", "invoiced"].includes(d.status)).length;

  // Bookings
  const byChannel: Record<string, number> = {}, bookingsByDay: Record<string, number> = {};
  let quoted = 0;
  for (const r of requests as any[]) {
    inc(byChannel, r.channel || "rate_card");
    inc(bookingsByDay, fijiDate(new Date(r.createdAt)));
    if (r.documentId || ["quoted", "quote_accepted", "invoiced", "part_paid", "paid"].includes(r.lastStage)) quoted++;
  }

  // Marketplace
  const mkt = { byStatus: {} as Record<string, number>, byKind: {} as Record<string, number>, industries: {} as Record<string, number>, categories: {} as Record<string, number>, cities: {} as Record<string, number> };
  for (const l of listings as any[]) {
    inc(mkt.byStatus, l.status); inc(mkt.byKind, l.kind === "service" ? "Services" : l.forRent && l.forSale ? "Gear to rent and buy" : l.forRent ? "Gear to rent" : "Gear for sale");
    if (l.status === "live") { inc(mkt.industries, l.industry); inc(mkt.categories, l.category); if (l.city) inc(mkt.cities, l.city); }
  }
  const mktInbox = (requests as any[]).filter(r => r.channel === "marketplace").length;
  const rentalsConfirmed = (holds as any[]).filter(h => h.status !== "cancelled" && String(h.createdAt) >= from).length;

  // Revenue
  const revenueByMonth: Record<string, number> = {};
  let revenue = 0;
  for (const p of payments as any[]) {
    const d = String(p.approvedAt || p.createdAt).slice(0, 10);
    if (d < from) continue;
    revenue += Number(p.amount) || 0;
    inc(revenueByMonth, d.slice(0, 7), Number(p.amount) || 0);
  }
  const paidSubs = (subs as any[]).filter(s => s.status === "active" && ["pro", "premium"].includes(s.plan) && !["early_access"].includes(s.method));

  // AI, API, errors
  const ai = { scans: 0, assistantMessages: 0, users: new Set<string>() };
  for (const u of aiUsage as any[]) { ai.scans += Number(u.scans) || 0; ai.assistantMessages += Number(u.assistantMessages) || 0; ai.users.add(u.uid); }
  const errorScreens: Record<string, number> = {};
  let errorsInRange = 0;
  for (const e of errors as any[]) { if (String(e.lastSeen || "").slice(0, 10) >= from) { errorsInRange += Number(e.count) || 1; inc(errorScreens, e.screen || "unknown", Number(e.count) || 1); } }

  const report = {
    generatedAt: new Date().toISOString(), from, to: today, days,
    users: {
      total: live.length, verified: live.filter(a => a.verified).length, newInRange: Object.values(signupsByDay).reduce((a, b) => a + b, 0),
      signedInInRange: live.filter(a => a.lastSignIn && fijiDate(new Date(a.lastSignIn)) >= from).length,
      providers: top(providers)
    },
    engagement: {
      dau: byDate.get(today)?.size || 0, wau: uniqueBetween(addDays(today, -6), today), mau: uniqueBetween(addDays(today, -29), today),
      activeInRange: uniqueBetween(from, today), series: activeSeries,
      screens: top(screens, 20), actions: top(actions, 30), devices: top(devices), versions: top(versions, 5),
      trackingSince: activity.length ? (activity as any[]).reduce((m, a) => a.date < m ? a.date : m, today) : null
    },
    retention: cohorts,
    workspaces: { total: summaries.length, withDocuments: withDocs, avgClients: avg("clients"), avgDocuments: avg("documents"), avgProjects: avg("projects"), plans: planCount, createdDocsInRange: docOwners.size },
    documents: { byType, invoiceStatus: byStatus, money, invoicedByMonth, quotes: quotes.length, quotesWon, quoteWinRate: quotes.length ? Math.round(quotesWon / quotes.length * 100) : null },
    bookings: { total: requests.length, byChannel: top(byChannel), byDay: dates.map(d => ({ date: d, count: bookingsByDay[d] || 0 })), quoted, conversion: requests.length ? Math.round(quoted / requests.length * 100) : null, directoryBookings: dirBookings.length, directoryListings: dirListings },
    marketplace: { listings: listings.length, byStatus: mkt.byStatus, byKind: top(mkt.byKind), topIndustries: top(mkt.industries, 8), topCategories: top(mkt.categories, 10), topCities: top(mkt.cities, 8), requests: mktInbox + mktRequests.length, agentRequests: mktRequests.length, rentalsConfirmed },
    plans: { paying: paidSubs.length, byMethod: top(paidSubs.reduce((m: Record<string, number>, s: any) => { inc(m, s.method); return m; }, {})), revenue: round2(revenue), revenueByMonth },
    ai: { scans: ai.scans, assistantMessages: ai.assistantMessages, users: ai.users.size },
    api: { activeKeys: (keys as any[]).filter(k => !k.revokedAt).length, keyOwners: new Set((keys as any[]).filter(k => !k.revokedAt).map(k => k.uid)).size, apiBookings: byChannel.api || 0, webhooks: hooks },
    errors: { inRange: errorsInRange, topScreens: top(errorScreens, 8) }
  };
  reportCache.set(key, { at: Date.now(), value: report });
  return report;
}

// ---------- Exports for studies ----------

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows: Record<string, unknown>[], columns: string[]) => [columns.join(","), ...rows.map(r => columns.map(c => csvCell(r[c])).join(","))].join("\n");

export const DATASETS = ["users", "activity", "documents", "bookings", "listings"] as const;

/** One anonymised dataset as CSV: no names, emails or free text; people appear as anonymous ids. */
export async function exportDataset(dataset: string, days: number): Promise<{ csv: string; rows: number }> {
  const today = fijiDate();
  const from = addDays(today, -(days - 1));
  if (dataset === "users") {
    const accounts = await allAccounts();
    const plans = await plansFor(accounts.map(a => a.uid));
    const rows = accounts.map(a => ({ user: anonId(a.uid), signed_up: a.created.slice(0, 10), last_sign_in: a.lastSignIn.slice(0, 10), verified: a.verified, sign_in_with: a.provider, plan: plans.get(a.uid) || "free", disabled: a.disabled }));
    return { csv: toCsv(rows, ["user", "signed_up", "last_sign_in", "verified", "sign_in_with", "plan", "disabled"]), rows: rows.length };
  }
  if (dataset === "activity") {
    const rows = (await inRange(ACTIVITY, "date", from, today, 50000)).map((a: any) => ({ user: anonId(a.uid), date: a.date, device: a.device, app_version: a.version, events: a.events, screens: a.screens || {}, actions: a.actions || {} }));
    return { csv: toCsv(rows, ["user", "date", "device", "app_version", "events", "screens", "actions"]), rows: rows.length };
  }
  if (dataset === "documents") {
    const rows = (await inRange("documents", "issueDate", from, today, 50000)).map((d: any) => ({ user: anonId(d.consultantId), type: d.type, status: d.status, currency: d.currency || "FJD", total: Number(d.total) || 0, vat: Number(d.vatAmount) || 0, lines: Array.isArray(d.items) ? d.items.length : 0, issue_month: String(d.issueDate).slice(0, 7) }));
    return { csv: toCsv(rows, ["user", "type", "status", "currency", "total", "vat", "lines", "issue_month"]), rows: rows.length };
  }
  if (dataset === "bookings") {
    const rows = (await inRange("quote_requests", "createdAt", from, today, 50000)).map((r: any) => ({ business: anonId(r.uid), channel: r.channel || "rate_card", created: String(r.createdAt).slice(0, 10), currency: r.currency || "FJD", estimate: Number(r.estimate) || 0, items: Array.isArray(r.items) ? r.items.length : 0, stage: r.lastStage || r.status, quoted: !!r.documentId }));
    return { csv: toCsv(rows, ["business", "channel", "created", "currency", "estimate", "items", "stage", "quoted"]), rows: rows.length };
  }
  if (dataset === "listings") {
    const snap = await getAdminDb().collection("marketplace_listings").limit(20000).get();
    const rows = snap.docs.map(d => d.data() as any).map(l => ({ owner: l.ownerUid ? anonId(l.ownerUid) : "frilensa", kind: l.kind, status: l.status, managed: !!l.managed, industry: l.industry, category: l.category, city: l.city, for_rent: !!l.forRent, for_sale: !!l.forSale, rent: l.rent?.amount ?? "", rent_unit: l.rent?.unit ?? "", sale_price: l.salePrice ?? "", service_price: l.price?.amount ?? "", photos: (l.photos || []).length, created: String(l.createdAt).slice(0, 10) }));
    return { csv: toCsv(rows, ["owner", "kind", "status", "managed", "industry", "category", "city", "for_rent", "for_sale", "rent", "rent_unit", "sale_price", "service_price", "photos", "created"]), rows: rows.length };
  }
  throw new Error("Unknown dataset.");
}

/** /api/admin/analytics: the report, and anonymised CSV exports. Platform admins only. */
export function createAdminAnalyticsRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin-analytics", max: 30, windowMs: 60_000 }));
  const daysOf = (v: unknown) => Math.min(366, Math.max(1, Math.round(Number(v) || 30)));
  router.get("/", wrap(async (req, res) => {
    if (req.query.fresh === "1") reportCache.delete(String(daysOf(req.query.days)));
    res.json(await buildReport(daysOf(req.query.days)));
  }));
  router.get("/export/:dataset", wrap(async (req, res) => {
    const dataset = String(req.params.dataset);
    if (!(DATASETS as readonly string[]).includes(dataset)) return res.status(400).json({ error: `Choose one of: ${DATASETS.join(", ")}.` });
    const days = daysOf(req.query.days);
    const { csv } = await exportDataset(dataset, days);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="frilensa-${dataset}-${fijiDate()}-${days}d.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(csv);
  }));
  return router;
}
