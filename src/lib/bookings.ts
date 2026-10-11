import type { Business, CRMDocument, ProductService } from '../types';

// Bookings: what a business lets customers book, the questions it asks, checking a booking
// against them, and how far a booking has got (quote → invoice → paid). Shared by the server
// (API, hosted page) and the browser (settings, inbox).

export type BookingQuestionType = 'short_text' | 'long_text' | 'number' | 'date' | 'time' | 'single_choice' | 'multi_choice' | 'yes_no';
export const QUESTION_TYPES: { id: BookingQuestionType; label: string }[] = [
  { id: 'short_text', label: 'Short text' }, { id: 'long_text', label: 'Long text' }, { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' }, { id: 'time', label: 'Time' }, { id: 'single_choice', label: 'Single choice' },
  { id: 'multi_choice', label: 'Multiple choice' }, { id: 'yes_no', label: 'Yes or no' }
];

export interface BookingQuestion {
  id: string;
  type: BookingQuestionType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  /** Only asked when one of these services is chosen. Empty or missing: always asked. */
  appliesToServiceIds?: string[];
}

export interface BookingSettings {
  /** Per service: whether it can be booked (default yes, if it's on the rate card) and quantity limits. */
  services?: Record<string, { bookable?: boolean; minQuantity?: number; maxQuantity?: number; deposit?: DepositRule }>;
  /** Built-in questions, switched on or off. Their answers also fill eventDate, startTime and location. */
  builtIn?: { date?: boolean; dateRequired?: boolean; time?: boolean; timeRequired?: boolean; location?: boolean; locationRequired?: boolean };
  questions?: BookingQuestion[];
  intro?: string;
  afterMessage?: string;
  /** When customers can book. Off: any date. */
  availability?: {
    enabled?: boolean;
    workingDays?: number[]; // 0 = Sunday … 6 = Saturday; default every day
    leadDays?: number; // book at least this many days ahead
    blockedDates?: string[]; // YYYY-MM-DD
    maxPerDay?: number; // bookings per day (accepted quotes, plus pending requests if countPending)
    countPending?: boolean;
  };
  /** Deposit asked for when a booking is accepted. Services can have their own. */
  deposit?: DepositRule;
  /** Hosted booking page at /book/<slug> (and the website widget that opens it). */
  page?: { enabled?: boolean; slug?: string; ackEmail?: boolean };
}

export interface DepositRule { type: 'percent' | 'fixed'; value: number }

export const BUILT_IN_IDS = { date: 'q_date', time: 'q_time', location: 'q_location' } as const;

/** Services on the business's rate card: active, for this business (or all), not hidden. */
export function rateCardServices(services: ProductService[] | undefined, businessId: string) {
  return (services || []).filter(s =>
    s && s.isActive !== false && s.showOnRateCard !== false && (!s.businessId || s.businessId === businessId));
}

export interface BookableService {
  id: string; name: string; description: string; rate: number; unit: string; category: string;
  billingInterval: string; minQuantity: number; maxQuantity: number | null; taxable: boolean;
}

/** Services customers can book, with their quantity limits. */
export function bookableServices(services: ProductService[] | undefined, business: Partial<Business> & { id: string }): BookableService[] {
  const cfg = business.booking?.services || {};
  return rateCardServices(services, business.id)
    .filter(s => cfg[s.id]?.bookable !== false)
    .map(s => {
      const c = cfg[s.id] || {};
      const min = Math.max(1, Number(c.minQuantity) || Number(s.minQuantity) || 1);
      const max = Number(c.maxQuantity) > 0 ? Math.max(min, Number(c.maxQuantity)) : null;
      return {
        id: s.id, name: s.name || '', description: s.description || '', rate: Number(s.rate) || 0, unit: s.unit || '',
        category: s.category || '', billingInterval: s.billingInterval || 'one-time', minQuantity: min, maxQuantity: max,
        taxable: s.isTaxable !== false
      };
    });
}

/** The business's booking questions in order: switched-on built-ins first, then its own. */
export function bookingQuestions(business: Partial<Business> | null | undefined): BookingQuestion[] {
  const b = business?.booking || {};
  const built = b.builtIn || {};
  return [
    ...(built.date ? [{ id: BUILT_IN_IDS.date, type: 'date' as const, label: 'Event or job date', required: built.dateRequired !== false }] : []),
    ...(built.time ? [{ id: BUILT_IN_IDS.time, type: 'time' as const, label: 'Start time', required: Boolean(built.timeRequired) }] : []),
    ...(built.location ? [{ id: BUILT_IN_IDS.location, type: 'short_text' as const, label: 'Location', required: Boolean(built.locationRequired) }] : []),
    ...(b.questions || []).filter(q => q && q.id && q.label && QUESTION_TYPES.some(t => t.id === q.type))
  ];
}

export class BookingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const validDate = (s: string) => DATE.test(s) && !isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export interface BookingInput {
  items?: { serviceId: string; quantity: number }[];
  answers?: { questionId: string; value: unknown }[];
  details?: { label: string; value: string }[];
  eventDate?: string;
  startTime?: string;
  location?: string;
}

export interface CheckedBooking {
  items: { serviceId: string; name: string; unit: string; rate: number; quantity: number }[];
  details: { label: string; value: string }[];
  eventDate?: string;
  startTime?: string;
  location?: string;
  estimate: number;
}

/**
 * Checks a booking against the business's bookable services and questions. Prices come from the
 * services; unknown or non-bookable services are dropped; quantities are kept within limits.
 * Answers are stored as label/value pairs using the business's labels. Throws BookingError (400).
 */
export function checkBooking(services: BookableService[], questions: BookingQuestion[], input: BookingInput): CheckedBooking {
  const byId = new Map(services.map(s => [s.id, s]));
  const items = (input.items || []).slice(0, 30).flatMap(it => {
    const s = byId.get(String(it?.serviceId || ''));
    let quantity = Math.round(Number(it?.quantity) * 100) / 100;
    if (!s || !Number.isFinite(quantity) || quantity <= 0) return [];
    quantity = Math.max(s.minQuantity, quantity);
    if (s.maxQuantity) quantity = Math.min(s.maxQuantity, quantity);
    return [{ serviceId: s.id, name: s.name, unit: s.unit, rate: s.rate, quantity }];
  });
  // Merge repeated services.
  const merged = [...items.reduce((m, it) => m.set(it.serviceId, m.has(it.serviceId) ? { ...it, quantity: Math.min(byId.get(it.serviceId)!.maxQuantity || Infinity, m.get(it.serviceId)!.quantity + it.quantity) } : it), new Map<string, typeof items[number]>()).values()];
  const chosen = new Set(merged.map(i => i.serviceId));

  const answers = new Map<string, unknown>();
  for (const a of input.answers || []) {
    if (!a || typeof a.questionId !== 'string') continue;
    if (!questions.some(q => q.id === a.questionId)) throw new BookingError(400, `Unknown question: ${a.questionId}.`);
    answers.set(a.questionId, a.value);
  }
  // Top-level fields stand in for the built-in questions when no answer was given.
  if (input.eventDate !== undefined && !answers.has(BUILT_IN_IDS.date)) answers.set(BUILT_IN_IDS.date, input.eventDate);
  if (input.startTime !== undefined && !answers.has(BUILT_IN_IDS.time)) answers.set(BUILT_IN_IDS.time, input.startTime);
  if (input.location !== undefined && !answers.has(BUILT_IN_IDS.location)) answers.set(BUILT_IN_IDS.location, input.location);

  const details: { label: string; value: string }[] = [];
  const out: Partial<CheckedBooking> = {};
  for (const q of questions) {
    const applies = !q.appliesToServiceIds?.length || q.appliesToServiceIds.some(id => chosen.has(id));
    if (!applies) continue;
    const raw = answers.get(q.id);
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (q.required) throw new BookingError(400, `Please answer "${q.label}".`);
      continue;
    }
    const fail = (why: string) => { throw new BookingError(400, `"${q.label}": ${why}`); };
    let value: string;
    switch (q.type) {
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) fail('enter a number.');
        value = String(n);
        break;
      }
      case 'date':
        if (typeof raw !== 'string' || !validDate(raw)) fail('use a date like 2027-03-28.');
        value = raw as string;
        break;
      case 'time':
        if (typeof raw !== 'string' || !TIME.test(raw)) fail('use a time like 14:30.');
        value = raw as string;
        break;
      case 'yes_no':
        if (typeof raw !== 'boolean' && !['yes', 'no', 'true', 'false'].includes(String(raw).toLowerCase())) fail('answer yes or no.');
        value = raw === true || ['yes', 'true'].includes(String(raw).toLowerCase()) ? 'Yes' : 'No';
        break;
      case 'single_choice':
        if (typeof raw !== 'string' || !(q.options || []).includes(raw)) fail(`choose one of: ${(q.options || []).join(', ')}.`);
        value = raw as string;
        break;
      case 'multi_choice': {
        const list = Array.isArray(raw) ? raw : [raw];
        if (!list.every(v => typeof v === 'string' && (q.options || []).includes(v))) fail(`choose from: ${(q.options || []).join(', ')}.`);
        value = [...new Set(list as string[])].join(', ');
        break;
      }
      default: {
        if (typeof raw !== 'string' && typeof raw !== 'number') fail('enter text.');
        value = String(raw).trim().slice(0, q.type === 'long_text' ? 3000 : 300);
        if (!value) { if (q.required) fail('this is required.'); continue; }
      }
    }
    if (q.id === BUILT_IN_IDS.date) out.eventDate = value;
    else if (q.id === BUILT_IN_IDS.time) out.startTime = value;
    else if (q.id === BUILT_IN_IDS.location) out.location = value;
    details.push({ label: q.label, value });
  }
  // Fields with no matching question are still kept, checked.
  if (!out.eventDate && input.eventDate) { if (!validDate(input.eventDate)) throw new BookingError(400, 'eventDate: use YYYY-MM-DD.'); out.eventDate = input.eventDate; }
  if (!out.startTime && input.startTime) { if (!TIME.test(input.startTime)) throw new BookingError(400, 'startTime: use HH:MM.'); out.startTime = input.startTime; }
  if (!out.location && input.location) out.location = String(input.location).trim().slice(0, 300);

  const extra = (input.details || []);
  if (extra.length > 30) throw new BookingError(400, 'details: up to 30 items.');
  for (const d of extra) {
    const label = String(d?.label ?? '').trim(), value = String(d?.value ?? '').trim();
    if (!label || label.length > 60) throw new BookingError(400, 'details: each label is 1 to 60 characters.');
    if (value.length > 500) throw new BookingError(400, `details: "${label}" is longer than 500 characters.`);
    details.push({ label, value });
  }
  const estimate = Math.round(merged.reduce((s, i) => s + i.rate * i.quantity, 0) * 100) / 100;
  return { items: merged, details, ...out, estimate };
}

