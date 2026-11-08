// Rental bookings for marketplace gear (equipment, vehicles, event and AV hire), shared by the app and the
// server so the price a renter sees is the price the server checks.
// - Options a lister sets: how many units they have, a minimum hire, a deposit (refundable bond or part
//   payment up front), items always included for free, optional add-ons (free or charged), dry and/or wet hire
//   (with an operator or driver, at an extra rate), pick-up and return locations, delivery, and opening hours.
// - Availability is by day. Confirmed bookings and the lister's own blocks take units off each day they cover;
//   requests don't hold dates until the lister confirms them.

export type DepositKind = 'none' | 'bond' | 'upfront';
export interface AddOn { id: string; name: string; price: number; per: 'booking' | 'period'; max: number }
export interface Place { id: string; name: string; address: string }

export interface RentalOptions {
  quantity: number;
  minHire: number;
  deposit: { kind: DepositKind; type: 'fixed' | 'percent'; amount: number };
  included: string[];
  addOns: AddOn[];
  hire: { dry: boolean; wet: boolean; wetRate: number; wetNote: string };
  places: Place[];
  returnElsewhere: boolean;
  delivery: { offered: boolean; fee: number; note: string };
  hours: { open: string; close: string };
}

export const DEFAULT_RENTAL: RentalOptions = {
  quantity: 1,
  minHire: 1,
  deposit: { kind: 'none', type: 'fixed', amount: 0 },
  included: [],
  addOns: [],
  hire: { dry: true, wet: false, wetRate: 0, wetNote: '' },
  places: [],
  returnElsewhere: false,
  delivery: { offered: false, fee: 0, note: '' },
  hours: { open: '08:00', close: '17:00' }
};

export const MAX_ADDONS = 20;
export const MAX_INCLUDED = 20;
export const MAX_PLACES = 10;
const VEHICLE_CATEGORIES = ['vehicles', 'cars', 'vans', 'trucks', 'motorbikes', 'boats', 'charter'];

