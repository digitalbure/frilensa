import type { CRMData, Transaction } from '../types';

// Takings: cash, card and mobile money sales recorded without an invoice (a market stall's day, a canteen's
// till). Each is a ledger entry with `takings: true`, so it counts as sales (with its output VAT) in the
// P&L, the VAT return, the journal and the right money account.

export const TAKINGS_METHODS = ['Cash', 'Card / EFTPOS', 'Vodafone M-PAiSA', 'Digicel MyCash', 'Bank Transfer'];
export const TAKINGS_CATEGORY = 'Sales (takings)';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The VAT included in an amount, at the business's rate (0 when it doesn't charge VAT). */
export function vatIncluded(amount: number, data: Pick<CRMData, 'userProfile'>) {
  if (data.userProfile?.enableTax === false) return 0;
  const rate = Number(data.userProfile?.defaultVatRate ?? 12.5) || 0;
  return rate > 0 ? round2(amount * rate / (100 + rate)) : 0;
}

export interface TakingsInput { date: string; amount: number; method: string; note?: string; vatIncluded: boolean; accountId?: string; businessId?: string }

/** Checks takings from the form; returns an error message or the ledger entry. */
export function takingsEntry(input: TakingsInput, data: Pick<CRMData, 'userProfile' | 'activeBusinessId'>): Transaction | string {
  const amount = round2(Number(input.amount) || 0);
  if (!(amount > 0)) return 'Enter how much you took.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Choose the day.';
  const note = (input.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const vat = input.vatIncluded ? vatIncluded(amount, data) : 0;
  return {
    id: `tx-take-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: input.date,
    description: `Takings${note ? `: ${note}` : ''} (${input.method})`,
    amount,
    category: TAKINGS_CATEGORY,
    status: 'reconciled',
    confidence: 100,
    bankName: input.method,
    paymentMethod: input.method,
    ...(vat > 0 ? { vatAmount: vat } : {}),
    businessId: input.businessId || data.activeBusinessId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    notes: note || undefined,
    takings: true
  } as Transaction;
}

/** Takings for a business, newest first, with totals for today, this week (from Monday) and this month. */
export function takingsSummary(data: Pick<CRMData, 'transactions' | 'activeBusinessId'>, today: string, businessId = data.activeBusinessId) {
  const list = (data.transactions || []).filter(t => t.takings && (!businessId || !t.businessId || t.businessId === businessId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const d = new Date(`${today}T00:00:00Z`);
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);
  const sum = (from: string) => round2(list.filter(t => t.date >= from && t.date <= today).reduce((s, t) => s + t.amount, 0));
  return { list, today: sum(today), week: sum(weekStart), month: sum(`${today.slice(0, 7)}-01`) };
}
