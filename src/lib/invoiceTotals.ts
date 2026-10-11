import type { DocumentItem } from '../types';

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