/** How dry and wet hire read for this category: self-drive or with a driver for vehicles. */
export function hireLabels(category: string) {
  return VEHICLE_CATEGORIES.includes(category)
    ? { dry: 'Self-drive', wet: 'With driver', operator: 'driver' }
    : { dry: 'Dry hire (equipment only)', wet: 'Wet hire (with operator)', operator: 'operator' };
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const amt = (v: unknown, max = 1_000_000) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, max) * 100) / 100 : 0; };
const int = (v: unknown, min: number, max: number, fallback: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const time = (v: unknown, fallback: string) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
const id = (v: unknown, prefix: string, i: number) => str(v, 40).replace(/[^A-Za-z0-9_-]/g, '') || `${prefix}${i + 1}`;
export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Checks and tidies a lister's rental options; anything missing takes the default. */
export function cleanRental(raw: any): RentalOptions | string {
  const r = raw && typeof raw === 'object' ? raw : {};
  const depositKind: DepositKind = r.deposit?.kind === 'bond' || r.deposit?.kind === 'upfront' ? r.deposit.kind : 'none';
  const depositType = r.deposit?.type === 'percent' ? 'percent' : 'fixed';
  const depositAmount = depositKind === 'none' ? 0 : amt(r.deposit?.amount, depositType === 'percent' ? 100 : 1_000_000);
  if (depositKind !== 'none' && !depositAmount) return 'Enter the deposit amount, or choose no deposit.';
  const seen = new Set<string>();
  const addOns: AddOn[] = [];
  for (const [i, a] of (Array.isArray(r.addOns) ? r.addOns : []).slice(0, MAX_ADDONS).entries()) {
    const name = str(a?.name, 80);
    if (!name) continue;
    let aid = id(a?.id, 'a', i);
    while (seen.has(aid)) aid = `${aid}x`;
    seen.add(aid);
    addOns.push({ id: aid, name, price: amt(a?.price), per: a?.per === 'period' ? 'period' : 'booking', max: int(a?.max, 1, 100, 1) });
  }
  const placeIds = new Set<string>();
  const places: Place[] = [];
  for (const [i, p] of (Array.isArray(r.places) ? r.places : []).slice(0, MAX_PLACES).entries()) {
    const name = str(p?.name, 80);
    if (!name) continue;
    let pid = id(p?.id, 'p', i);
    while (placeIds.has(pid)) pid = `${pid}x`;
    placeIds.add(pid);
    places.push({ id: pid, name, address: str(p?.address, 200) });
  }
  const dry = r.hire?.dry !== false, wet = r.hire?.wet === true;
  if (!dry && !wet) return 'Offer dry hire, wet hire or both.';
  const wetRate = wet ? amt(r.hire?.wetRate) : 0;
  const open = time(r.hours?.open, DEFAULT_RENTAL.hours.open), close = time(r.hours?.close, DEFAULT_RENTAL.hours.close);
  if (close <= open) return 'Closing time must be after opening time.';
  return {
    quantity: int(r.quantity, 1, 100, 1),
    minHire: int(r.minHire, 1, 365, 1),
    deposit: { kind: depositKind, type: depositType, amount: depositAmount },
    included: (Array.isArray(r.included) ? r.included : []).map((x: unknown) => str(x, 80)).filter(Boolean).slice(0, MAX_INCLUDED),
    addOns,
    hire: { dry, wet, wetRate, wetNote: wet ? str(r.hire?.wetNote, 200) : '' },
    places,
    returnElsewhere: places.length > 1 && r.returnElsewhere === true,
    delivery: { offered: r.delivery?.offered === true, fee: r.delivery?.offered === true ? amt(r.delivery?.fee) : 0, note: r.delivery?.offered === true ? str(r.delivery?.note, 200) : '' },
    hours: { open, close }
  };
}

// ---------- Dates ----------

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const dayMs = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
export function eachDay(from: string, to: string, cap = 400): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < cap; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- Availability ----------

export interface Hold { from: string; to: string; quantity: number; status?: string }

/** Units taken on each day by confirmed bookings and blocks. */
export function usedByDay(holds: Hold[], from?: string, to?: string): Record<string, number> {
  const used: Record<string, number> = {};
  for (const h of holds) {
    if (h.status === 'cancelled' || !isDate(h.from) || !isDate(h.to)) continue;
    const start = from && h.from < from ? from : h.from;
    const end = to && h.to > to ? to : h.to;
    for (const d of eachDay(start, end)) used[d] = (used[d] || 0) + Math.max(1, h.quantity || 1);
  }
  return used;
}

/** How many units are free on every day from `from` to `to`. */
export function availableFor(total: number, holds: Hold[], from: string, to: string) {
  const used = usedByDay(holds, from, to);
  return Math.max(0, total - Math.max(0, ...eachDay(from, to).map(d => used[d] || 0)));
}

// ---------- Pricing ----------

export interface RentalRequest {
  from: string; to: string;
  pickupTime?: string; returnTime?: string;
  quantity?: number;
  hire?: 'dry' | 'wet';
  addOns?: Record<string, number>;
  pickup?: string;         // a place id, or 'delivery'
  returnTo?: string;       // a place id (when return elsewhere is allowed)
  deliveryAddress?: string;
}

export interface RentalQuote {
  from: string; to: string; pickupTime: string; returnTime: string;
  periods: number; unit: string; quantity: number; hire: 'dry' | 'wet';
  lines: { label: string; rate: number; quantity: number; unit: string; amount: number }[];
  addOns: { id: string; name: string; quantity: number }[];
  included: string[];
  pickup: { kind: 'place' | 'delivery' | 'arrange'; name: string; address: string };
  returnTo: { name: string; address: string } | null;
  total: number;
  deposit: { kind: DepositKind; amount: number; label: string };
}

/** How many hire periods (hours, days, weeks or months) a booking covers, at least the minimum hire. */
export function hirePeriods(unit: string, from: string, to: string, pickupTime = '', returnTime = '', minHire = 1) {
  const timed = !!pickupTime && !!returnTime;
  const hours = timed
    ? (Date.parse(`${to}T${returnTime}:00Z`) - Date.parse(`${from}T${pickupTime}:00Z`)) / 3_600_000
    : (daysBetween(from, to) + 1) * 24;
  const days = timed ? Math.max(1, Math.ceil(hours / 24 - 1e-9)) : daysBetween(from, to) + 1;
  const periods = unit === 'hour' ? Math.ceil(hours - 1e-9) : unit === 'week' ? Math.ceil(days / 7) : unit === 'month' ? Math.ceil(days / 30) : days;
  return Math.max(minHire, periods, 1);
}

const periodWord = (unit: string, n: number) => `${unit}${n === 1 ? '' : 's'}`;

/** Works out a rental's price, or says what's wrong with the request. */
export function quoteRental(listing: { title: string; category: string; rent?: { amount: number; unit: string } | null; rental?: RentalOptions | null }, req: RentalRequest, today?: string): RentalQuote | string {
  const opts = listing.rental || DEFAULT_RENTAL;
  const rent = listing.rent;
  if (!rent) return "This item isn't for rent.";
  if (!isDate(req.from) || !isDate(req.to) || req.to < req.from) return 'Choose the dates you need it.';
  if (today && req.from < today) return 'Choose dates from today on.';
  if (daysBetween(req.from, req.to) > 366) return 'Bookings can be up to a year long.';
  const pickupTime = time(req.pickupTime, ''), returnTime = time(req.returnTime, '');
  if (rent.unit === 'hour' && (!pickupTime || !returnTime)) return 'Choose pick-up and return times.';
  for (const t of [pickupTime, returnTime]) if (t && (t < opts.hours.open || t > opts.hours.close)) return `Pick-up and return are between ${opts.hours.open} and ${opts.hours.close}.`;
  if (pickupTime && returnTime && req.from === req.to && returnTime <= pickupTime) return 'Return time must be after pick-up time.';
  const quantity = int(req.quantity, 1, opts.quantity, 1);
  if (Number(req.quantity) > opts.quantity) return `Only ${opts.quantity} available.`;
  const hire = req.hire === 'wet' ? 'wet' : 'dry';
  if (hire === 'wet' && !opts.hire.wet) return `${hireLabels(listing.category).wet} isn't offered for this item.`;
  if (hire === 'dry' && !opts.hire.dry) return `This item is only available ${hireLabels(listing.category).wet.toLowerCase()}.`;
  const periods = hirePeriods(rent.unit, req.from, req.to, pickupTime, returnTime, opts.minHire);
  const labels = hireLabels(listing.category);

  const lines: RentalQuote['lines'] = [];
  const line = (label: string, rate: number, qty: number, unit: string) => lines.push({ label, rate, quantity: qty, unit, amount: cents(rate * qty) });
  line(`${listing.title}${quantity > 1 ? ` × ${quantity}` : ''} (${periods} ${periodWord(rent.unit, periods)})`, rent.amount, periods * quantity, rent.unit);
  if (hire === 'wet' && opts.hire.wetRate > 0) line(`${labels.wet} (${periods} ${periodWord(rent.unit, periods)})`, opts.hire.wetRate, periods * quantity, rent.unit);

  const chosen: RentalQuote['addOns'] = [];
  for (const [aid, n] of Object.entries(req.addOns || {})) {
    const a = opts.addOns.find(x => x.id === aid);
    const count = Math.round(Number(n));
    if (!count || count < 0) continue;
    if (!a) return 'One of the add-ons is no longer offered. Please check your choices.';
    if (count > a.max) return `You can add up to ${a.max} × ${a.name}.`;
    chosen.push({ id: a.id, name: a.name, quantity: count });
    const qty = a.per === 'period' ? count * periods : count;
    line(a.price > 0 ? `${a.name}${count > 1 ? ` × ${count}` : ''}${a.per === 'period' ? ` (${periods} ${periodWord(rent.unit, periods)})` : ''}` : `${a.name}${count > 1 ? ` × ${count}` : ''} (free)`, a.price, qty, a.per === 'period' ? rent.unit : 'item');
  }

  let pickup: RentalQuote['pickup'];
  if (req.pickup === 'delivery') {
    if (!opts.delivery.offered) return "Delivery isn't offered for this item.";
    const address = str(req.deliveryAddress, 200);
    if (!address) return 'Enter the delivery address.';
    pickup = { kind: 'delivery', name: 'Delivery', address };
    if (opts.delivery.fee > 0) line('Delivery and collection', opts.delivery.fee, 1, 'item');
  } else if (opts.places.length) {
    const p = opts.places.find(x => x.id === req.pickup) || (opts.places.length === 1 ? opts.places[0] : null);
    if (!p) return 'Choose where to pick it up.';
    pickup = { kind: 'place', name: p.name, address: p.address };
  } else {
    pickup = { kind: 'arrange', name: 'Arrange with the owner', address: '' };
  }
  let returnTo: RentalQuote['returnTo'] = null;
  if (pickup.kind === 'place') {
    const back = opts.returnElsewhere && req.returnTo ? opts.places.find(x => x.id === req.returnTo) : null;
    if (opts.returnElsewhere && req.returnTo && !back) return 'Choose where to return it.';
    returnTo = back ? { name: back.name, address: back.address } : { name: pickup.name, address: pickup.address };
  }

  const total = cents(lines.reduce((s, l) => s + l.amount, 0));
  const d = opts.deposit;
  const depositAmount = d.kind === 'none' ? 0 : cents(d.type === 'percent' ? total * d.amount / 100 : d.amount);
  const deposit = {
    kind: d.kind,
    amount: depositAmount,
    label: d.kind === 'bond' ? 'Refundable bond' : d.kind === 'upfront' ? 'Deposit to confirm (part of the total)' : ''
  };
  return {
    from: req.from, to: req.to, pickupTime, returnTime, periods, unit: rent.unit, quantity, hire,
    lines, addOns: chosen, included: opts.included, pickup, returnTo, total, deposit
  };
}

/** One-line summaries of a quote for emails and the booking inbox. */
export function quoteDetails(q: RentalQuote, category: string) {
  const labels = hireLabels(category);
  const when = (d: string, t: string) => t ? `${d} at ${t}` : d;
  return [
    { label: 'Pick-up', value: `${when(q.from, q.pickupTime)} · ${q.pickup.name}${q.pickup.address ? `, ${q.pickup.address}` : ''}` },
    { label: 'Return', value: `${when(q.to, q.returnTime)}${q.returnTo ? ` · ${q.returnTo.name}${q.returnTo.address ? `, ${q.returnTo.address}` : ''}` : ''}` },
    { label: 'Hire', value: `${q.hire === 'wet' ? labels.wet : labels.dry}${q.quantity > 1 ? ` · ${q.quantity} units` : ''} · ${q.periods} ${periodWord(q.unit, q.periods)}` },
    ...(q.addOns.length ? [{ label: 'Add-ons', value: q.addOns.map(a => `${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`).join(', ') }] : []),
    ...(q.included.length ? [{ label: 'Included', value: q.included.join(', ') }] : []),
    ...(q.deposit.amount > 0 ? [{ label: q.deposit.label, value: `FJD ${q.deposit.amount.toFixed(2)}` }] : [])
  ];
}