// ---------- Progress ----------

export type BookingStage = 'new' | 'quoted' | 'quote_accepted' | 'invoiced' | 'part_paid' | 'paid' | 'dismissed' | 'cancelled';

export const STAGE_LABEL: Record<BookingStage, string> = {
  new: 'New', quoted: 'Quoted', quote_accepted: 'Quote accepted', invoiced: 'Invoiced', part_paid: 'Part paid', paid: 'Paid', dismissed: 'Dismissed', cancelled: 'Cancelled'
};

/** Where a booking has got to, worked out from its quote and the invoices made from it. */
export function bookingProgress(request: { status?: string; documentId?: string; createdAt?: string; updatedAt?: string }, documents: CRMDocument[]) {
  const quote = request.documentId ? documents.find(d => d.id === request.documentId) : undefined;
  const invoices = quote ? documents.filter(d => d.type === 'invoice' && d.sourceQuoteId === quote.id) : [];
  const live = invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft');
  let stage: BookingStage;
  if (request.status === 'dismissed') stage = 'dismissed';
  else if (quote?.status === 'cancelled') stage = 'cancelled';
  // A paid deposit on its own is part paid: the rest is still to be invoiced.
  else if (live.length && live.every(i => i.status === 'paid') && live.some(i => !i.isDeposit)) stage = 'paid';
  else if (live.some(i => i.status === 'paid' || i.status === 'partial')) stage = 'part_paid';
  else if (live.length) stage = 'invoiced';
  else if (quote?.status === 'accepted') stage = 'quote_accepted';
  else if (quote || request.status === 'quoted') stage = 'quoted';
  else stage = 'new';
  const times = [request.createdAt, request.updatedAt, quote?.updatedAt, ...invoices.map(i => i.updatedAt)].filter(Boolean) as string[];
  const updatedAt = times.sort().pop() || request.createdAt || '';
  return { stage, quote, invoices, updatedAt };
}

