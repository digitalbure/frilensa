import type { CRMData, ExpenseRecord, Transaction } from '../types';

// Suppliers and the bills they send. A bill is an expense with `bill` details: it counts as a cost (and its
// VAT as input VAT on the invoice basis) on the bill date, and money only leaves the bank when it's paid.
// Each payment gets its own ledger entry (id `${expenseId}-pay-${paymentId}`, with `expenseId`), so the
// bank shows what was really paid and when. Ordinary expenses are paid on the day and keep their single
// ledger entry with the expense's id.

export interface Supplier {
  id: string;
  businessId?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  tin?: string;
  contactPerson?: string;
  vatRegistered?: boolean;
  /** Days they give you to pay, for new bills. */
  paymentTermsDays?: number;
  /** Their bank or M-PAiSA details, for paying them. */
  bankDetails?: string;
  defaultCategory?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BillPayment {
  id: string;
  date: string;
  amount: number;
  method: string;
  accountId?: string;
  reference?: string;
}

export interface BillDetails {
  supplierId?: string;
  /** The supplier's invoice number. */
  number?: string;
  dueDate: string;
  payments: BillPayment[];
  /** Voided bills stay on record but count for nothing. */
  voided?: { date: string; reason: string };
}

export type BillStatus = 'unpaid' | 'part' | 'paid' | 'overdue' | 'void';

const round2 = (n: number) => Math.round(n * 100) / 100;
export const isBill = (e: ExpenseRecord): e is ExpenseRecord & { bill: BillDetails } => !!e?.bill;
export const billPaid = (e: ExpenseRecord & { bill: BillDetails }) => round2(e.bill.payments.reduce((s, p) => s + p.amount, 0));
export const billOwing = (e: ExpenseRecord & { bill: BillDetails }) => e.bill.voided ? 0 : Math.max(0, round2(e.amount - billPaid(e)));

export function billStatus(e: ExpenseRecord & { bill: BillDetails }, today: string): BillStatus {
  if (e.bill.voided) return 'void';
  const owing = billOwing(e);
  if (owing <= 0.004) return 'paid';
  if (e.bill.dueDate && e.bill.dueDate < today) return 'overdue';
  return billPaid(e) > 0 ? 'part' : 'unpaid';
}

/** The due date for a bill dated `date` with a supplier's terms. */
export function dueDateFor(date: string, termsDays = 30) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(termsDays)));
  return d.toISOString().slice(0, 10);
}

/** The ledger entries a bill's payments should have (none for the bill itself). */
export function billTransactions(e: ExpenseRecord & { bill: BillDetails }): Transaction[] {
  if (e.bill.voided) return [];
  return e.bill.payments.map(p => ({
    id: `${e.id}-pay-${p.id}`,
    expenseId: e.id,
    date: p.date,
    description: `Paid ${e.vendor}${e.bill.number ? ` bill ${e.bill.number}` : ''}`,
    amount: -Math.abs(p.amount),
    category: e.category,
    status: 'reconciled',
    confidence: 100,
    bankName: p.method || 'Bank Transfer',
    paymentMethod: p.method,
    vendor: e.vendor,
    referenceNumber: p.reference,
    businessId: e.businessId,
    projectId: e.projectId,
    ...(p.accountId ? { accountId: p.accountId } : {})
  } as Transaction));
}

/**
 * The ledger after saving an expense: an ordinary expense has one entry (paid now); a bill has one per
 * payment. A contractor payment's entry is what was actually paid out (after tax withheld).
 */
export function ledgerFor(transactions: Transaction[], e: ExpenseRecord, single: Transaction): Transaction[] {
  const others = transactions.filter(t => t.id !== e.id && t.expenseId !== e.id && !t.id.startsWith(`${e.id}-pay-`));
  if (isBill(e)) return [...billTransactions(e), ...others];
  const paidOut = e.contractorPayment ? -Math.abs(e.contractorPayment.net) : single.amount;
  return [{ ...single, amount: paidOut }, ...others];
}

/** Adds a payment to a bill. Returns an error message when it can't be recorded. */
export function payBill(e: ExpenseRecord & { bill: BillDetails }, p: Omit<BillPayment, 'id'>): (ExpenseRecord & { bill: BillDetails }) | string {
  if (e.bill.voided) return 'This bill is void.';
  const amount = round2(Number(p.amount) || 0);
  if (amount <= 0) return 'Enter the amount paid.';
  if (amount > billOwing(e) + 0.004) return `That's more than is owing (${billOwing(e).toFixed(2)}).`;
  const id = `p${Date.now().toString(36)}${e.bill.payments.length + 1}`;
  return { ...e, bill: { ...e.bill, payments: [...e.bill.payments, { ...p, amount, id }] } };
}

export type AgeKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90';
export interface AgedRow extends Record<AgeKey, number> { id: string; name: string; total: number; count: number }
export const AGE_BUCKETS: { key: AgeKey; label: string }[] = [
  { key: 'current', label: 'Not due yet' }, { key: 'd1_30', label: '1–30 days' }, { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' }, { key: 'd90', label: 'Over 90 days' }
];

/** Which age bucket an amount falls in, by days past its due date on `asOf`. */
export function bucketFor(dueDate: string, asOf: string): AgeKey {
  const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${(dueDate || asOf).slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90';
}

export function emptyAged(id: string, name: string): AgedRow { return { id, name, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0, count: 0 }; }

/** What you owe suppliers on `asOf`, by how late each bill is. Counts payments made up to that date. */
export function agedPayables(data: Pick<CRMData, 'expenses'> & { suppliers?: Supplier[] }, asOf: string, businessId?: string) {
  const rows = new Map<string, AgedRow>();
  for (const e of data.expenses || []) {
    if (!isBill(e) || e.bill.voided || e.date > asOf || (businessId && (e.businessId || '') !== businessId)) continue;
    const paid = e.bill.payments.filter(p => p.date <= asOf).reduce((s, p) => s + p.amount, 0);
    const owing = round2(e.amount - paid);
    if (owing <= 0.004) continue;
    const key = e.bill.supplierId || `vendor:${e.vendor}`;
    const name = (e.bill.supplierId && data.suppliers?.find(s => s.id === e.bill.supplierId)?.name) || e.vendor || 'Unknown supplier';
    const row = rows.get(key) || emptyAged(key, name);
    const b = bucketFor(e.bill.dueDate || e.date, asOf);
    row[b] = round2(row[b] + owing);
    row.total = round2(row.total + owing);
    row.count++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

/** Tidies a supplier from the form. */
export function cleanSupplier(raw: Partial<Supplier>, now = new Date().toISOString()): Supplier | string {
  const name = str(raw.name, 160);
  if (!name) return 'Give the supplier a name.';
  const email = str(raw.email, 254);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Check the email address.';
  const terms = Number(raw.paymentTermsDays);
  return {
    id: raw.id || `sup-${Date.now().toString(36)}`,
    ...(raw.businessId ? { businessId: raw.businessId } : {}),
    name, email, phone: str(raw.phone, 40), address: str(raw.address, 300), tin: str(raw.tin, 40), contactPerson: str(raw.contactPerson, 120),
    vatRegistered: !!raw.vatRegistered,
    paymentTermsDays: Number.isFinite(terms) && terms >= 0 && terms <= 365 ? Math.round(terms) : 30,
    bankDetails: str(raw.bankDetails, 300), defaultCategory: str(raw.defaultCategory, 60), notes: str(raw.notes, 1000),
    createdAt: raw.createdAt || now, updatedAt: now
  };
}
