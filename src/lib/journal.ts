import type { CRMData, CRMDocument, ExpenseRecord, Transaction } from '../types';
import { getDocumentHomeValues } from './currencies';
import { resolveAccount, type MoneyAccount } from './accounts';
import { isBill } from './bills';

// A double-entry journal worked out from everything Frilensa records: invoices, receipts and credit notes,
// payments, expenses and supplier bills, contractor tax, payroll, and payments to FRCS and FNPF. Nothing is
// stored; it's rebuilt when needed, so it always matches the records. Bank balances and the accountant
// reports (trial balance, balance sheet, cash flow, general ledger) all come from it, so they agree.
// Amounts are in the home currency, on the accrual (invoice) basis.

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface LedgerAccount { code: string; name: string; type: AccountType; group: string }

export interface JournalLine { account: string; debit: number; credit: number; docId?: string }
export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  /** What it came from, so the user can find it. */
  source: { kind: 'invoice' | 'receipt' | 'credit_note' | 'payment' | 'transaction' | 'expense' | 'bill' | 'bill_payment' | 'contractor' | 'payroll' | 'tax_payment' | 'opening' | 'adjustment'; id: string; reference?: string };
  lines: JournalLine[];
}

const FIXED: LedgerAccount[] = [
  { code: 'cash:unassigned', name: 'Money not assigned to an account', type: 'asset', group: 'Cash and bank' },
  { code: 'ar', name: 'Accounts receivable (clients owe you)', type: 'asset', group: 'Receivables' },
  { code: 'tax_credit', name: 'Tax withheld by clients (claim in your return)', type: 'asset', group: 'Receivables' },
  { code: 'ap', name: 'Accounts payable (you owe suppliers)', type: 'liability', group: 'Payables' },
  { code: 'vat', name: 'VAT owing to FRCS', type: 'liability', group: 'Tax' },
  { code: 'paye', name: 'PAYE owing to FRCS', type: 'liability', group: 'Tax' },
  { code: 'pt', name: 'Provisional tax withheld, owing to FRCS', type: 'liability', group: 'Tax' },
  { code: 'nrwht', name: 'Non-resident withholding tax owing to FRCS', type: 'liability', group: 'Tax' },
  { code: 'fnpf', name: 'FNPF owing', type: 'liability', group: 'Payroll' },
  { code: 'payroll_deductions', name: 'Other pay deductions to pay over', type: 'liability', group: 'Payroll' },
  { code: 'opening_equity', name: 'Opening balances and capital', type: 'equity', group: 'Equity' },
  { code: 'drawings', name: 'Owner drawings', type: 'equity', group: 'Equity' },
  { code: 'sales', name: 'Sales', type: 'income', group: 'Income' },
  { code: 'other_income', name: 'Other income', type: 'income', group: 'Income' },
  { code: 'fx_fees', name: 'Bank fees and exchange differences', type: 'expense', group: 'Expenses' },
  { code: 'exp:Wages & Salaries', name: 'Wages & Salaries', type: 'expense', group: 'Expenses' },
  { code: 'exp:Employer FNPF', name: 'Employer FNPF', type: 'expense', group: 'Expenses' }
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (s?: string) => (s || '').slice(0, 10);

/** The account for a category of spending or income. Some categories are really balance-sheet movements. */
function categoryAccount(category: string | undefined, income: boolean): string {
  const c = (category || '').trim();
  if (/^vat\b.*(payment|refund)|^vat payment/i.test(c)) return 'vat';
  if (/drawing/i.test(c)) return 'drawings';
  if (/owner.*(capital|contribution|investment)|^capital/i.test(c)) return 'opening_equity';
  if (income) return /revenue|sales|consult|service/i.test(c) || !c ? 'sales' : `inc:${c}`;
  return `exp:${c || 'Other Expense'}`;
}

export interface Journal {
  entries: JournalEntry[];
  accounts: Map<string, LedgerAccount>;
  moneyAccounts: MoneyAccount[];
}

/**
 * Builds the journal for one business (or all). `asOf` leaves out anything after that date.
 * Every entry balances: debits equal credits.
 */
export function buildJournal(data: CRMData, opts: { businessId?: string | null; asOf?: string } = {}): Journal {
  const home = data.userProfile?.defaultCurrency || 'FJD';
  const inBiz = (bid?: string) => !opts.businessId || !bid || bid === opts.businessId;
  const money = (data.bankAccounts || []).filter(a => !opts.businessId || !a.businessId || a.businessId === opts.businessId);
  const accounts = new Map<string, LedgerAccount>(FIXED.map(a => [a.code, a]));
  for (const a of money) accounts.set(`cash:${a.id}`, { code: `cash:${a.id}`, name: a.name, type: 'asset', group: 'Cash and bank' });
  const ensure = (code: string) => {
    if (accounts.has(code)) return;
    const [kind, ...rest] = code.split(':');
    const name = rest.join(':') || code;
    accounts.set(code, { code, name, type: kind === 'inc' ? 'income' : 'expense', group: kind === 'inc' ? 'Income' : 'Expenses' });
  };
  const cash = (ref: { accountId?: string; method?: string; businessId?: string }) => {
    const a = resolveAccount(money, ref);
    return a ? `cash:${a.id}` : 'cash:unassigned';
  };

  const entries: JournalEntry[] = [];
  const push = (e: JournalEntry) => {
    const lines = e.lines.filter(l => Math.abs(l.debit) > 0.004 || Math.abs(l.credit) > 0.004).map(l => ({ ...l, debit: r2(l.debit), credit: r2(l.credit) }));
    if (!lines.length) return;
    lines.forEach(l => ensure(l.account));
    // Rounding: put any cent left over on the largest line so the entry balances exactly.
    const diff = r2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
    if (diff !== 0) {
      const big = lines.reduce((m, l) => (l.debit + l.credit > m.debit + m.credit ? l : m), lines[0]);
      if (diff > 0) big.credit = r2(big.credit + diff); else big.debit = r2(big.debit - diff);
    }
    entries.push({ ...e, lines });
  };
  const dr = (account: string, amount: number, docId?: string): JournalLine => amount >= 0 ? { account, debit: amount, credit: 0, docId } : { account, debit: 0, credit: -amount, docId };
  const cr = (account: string, amount: number, docId?: string): JournalLine => dr(account, -amount, docId);

  // ---------- Sales documents ----------
  const docs = (data.documents || []).filter(d => inBiz(d.businessId));
  const conv = (d: CRMDocument) => getDocumentHomeValues(d, home, data.businesses.find(b => b.id === d.businessId)?.customExchangeRates, data.transactions);
  const creditedInvoices = new Set(docs.filter(d => d.type === 'credit_note' && d.originalInvoiceId).map(d => d.originalInvoiceId!));
  const txs = (data.transactions || []).filter(t => inBiz(t.businessId));
  const linkedDocs = new Set(txs.flatMap(t => (t.documentId || '').split(',').map(s => s.trim()).filter(Boolean)));
  const docTotal = new Map<string, number>();

  for (const d of docs) {
    const c = conv(d);
    const total = r2(c.homeTotal), vat = r2(c.vatHome);
    if (d.type === 'invoice') {
      if (d.status === 'draft' || (d.status === 'cancelled' && !creditedInvoices.has(d.id))) continue;
      docTotal.set(d.id, total);
      push({ id: `inv:${d.id}`, date: day(d.issueDate), description: `Invoice ${d.documentNumber}`, source: { kind: 'invoice', id: d.id, reference: d.documentNumber },
        lines: [dr('ar', total, d.id), cr('sales', total - vat), cr('vat', vat)] });
    } else if (d.type === 'receipt' && !d.originalInvoiceId && d.status !== 'cancelled') {
      docTotal.set(d.id, total);
      push({ id: `rec:${d.id}`, date: day(d.issueDate), description: `Receipt ${d.documentNumber}`, source: { kind: 'receipt', id: d.id, reference: d.documentNumber },
        lines: [dr('ar', total, d.id), cr('sales', total - vat), cr('vat', vat)] });
      // Paid on the spot: unless a ledger entry records the money, it went to the account for its method.
      if (!linkedDocs.has(d.id)) push({ id: `recpay:${d.id}`, date: day(d.issueDate), description: `Paid: receipt ${d.documentNumber}`, source: { kind: 'payment', id: d.id, reference: d.documentNumber },
        lines: [dr(cash({ method: d.paymentMethod, businessId: d.businessId }), total), cr('ar', total, d.id)] });
    } else if (d.type === 'credit_note') {
      push({ id: `cn:${d.id}`, date: day(d.issueDate), description: `Credit note ${d.documentNumber}`, source: { kind: 'credit_note', id: d.id, reference: d.documentNumber },
        lines: [dr('sales', total - vat), dr('vat', vat), cr('ar', total, d.originalInvoiceId)] });
    }
  }

  // ---------- Expenses, bills and contractor payments ----------
  const expenseIds = new Set<string>();
  const runExpenseIds = new Set((data.payRuns || []).flatMap(r => r.expenseIds || []));
  for (const e of (data.expenses || []) as ExpenseRecord[]) {
    expenseIds.add(e.id);
    if (!inBiz(e.businessId) || runExpenseIds.has(e.id) || e.bill?.voided) continue;
    const vat = e.isVatClaimable ? Math.min(e.amount || 0, e.vatAmount || 0) : 0;
    const cost = (e.amount || 0) - vat;
    const expAcct = categoryAccount(e.category, false);
    const ownTx = txs.find(t => t.id === e.id);
    if (isBill(e)) {
      push({ id: `bill:${e.id}`, date: day(e.date), description: `Bill: ${e.vendor}${e.bill.number ? ` ${e.bill.number}` : ''}`, source: { kind: 'bill', id: e.id, reference: e.bill.number },
        lines: [dr(expAcct, cost), dr('vat', vat), cr('ap', e.amount)] });
      for (const p of e.bill.payments) {
        const t = txs.find(x => x.id === `${e.id}-pay-${p.id}`);
        push({ id: `billpay:${e.id}:${p.id}`, date: day(p.date), description: `Paid ${e.vendor}${e.bill.number ? ` bill ${e.bill.number}` : ''}`, source: { kind: 'bill_payment', id: e.id, reference: e.bill.number },
          lines: [dr('ap', p.amount), cr(cash({ accountId: t?.accountId || p.accountId, method: p.method, businessId: e.businessId }), p.amount)] });
      }
    } else if (e.contractorPayment) {
      const cp = e.contractorPayment;
      const owed = cp.kind === 'nrwht' ? 'nrwht' : 'pt';
      push({ id: `ctr:${e.id}`, date: day(e.date), description: `Paid ${cp.contractorName}${cp.withheld ? `, tax withheld` : ''}`, source: { kind: 'contractor', id: e.id, reference: cp.certificateNo },
        lines: [dr(expAcct, cost), dr('vat', vat), cr(owed, cp.withheld), cr(cash({ accountId: ownTx?.accountId, method: e.paymentMethod, businessId: e.businessId }), (e.amount || 0) - cp.withheld)] });
      if (cp.kind === 'nrwht' && cp.paidToFrcs && cp.withheld > 0) push({ id: `nrwhtpay:${e.id}`, date: day(cp.paidToFrcs.date), description: `Non-resident withholding tax paid (${cp.contractorName})`, source: { kind: 'tax_payment', id: e.id, reference: cp.paidToFrcs.reference },
        lines: [dr('nrwht', cp.withheld), cr(cash({ businessId: e.businessId }), cp.withheld)] });
    } else {
      push({ id: `exp:${e.id}`, date: day(e.date), description: `${e.vendor || 'Expense'}${e.description ? `: ${e.description}` : ''}`, source: { kind: 'expense', id: e.id },
        lines: [dr(expAcct, cost), dr('vat', vat), cr(cash({ accountId: ownTx?.accountId, method: ownTx?.bankName || e.paymentMethod, businessId: e.businessId }), e.amount || 0)] });
    }
  }

  // ---------- Ledger entries (payments received, and anything not recorded elsewhere) ----------
  for (const t of txs as Transaction[]) {
    if (expenseIds.has(t.id) || (t.expenseId && expenseIds.has(t.expenseId))) continue;
    const ids = (t.documentId || '').split(',').map(s => s.trim()).filter(id => docTotal.has(id));
    const acct = t.category === 'Provisional Tax Withheld' ? 'tax_credit' : cash({ accountId: t.accountId, method: t.bankName || t.paymentMethod, businessId: t.businessId });
    if (ids.length) {
      // A payment for one or more invoices: shared out in proportion to what each was for.
      const sum = ids.reduce((s, id) => s + (docTotal.get(id) || 0), 0) || 1;
      const lines: JournalLine[] = [dr(acct, t.amount)];
      ids.forEach(id => lines.push(cr('ar', t.amount * ((docTotal.get(id) || 0) / sum), id)));
      push({ id: `pay:${t.id}`, date: day(t.date), description: t.description || 'Payment received', source: { kind: 'payment', id: t.id, reference: t.referenceNumber }, lines });
      continue;
    }
    const vat = t.vatAmount && t.vatAmount > 0 && (t.amount > 0 || t.isVatClaimable === true) ? Math.min(Math.abs(t.amount), t.vatAmount) : 0;
    if (t.amount >= 0) push({ id: `tx:${t.id}`, date: day(t.date), description: t.description || 'Money in', source: { kind: 'transaction', id: t.id },
      lines: [dr(acct, t.amount), cr(categoryAccount(t.category, true), t.amount - vat), cr('vat', vat)] });
    else push({ id: `tx:${t.id}`, date: day(t.date), description: t.description || 'Money out', source: { kind: 'transaction', id: t.id },
      lines: [dr(categoryAccount(t.category, false), -t.amount - vat), dr('vat', vat), cr(acct, -t.amount)] });
  }

  // ---------- Paid invoices: settle what's left (bank fees, exchange differences) ----------
  const arByDoc = new Map<string, number>();
  for (const e of entries) for (const l of e.lines) if (l.account === 'ar' && l.docId) arByDoc.set(l.docId, (arByDoc.get(l.docId) || 0) + l.debit - l.credit);
  for (const d of docs) {
    if (d.type !== 'invoice' || d.status !== 'paid') continue;
    const left = r2(arByDoc.get(d.id) || 0);
    if (Math.abs(left) < 0.01) continue;
    // Paid without a ledger entry for the money: it went to the account for the payment method.
    if (!linkedDocs.has(d.id)) {
      push({ id: `paid:${d.id}`, date: day(d.paymentDate || d.issueDate), description: `Paid: invoice ${d.documentNumber}`, source: { kind: 'payment', id: d.id, reference: d.documentNumber },
        lines: [dr(cash({ method: d.paymentMethod, businessId: d.businessId }), left), cr('ar', left, d.id)] });
      continue;
    }
    push({ id: `settle:${d.id}`, date: day(d.paymentDate || d.issueDate), description: `${left > 0 ? 'Fees or exchange difference' : 'Exchange gain'} on invoice ${d.documentNumber}`, source: { kind: 'adjustment', id: d.id, reference: d.documentNumber },
      lines: left > 0 ? [dr('fx_fees', left), cr('ar', left, d.id)] : [dr('ar', -left, d.id), cr('other_income', -left)] });
  }

  // ---------- Payroll ----------
  for (const r of data.payRuns || []) {
    if (r.status !== 'paid' || !inBiz(r.businessId)) continue;
    const s = (k: 'gross' | 'reimbursements' | 'paye' | 'fnpfEmployee' | 'fnpfEmployer' | 'otherDeductions' | 'net') => r.lines.reduce((t, l) => t + (Number(l[k]) || 0), 0);
    push({ id: `run:${r.id}`, date: day(r.payDate), description: `Pay run ${r.periodStart} to ${r.periodEnd}`, source: { kind: 'payroll', id: r.id },
      lines: [dr('exp:Wages & Salaries', s('gross') + s('reimbursements')), dr('exp:Employer FNPF', s('fnpfEmployer')),
        cr(cash({ accountId: r.accountId, businessId: r.businessId }), s('net')), cr('paye', s('paye')), cr('fnpf', s('fnpfEmployee') + s('fnpfEmployer')), cr('payroll_deductions', s('otherDeductions'))] });
  }
  for (const p of data.payrollPayments || []) {
    if (!inBiz(p.businessId)) continue;
    const acct = p.kind === 'paye' ? 'paye' : 'fnpf';
    push({ id: `prp:${p.id}`, date: day(p.date), description: `${p.kind === 'paye' ? 'PAYE' : 'FNPF'} paid for ${p.month}`, source: { kind: 'tax_payment', id: p.id, reference: p.reference },
      lines: [dr(acct, p.amount), cr(cash({ accountId: p.accountId, businessId: p.businessId }), p.amount)] });
  }
  for (const p of data.ptRemittances || []) {
    if (!inBiz(p.businessId)) continue;
    push({ id: `ptr:${p.id}`, date: day(p.date), description: `Provisional tax paid for ${p.month}`, source: { kind: 'tax_payment', id: p.id, reference: p.reference },
      lines: [dr('pt', p.amount), cr(cash({ accountId: p.accountId, businessId: p.businessId }), p.amount)] });
  }

  // ---------- Opening balances: each account starts its opening date at the balance given ----------
  for (const a of money) {
    const code = `cash:${a.id}`;
    const before = entries.filter(e => e.date < a.openingDate).reduce((s, e) => s + e.lines.filter(l => l.account === code).reduce((t, l) => t + l.debit - l.credit, 0), 0);
    const amount = r2(a.openingBalance - before);
    push({ id: `open:${a.id}`, date: a.openingDate, description: `Opening balance: ${a.name}`, source: { kind: 'opening', id: a.id },
      lines: [dr(code, amount), cr('opening_equity', amount)] });
  }

  const kept = (opts.asOf ? entries.filter(e => e.date <= opts.asOf!) : entries).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { entries: kept, accounts, moneyAccounts: money };
}

/** Each account's balance (debits less credits) from a journal, optionally between dates. */
export function balances(j: Journal, from?: string, to?: string) {
  const out = new Map<string, { debit: number; credit: number; balance: number }>();
  for (const e of j.entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) {
      const b = out.get(l.account) || { debit: 0, credit: 0, balance: 0 };
      b.debit = r2(b.debit + l.debit); b.credit = r2(b.credit + l.credit); b.balance = r2(b.debit - b.credit);
      out.set(l.account, b);
    }
  }
  return out;
}