/** The "Booking details" block added to a quote's notes, so the customer sees what's being quoted. */
export function bookingDetailsBlock(r: { details?: { label: string; value: string }[]; eventDate?: string; startTime?: string; location?: string }) {
  const lines = [...(r.details || [])];
  const has = (re: RegExp) => lines.some(l => re.test(l.label));
  if (r.location && !has(/location|venue/i)) lines.unshift({ label: 'Location', value: r.location });
  if (r.startTime && !has(/time/i)) lines.unshift({ label: 'Start time', value: r.startTime });
  if (r.eventDate && !has(/date/i)) lines.unshift({ label: 'Date', value: r.eventDate });
  return lines.length ? `Booking details\n${lines.map(l => `- ${l.label}: ${l.value}`).join('\n')}` : '';
}

// ---------- Availability ----------

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Stages that hold a date: accepted quotes and beyond, plus waiting requests when the business counts them. */
export function holdsDate(stage: BookingStage, countPending?: boolean) {
  return ['quote_accepted', 'invoiced', 'part_paid', 'paid'].includes(stage) || (Boolean(countPending) && (stage === 'new' || stage === 'quoted'));
}

/** Why a date can't be booked, or null if it can. `counts` is bookings already holding each date. */
export function dateProblem(settings: BookingSettings | undefined, counts: Map<string, number>, today: string, date: string): string | null {
  const a = settings?.availability;
  if (!a?.enabled) return null;
  const earliest = addDaysIso(today, Math.max(0, Math.round(Number(a.leadDays) || 0)));
  if (date < earliest) return a.leadDays ? `Please book at least ${a.leadDays} day${a.leadDays === 1 ? '' : 's'} ahead.` : 'That date has passed.';
  if (date > addDaysIso(today, 366)) return 'Bookings open up to a year ahead.';
  const days = a.workingDays && a.workingDays.length ? a.workingDays : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(weekday(date))) return "That day of the week isn't available.";
  if ((a.blockedDates || []).includes(date)) return "That date isn't available.";
  if (a.maxPerDay && (counts.get(date) || 0) >= a.maxPerDay) return 'That date is fully booked.';
  return null;
}

