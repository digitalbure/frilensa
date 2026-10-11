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
  services?: Record<string, { bookable?: boolean; minQuantity?: number; maxQuantity?: number }>;
  /** Built-in questions, switched on or off. Their answers also fill eventDate, startTime and location. */
  builtIn?: { date?: boolean; dateRequired?: boolean; time?: boolean; timeRequired?: boolean; location?: boolean; locationRequired?: boolean };
  questions?: BookingQuestion[];
  intro?: string;
  afterMessage?: string;
  /** Hosted booking page at /book/<slug> (and the website widget that opens it). */
  page?: { enabled?: boolean; slug?: string; ackEmail?: boolean };
}

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
  else if (live.length && live.every(i => i.status === 'paid')) stage = 'paid';
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
