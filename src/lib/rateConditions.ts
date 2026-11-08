// Rate conditions: different rates for the same service depending on the job, e.g.
//   Local production                 FJD 600/day
//   International production in Fiji FJD 900/day
//   Overseas work (travel)           AUD 1,000/day  = AUD 400 gear + AUD 600 labour
// A business keeps its list of conditions (each with its own currency, and optionally no VAT, e.g. work
// done outside Fiji). Each service sets a rate per condition, optionally split into parts. The service's
// own rate stays the standard rate, used when no condition applies. Shared by the app and the server.

export interface RateCondition {
  id: string;
  name: string;
  description: string;
  currency: string;
  /** No VAT on work under this condition (e.g. services done overseas). */
  noVat?: boolean;
}
export interface RatePart { label: string; rate: number }
export interface ConditionRate { conditionId: string; rate: number; parts?: RatePart[] }

export const MAX_CONDITIONS = 12;
export const MAX_PARTS = 6;

const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const amount = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 10_000_000) * 100) / 100 : 0; };
const code = (v: unknown, fallback: string) => typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : fallback;
export const newConditionId = () => `cond-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A business's conditions, tidied. */
export function cleanConditions(raw: unknown, baseCurrency = 'FJD'): RateCondition[] {
  const seen = new Set<string>();
  const out: RateCondition[] = [];
  for (const c of Array.isArray(raw) ? raw.slice(0, MAX_CONDITIONS) : []) {
    const name = str((c as any)?.name, 60);
    const id = str((c as any)?.id, 60).replace(/[^A-Za-z0-9_-]/g, '');
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, description: str((c as any)?.description, 200), currency: code((c as any)?.currency, baseCurrency), ...((c as any)?.noVat ? { noVat: true } : {}) });
  }
  return out;
}

/** A service's rates per condition, tidied. With parts, the rate is their sum. */
export function cleanConditionRates(raw: unknown): ConditionRate[] {
  const seen = new Set<string>();
  const out: ConditionRate[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, MAX_CONDITIONS * 4) : []) {
    const conditionId = str((r as any)?.conditionId, 60);
    if (!conditionId || seen.has(conditionId)) continue;
    const parts = (Array.isArray((r as any)?.parts) ? (r as any).parts : []).slice(0, MAX_PARTS)
      .map((p: any) => ({ label: str(p?.label, 40), rate: amount(p?.rate) }))
      .filter((p: RatePart) => p.label);
    const rate = parts.length ? Math.round(parts.reduce((s: number, p: RatePart) => s + p.rate, 0) * 100) / 100 : amount((r as any)?.rate);
    if (!rate && !parts.length) continue;
    seen.add(conditionId);
    out.push({ conditionId, rate, ...(parts.length ? { parts } : {}) });
  }
  return out;
}

export interface PricedRate {
  rate: number;
  currency: string;
  parts: RatePart[];
  condition: RateCondition | null;
  /** True when the service has its own rate for this condition; false when the standard rate is used. */
  specific: boolean;
}

/**
 * The rate for a service under a condition: its rate for that condition, or the standard rate when it
 * has none (only if the condition is in the business's own currency; otherwise null: price on request).
 */
export function priceFor(service: { rate: number; conditionRates?: ConditionRate[] }, condition: RateCondition | null | undefined, baseCurrency: string): PricedRate | null {
  if (!condition) return { rate: Number(service.rate) || 0, currency: baseCurrency, parts: [], condition: null, specific: false };
  const own = (service.conditionRates || []).find(r => r.conditionId === condition.id);
  if (own) return { rate: own.rate, currency: condition.currency, parts: own.parts || [], condition, specific: true };
  if (condition.currency === baseCurrency) return { rate: Number(service.rate) || 0, currency: baseCurrency, parts: [], condition, specific: false };
  return null;
}

/** "AUD 400 gear + AUD 600 labour" */
export const partsLabel = (parts: RatePart[], currency: string) =>
  parts.map(p => `${currency} ${p.rate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${p.label.toLowerCase()}`).join(' + ');

/** Ready-made sets of conditions to start from. */
export const CONDITION_TEMPLATES: { id: string; name: string; conditions: (base: string) => Omit<RateCondition, 'id'>[] }[] = [
  {
    id: 'production', name: 'Film, video and audio production',
    conditions: base => [
      { name: 'Local production', description: 'A Fiji-based crew or production company', currency: base },
      { name: 'International production in Fiji', description: 'An overseas production hiring locally in Fiji', currency: base },
      { name: 'Overseas work (travel)', description: 'Work outside Fiji. Flights, accommodation and per diems are extra.', currency: 'AUD', noVat: true }
    ]
  },
  {
    id: 'client', name: 'Type of client',
    conditions: base => [
      { name: 'Local business', description: 'Fiji-registered businesses', currency: base },
      { name: 'NGO, church or community', description: 'Not-for-profit and community groups', currency: base },
      { name: 'Government or donor-funded', description: 'Government agencies and donor-funded projects', currency: base },
      { name: 'International client', description: 'Clients based outside Fiji', currency: 'USD', noVat: true }
    ]
  },
  {
    id: 'location', name: 'Where the work is',
    conditions: base => [
      { name: 'Suva, Nadi and Lautoka', description: 'Within the main centres', currency: base },
      { name: 'Rural Viti Levu or Vanua Levu', description: 'Travel time and transport included', currency: base },
      { name: 'Outer islands', description: 'Boat or flight transfers needed', currency: base }
    ]
  }
];

// ---------- Marketplace service listings: rate options ----------

export interface PriceOption { id: string; label: string; description: string; amount: number; currency: string; parts?: RatePart[] }
export const MAX_PRICE_OPTIONS = 8;

/** A listing's rate options (e.g. Local production FJD 600/day, Overseas AUD 1,000/day), tidied. */
export function cleanPriceOptions(raw: unknown, baseCurrency = 'FJD'): PriceOption[] {
  const seen = new Set<string>();
  const out: PriceOption[] = [];
  for (const [i, o] of (Array.isArray(raw) ? raw.slice(0, MAX_PRICE_OPTIONS) : []).entries()) {
    const label = str((o as any)?.label, 60);
    if (!label) continue;
    let id = str((o as any)?.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || `o${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const parts = (Array.isArray((o as any)?.parts) ? (o as any).parts : []).slice(0, MAX_PARTS)
      .map((p: any) => ({ label: str(p?.label, 40), rate: amount(p?.rate) })).filter((p: RatePart) => p.label);
    const total = parts.length ? Math.round(parts.reduce((s2: number, p: RatePart) => s2 + p.rate, 0) * 100) / 100 : amount((o as any)?.amount);
    if (!total) continue;
    out.push({ id, label, description: str((o as any)?.description, 160), amount: total, currency: code((o as any)?.currency, baseCurrency), ...(parts.length ? { parts } : {}) });
  }
  return out;
}