/** Dates in the next 12 months that can't be booked (non-working days, too soon, blocked or full). */
export function unavailableDates(settings: BookingSettings | undefined, counts: Map<string, number>, today: string) {
  const a = settings?.availability;
  if (!a?.enabled) return { enabled: false as const };
  const out: { date: string; reason: 'too_soon' | 'closed' | 'blocked' | 'full' }[] = [];
  const earliest = addDaysIso(today, Math.max(0, Math.round(Number(a.leadDays) || 0)));
  const days = a.workingDays && a.workingDays.length ? a.workingDays : [0, 1, 2, 3, 4, 5, 6];
  const last = addDaysIso(today, 365);
  for (let d = today; d <= last; d = addDaysIso(d, 1)) {
    if (d < earliest) out.push({ date: d, reason: 'too_soon' });
    else if (!days.includes(weekday(d))) out.push({ date: d, reason: 'closed' });
    else if ((a.blockedDates || []).includes(d)) out.push({ date: d, reason: 'blocked' });
    else if (a.maxPerDay && (counts.get(d) || 0) >= a.maxPerDay) out.push({ date: d, reason: 'full' });
  }
  return {
    enabled: true as const, earliestDate: earliest, latestDate: last, workingDays: days, leadDays: Number(a.leadDays) || 0,
    maxPerDay: a.maxPerDay || null, unavailableDates: out.map(x => x.date),
    fullDates: out.filter(x => x.reason === 'full').map(x => x.date), blockedDates: out.filter(x => x.reason === 'blocked').map(x => x.date)
  };
}

// ---------- Deposits ----------

/**
 * Deposit for a quote, before VAT. Lines from a service with its own rule use it (percent of the
 * line, or a fixed amount per unit); the rest use the business rule (percent of those lines, or a
 * fixed amount once). Null when no rule applies.
 */
export function depositFor(settings: BookingSettings | undefined, items: { itemId?: string; total: number; quantity: number; kind?: string }[]) {
  const per = settings?.services || {};
  const biz = settings?.deposit && settings.deposit.value > 0 ? settings.deposit : null;
  let amount = 0, any = false, rest = 0, restCount = 0;
  for (const it of items) {
    if (it.kind === 'reimbursement') continue;
    const rule = it.itemId ? per[it.itemId]?.deposit : undefined;
    if (rule && rule.value > 0) {
      any = true;
      amount += rule.type === 'percent' ? it.total * Math.min(100, rule.value) / 100 : rule.value * it.quantity;
    } else { rest += it.total; restCount++; }
  }
  if (biz && restCount) { any = true; amount += biz.type === 'percent' ? rest * Math.min(100, biz.value) / 100 : biz.value; }
  if (!any) return null;
  const subtotal = items.filter(i => i.kind !== 'reimbursement').reduce((s, i) => s + i.total, 0);
  return Math.round(Math.min(amount, subtotal) * 100) / 100;
}

export function depositLabel(rule?: DepositRule | null) {
  if (!rule || !(rule.value > 0)) return '';
  return rule.type === 'percent' ? `${rule.value}% deposit` : `deposit of ${rule.value}`;
}
