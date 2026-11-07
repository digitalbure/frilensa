import type { CRMDocument } from '../types';

// Discounts and rounding on quotes and invoices.
//
// Order of the totals:
//   lines subtotal
//   − discount before tax   (lowers what taxes and percentage fees are charged on)
//   + taxes + fees
//   − discount after tax    (taken off the taxed total; the taxes stay as charged)
//   ± rounding              (a small adjustment so the total lands on a round figure)
//   = total

export type DiscountType = 'percent' | 'amount';
export type DiscountTiming = 'before_tax' | 'after_tax';

/** How the total is rounded: to a step (nearest/down/up), or to an exact figure. */
export type RoundingRule = { mode: 'step'; step: number; direction: 'nearest' | 'down' | 'up' } | { mode: 'target'; target: number };

export interface DocumentDiscount {
  type: DiscountType;
  /** The percentage (0–100) or the amount, as entered. */
  value: number;
  timing: DiscountTiming;
  /** Shown on the document, e.g. "Loyal client discount". Defaults to "Discount". */
  label?: string;
  /** What the discount came to, in the document's currency (positive; set when totals are worked out). */
  amount: number;
}

/** Rounds money to the cent, halves up (12.5% of 4,444.44 = 555.555 → 555.56). */
export const cents = (n: number) => Math.round(Number((n * 100).toFixed(6))) / 100;

/** A discount as entered, cleaned up: null when there's nothing to take off. */
export function cleanDiscount(d: Partial<DocumentDiscount> | null | undefined): Omit<DocumentDiscount, 'amount'> | null {
  if (!d) return null;
  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const type: DiscountType = d.type === 'amount' ? 'amount' : 'percent';
  return {
    type,
    value: type === 'percent' ? Math.min(100, value) : cents(value),
    timing: d.timing === 'after_tax' ? 'after_tax' : 'before_tax',
    ...(d.label?.trim() ? { label: d.label.trim().slice(0, 60) } : {})
  };
}

/**
 * A before-tax discount on the lines. Returns the discount amount and the share of the taxable base
 * left to charge taxes on (the discount is spread over taxable and untaxed lines alike).
 */
export function beforeTaxDiscount(discount: ReturnType<typeof cleanDiscount>, subtotal: number) {
  if (!discount || discount.timing !== 'before_tax' || subtotal <= 0) return { amount: 0, factor: 1 };
  const amount = cents(Math.min(subtotal, discount.type === 'percent' ? subtotal * discount.value / 100 : discount.value));
  return { amount, factor: subtotal > 0 ? (subtotal - amount) / subtotal : 1 };
}

/** An after-tax discount on the taxed total. */
export function afterTaxDiscount(discount: ReturnType<typeof cleanDiscount>, taxedTotal: number) {
  if (!discount || discount.timing !== 'after_tax' || taxedTotal <= 0) return 0;
  return cents(Math.min(taxedTotal, discount.type === 'percent' ? taxedTotal * discount.value / 100 : discount.value));
}

/** The rounding needed to bring `total` to `target` (or to the nearest `step` when no target is given). */
export function roundingFor(total: number, opts: { target?: number; step?: number; direction?: 'nearest' | 'down' | 'up' }) {
  let target = opts.target;
  if (target === undefined && opts.step && opts.step > 0) {
    const n = total / opts.step;
    const k = opts.direction === 'down' ? Math.floor(n + 1e-9) : opts.direction === 'up' ? Math.ceil(n - 1e-9) : Math.round(n);
    target = k * opts.step;
  }
  return target === undefined ? 0 : cents(target - total);
}

/** The rows to print between the taxes and the total, in order, for any screen, PDF or email. */
export function adjustmentRows(doc: Pick<CRMDocument, 'discount' | 'roundingAdjustment'>) {
  const rows: { key: 'discount_before' | 'discount_after' | 'rounding'; label: string; amount: number }[] = [];
  const d = doc.discount;
  if (d && d.amount > 0) {
    const name = d.label || 'Discount';
    const pct = d.type === 'percent' ? ` (${d.value}%)` : '';
    rows.push({ key: d.timing === 'after_tax' ? 'discount_after' : 'discount_before', label: `${name}${pct}`, amount: -d.amount });
  }
  if (doc.roundingAdjustment) rows.push({ key: 'rounding', label: 'Rounding', amount: doc.roundingAdjustment });
  return rows;
}
