import type { CRMDocument, DocumentItem } from '../types';
import { cents, cleanDiscount, beforeTaxDiscount, afterTaxDiscount, roundingFor } from './documentAdjustments';

// Reimbursable expenses on invoices. A reimbursement line passes a cost on to the client; by
// default no VAT, taxes or percentage fees are charged on it, unless the line is marked taxable.

export const isReimbursement = (it: Pick<DocumentItem, 'kind'>) => it.kind === 'reimbursement';

/** Lines that taxes and percentage fees are charged on. */
export const isTaxableLine = (it: DocumentItem) => !isReimbursement(it) || it.taxable === true;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotals(items: DocumentItem[]) {
  const subtotal = items.reduce((s, it) => s + (it.total || 0), 0);
  const taxableBase = items.filter(isTaxableLine).reduce((s, it) => s + (it.total || 0), 0);
  const reimbursements = items.filter(isReimbursement).reduce((s, it) => s + (it.total || 0), 0);
  const reimbursementsNoVat = items.filter(it => isReimbursement(it) && !it.taxable).reduce((s, it) => s + (it.total || 0), 0);
  /** Cost recovered from the client (reimbursement totals less any markup). */
  const recoveredCost = items.filter(isReimbursement).reduce((s, it) => s + Math.min(it.total || 0, it.costAmount ?? it.total ?? 0), 0);
  return { subtotal: r2(subtotal), taxableBase: r2(taxableBase), reimbursements: r2(reimbursements), reimbursementsNoVat: r2(reimbursementsNoVat), recoveredCost: r2(recoveredCost) };
}

/** Invoice lines for expenses being billed to a client. */
export function reimbursementLines(
  expenses: { id: string; date: string; vendor: string; description?: string; amount: number; receiptFile?: { id: string; name: string } }[],
  { markupPercent = 0, chargeVat = false }: { markupPercent?: number; chargeVat?: boolean } = {}
): DocumentItem[] {
  return expenses.map(e => {
    const total = r2(e.amount * (1 + markupPercent / 100));
    return {
      id: `item-exp-${e.id}`,
      kind: 'reimbursement',
      expenseId: e.id,
      name: e.vendor,
      description: [e.date, e.description && e.description !== e.vendor ? e.description : ''].filter(Boolean).join(' · '),
      quantity: 1,
      rate: total,
      total,
      costAmount: r2(e.amount),
      taxable: chargeVat,
      receiptFileId: e.receiptFile?.id,
      receiptFileName: e.receiptFile?.name
    };
  });
}

/**
 * Keeps expenses' "billed on" links in step with a saved invoice: expenses on its reimbursement
 * lines point at it; ones removed from it are released for billing again.
 */
export function linkBilledExpenses<E extends { id: string; billedDocumentId?: string }>(expenses: E[], documentId: string, items: DocumentItem[] | null): E[] {
  const billed = new Set((items || []).filter(isReimbursement).map(it => it.expenseId).filter(Boolean) as string[]);
  let changed = false;
  const next = expenses.map(e => {
    if (billed.has(e.id) && e.billedDocumentId !== documentId) {
      changed = true;
      return { ...e, billedDocumentId: documentId, updatedAt: new Date().toISOString() };
    }
    if (!billed.has(e.id) && e.billedDocumentId === documentId) {
      changed = true;
      // Empty rather than removed: the cloud merge keeps fields a newer copy leaves out.
      return { ...e, billedDocumentId: '', updatedAt: new Date().toISOString() };
    }
    return e;
  });
  return changed ? next : expenses;
}

/**
 * Recomputes a document's totals after its lines change, keeping its taxes and fees: percentage
 * charges are re-applied to the taxable base, flat ones stay as they are. Tax-exempt documents
 * (or `taxOff`) get no VAT.
 */
/**
 * Works a document's taxes, fees, discount, rounding and total out again for new lines.
 * - Normally a percentage discount is re-applied to the new lines, an amount discount and a
 *   "nearest $10"-style rounding are kept, and a "set the total to $X" rounding is dropped (the lines
 *   changed, so the old figure no longer applies).
 * - With `keepAdjustments` (a final invoice less deposits), the discount and rounding keep their
 *   amounts, so the deposit and final invoices add up to the quote.
 */
export function recalcDocumentTotals<D extends Pick<CRMDocument, 'items' | 'vatRate' | 'appliedTaxes' | 'appliedFees' | 'isTaxExempt' | 'discount' | 'roundingAdjustment' | 'roundingRule'>>(
  doc: D, items: DocumentItem[], taxOff = false, { keepAdjustments = false }: { keepAdjustments?: boolean } = {}
) {
  const { subtotal, taxableBase: lineTaxableBase } = lineTotals(items);
  const rule = cleanDiscount(doc.discount);
  const kept = keepAdjustments && doc.discount ? { ...rule!, type: 'amount' as const, value: doc.discount.amount } : rule;
  const before = beforeTaxDiscount(kept, subtotal);
  const taxableBase = cents(lineTaxableBase * before.factor);
  const noTax = taxOff || doc.isTaxExempt === true;
  const reapply = (c: { rateType: 'percentage' | 'flat'; rate: number; amount: number }) =>
    c.rateType === 'percentage' ? cents(taxableBase * c.rate / 100) : c.amount;
  const appliedFees = (doc.appliedFees || []).map(f => ({ ...f, amount: reapply(f) }));
  const appliedTaxes = noTax ? [] : (doc.appliedTaxes || []).map(t => ({ ...t, amount: reapply(t) }));
  const vatTax = appliedTaxes.find(t => t.id === 'ptax-1' || t.name.toLowerCase().includes('vat'));
  const vatRate = noTax ? 0 : (vatTax ? vatTax.rate : doc.vatRate || 0);
  const vatAmount = noTax ? 0 : (vatTax ? vatTax.amount : cents(taxableBase * vatRate / 100));
  const taxTotal = appliedTaxes.length ? cents(appliedTaxes.reduce((s, t) => s + t.amount, 0)) : vatAmount;
  const feeTotal = cents(appliedFees.reduce((s, f) => s + f.amount, 0));
  const taxed = cents(subtotal - before.amount + taxTotal + feeTotal);
  const afterAmount = afterTaxDiscount(kept, taxed);
  const beforeRounding = cents(taxed - afterAmount);
  const roundingRule = keepAdjustments ? undefined : doc.roundingRule?.mode === 'step' ? doc.roundingRule : undefined;
  const roundingAdjustment = keepAdjustments
    ? (doc.roundingAdjustment || 0)
    : roundingRule?.mode === 'step' ? roundingFor(beforeRounding, { step: roundingRule.step, direction: roundingRule.direction }) : 0;
  const discount = rule ? { ...rule, amount: rule.timing === 'before_tax' ? before.amount : afterAmount } : undefined;
  return {
    items, subtotal, vatRate, vatAmount,
    ...(doc.appliedTaxes ? { appliedTaxes, taxTotal } : {}),
    ...(doc.appliedFees ? { appliedFees, feeTotal } : {}),
    discount,
    roundingAdjustment: roundingAdjustment || undefined,
    roundingRule,
    total: cents(beforeRounding + roundingAdjustment)
  };
}