/** Money accounts with their balances on a date, and what isn't assigned to one yet. */
export function accountBalances(data: CRMData, businessId?: string | null, asOf?: string) {
  const j = buildJournal(data, { businessId, asOf });
  const b = balances(j);
  return {
    accounts: j.moneyAccounts.map(a => ({ account: a, balance: b.get(`cash:${a.id}`)?.balance || 0 })),
    unassigned: b.get('cash:unassigned')?.balance || 0,
    journal: j
  };
}

/** The entries that moved one account, newest first, with the running balance after each. */
export function accountActivity(j: Journal, code: string) {
  let running = 0;
  const rows = j.entries.filter(e => e.lines.some(l => l.account === code)).map(e => {
    const amount = r2(e.lines.filter(l => l.account === code).reduce((s, l) => s + l.debit - l.credit, 0));
    running = r2(running + amount);
    return { entry: e, amount, balance: running };
  });
  return rows.reverse();
}

/**
 * Puts the money in a journal entry on a chosen account, by setting accountId on the record it came from.
 * Returns null when the entry's account follows its payment method and can't be set directly.
 */
export function assignEntryAccount(data: CRMData, entry: JournalEntry, accountId: string): CRMData | null {
  const now = new Date().toISOString();
  const setTx = (id: string) => (data.transactions || []).some(t => t.id === id)
    ? { ...data, transactions: (data.transactions || []).map(t => t.id === id ? { ...t, accountId } : t) } : null;
  const [prefix, ...rest] = entry.id.split(':');
  const id = rest.join(':');
  switch (prefix) {
    case 'pay': case 'tx': case 'exp': case 'ctr': return setTx(id);
    case 'billpay': {
      const [expenseId, paymentId] = id.split(':');
      const next = { ...data, expenses: (data.expenses || []).map(e => e.id === expenseId && e.bill
        ? { ...e, bill: { ...e.bill, payments: e.bill.payments.map(p => p.id === paymentId ? { ...p, accountId } : p) } } : e) };
      return { ...next, transactions: (next.transactions || []).map(t => t.id === `${expenseId}-pay-${paymentId}` ? { ...t, accountId } : t) };
    }
    case 'run': return { ...data, payRuns: (data.payRuns || []).map(r => r.id === id ? { ...r, accountId, updatedAt: now } : r) };
    case 'prp': return { ...data, payrollPayments: (data.payrollPayments || []).map(p => p.id === id ? { ...p, accountId, updatedAt: now } : p) };
    case 'ptr': return { ...data, ptRemittances: (data.ptRemittances || []).map(p => p.id === id ? { ...p, accountId, updatedAt: now } : p) };
    default: return null;
  }
}
