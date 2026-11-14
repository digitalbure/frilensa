import type { CRMData } from '../types';
import { balances, type Journal, type LedgerAccount } from './journal';
import { AGE_BUCKETS, bucketFor, emptyAged, type AgedRow } from './bills';

// Accountant reports, all from the journal (lib/journal.ts) so they agree with each other and with the
// bank balances: trial balance, balance sheet, cash flow, general ledger, who owes you (aged receivables)
// and sales by client. "What you owe" (aged payables) is in lib/bills.ts.

const r2 = (n: number) => Math.round(n * 100) / 100;
const isCash = (code: string) => code.startsWith('cash:');
const TYPE_ORDER: Record<string, number> = { asset: 0, liability: 1, equity: 2, income: 3, expense: 4 };

export interface TbRow { account: LedgerAccount; debit: number; credit: number }

/** Trial balance on a date: each account's balance as a debit or a credit. Debits equal credits. */
export function trialBalance(j: Journal, asOf: string) {
  const b = balances(j, undefined, asOf);
  const rows: TbRow[] = [];
  for (const [code, x] of b) {
    if (Math.abs(x.balance) < 0.005) continue;
    const account = j.accounts.get(code)!;
    rows.push({ account, debit: x.balance > 0 ? x.balance : 0, credit: x.balance < 0 ? -x.balance : 0 });
  }
  rows.sort((a, b) => TYPE_ORDER[a.account.type] - TYPE_ORDER[b.account.type] || a.account.name.localeCompare(b.account.name));
  return { asOf, rows, debit: r2(rows.reduce((s, r) => s + r.debit, 0)), credit: r2(rows.reduce((s, r) => s + r.credit, 0)) };
}

export interface BsLine { code: string; name: string; amount: number }
export interface BalanceSheet {
  asOf: string;
  assets: BsLine[]; liabilities: BsLine[]; equity: BsLine[];
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  /** Profit (or loss) to date, part of equity. */
  earnings: number;
}

/** What the business owns and owes on a date. Assets = liabilities + equity. */
export function balanceSheet(j: Journal, asOf: string): BalanceSheet {
  const b = balances(j, undefined, asOf);
  const assets: BsLine[] = [], liabilities: BsLine[] = [], equity: BsLine[] = [];
  let earnings = 0;
  for (const [code, x] of b) {
    const a = j.accounts.get(code)!;
    if (a.type === 'income' || a.type === 'expense') { earnings -= x.balance; continue; }
    if (Math.abs(x.balance) < 0.005) continue;
    if (a.type === 'asset') {
      // A credit card or overdrawn account is something you owe.
      if (x.balance < 0 && isCash(code)) liabilities.push({ code, name: j.moneyAccounts.find(m => `cash:${m.id}` === code)?.kind === 'card' ? a.name : `${a.name} (overdrawn)`, amount: -x.balance });
      else assets.push({ code, name: a.name, amount: x.balance });
    } else if (a.type === 'liability') {
      if (x.balance > 0) assets.push({ code, name: code === 'vat' ? 'VAT refund due from FRCS' : `${a.name} (paid ahead)`, amount: x.balance });
      else liabilities.push({ code, name: a.name, amount: -x.balance });
    } else equity.push({ code, name: a.name, amount: -x.balance });
  }
  earnings = r2(earnings);
  equity.push({ code: 'earnings', name: 'Profit to date', amount: earnings });
  const sum = (l: BsLine[]) => r2(l.reduce((s, x) => s + x.amount, 0));
  const order = (l: BsLine[]) => l.sort((a, b) => (isCash(b.code) ? 1 : 0) - (isCash(a.code) ? 1 : 0) || a.name.localeCompare(b.name));
  return { asOf, assets: order(assets), liabilities: order(liabilities), equity, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity: sum(equity), earnings };
}

export const CASH_FLOW_GROUPS = ['From clients', 'Other income', 'Suppliers and expenses', 'Wages and FNPF', 'Tax paid to FRCS', 'Owner', 'Between your accounts', 'Accounts added (opening balances)'] as const;
export type CashFlowGroup = typeof CASH_FLOW_GROUPS[number];

/** Money in and out of all cash and bank accounts between two dates, by what it was for. */
export function cashFlow(j: Journal, from: string, to: string) {
  const open = balances(j, undefined, prevDay(from));
  const opening = r2([...open].filter(([c]) => isCash(c)).reduce((s, [, x]) => s + x.balance, 0));
  const groups = new Map<CashFlowGroup, { in: number; out: number }>(CASH_FLOW_GROUPS.map(g => [g, { in: 0, out: 0 }]));
  for (const e of j.entries) {
    if (e.date < from || e.date > to) continue;
    const move = r2(e.lines.filter(l => isCash(l.account)).reduce((s, l) => s + l.debit - l.credit, 0));
    const others = e.lines.filter(l => !isCash(l.account)).map(l => l.account);
    let g: CashFlowGroup;
    if (e.source.kind === 'opening') g = 'Accounts added (opening balances)';
    else if (!others.length) g = 'Between your accounts';
    else if (others.some(a => a === 'ar' || a === 'sales' || a === 'tax_credit')) g = 'From clients';
    else if (others.some(a => a === 'opening_equity' || a === 'drawings')) g = 'Owner';
    else if (others.some(a => a === 'exp:Wages & Salaries' || a === 'exp:Employer FNPF' || a === 'fnpf' || a === 'payroll_deductions') || e.source.kind === 'payroll') g = 'Wages and FNPF';
    else if (others.every(a => ['vat', 'paye', 'pt', 'nrwht'].includes(a))) g = 'Tax paid to FRCS';
    else if (move > 0 && others.some(a => a.startsWith('inc:') || a === 'other_income')) g = 'Other income';
    else g = 'Suppliers and expenses';
    const x = groups.get(g)!;
    if (move >= 0) x.in = r2(x.in + move); else x.out = r2(x.out - move);
  }
  const rows = CASH_FLOW_GROUPS.map(g => ({ group: g, ...groups.get(g)!, net: r2(groups.get(g)!.in - groups.get(g)!.out) })).filter(r => r.in || r.out);
  const net = r2(rows.reduce((s, r) => s + r.net, 0));
  const closeB = balances(j, undefined, to);
  const closing = r2([...closeB].filter(([c]) => isCash(c)).reduce((s, [, x]) => s + x.balance, 0));
  return { from, to, opening, rows, net, closing };
}

function prevDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
}

export interface GlLine { date: string; entryId: string; description: string; reference: string; debit: number; credit: number; balance: number }

/** Every line on each account between two dates, with the balance brought forward and a running balance. */
export function generalLedger(j: Journal, from: string, to: string, onlyAccount?: string) {
  const start = balances(j, undefined, prevDay(from));
  const byAccount = new Map<string, { account: LedgerAccount; opening: number; lines: GlLine[]; closing: number }>();
  for (const e of j.entries) {
    if (e.date < from || e.date > to) continue;
    for (const l of e.lines) {
      if (onlyAccount && l.account !== onlyAccount) continue;
      let a = byAccount.get(l.account);
      if (!a) { const opening = start.get(l.account)?.balance || 0; a = { account: j.accounts.get(l.account)!, opening, lines: [], closing: opening }; byAccount.set(l.account, a); }
      a.closing = r2(a.closing + l.debit - l.credit);
      a.lines.push({ date: e.date, entryId: e.id, description: e.description, reference: e.source.reference || '', debit: l.debit, credit: l.credit, balance: a.closing });
    }
  }
  return [...byAccount.values()].sort((a, b) => TYPE_ORDER[a.account.type] - TYPE_ORDER[b.account.type] || a.account.name.localeCompare(b.account.name));
}

/** Who owes you on a date, by how late each invoice is (from its due date). */
export function agedReceivables(data: CRMData, j: Journal, asOf: string) {
  const owing = new Map<string, number>();
  for (const e of j.entries) {
    if (e.date > asOf) continue;
    for (const l of e.lines) if (l.account === 'ar' && l.docId) owing.set(l.docId, r2((owing.get(l.docId) || 0) + l.debit - l.credit));
  }
  const rows = new Map<string, AgedRow>();
  const invoices: { docId: string; number: string; client: string; due: string; owing: number }[] = [];
  for (const [docId, amount] of owing) {
    if (amount < 0.005) continue;
    const d = data.documents.find(x => x.id === docId);
    if (!d) continue;
    const client = data.clients.find(c => c.id === d.clientId)?.name || 'Unknown client';
    const due = (d.dueDate || d.issueDate || asOf).slice(0, 10);
    const row = rows.get(d.clientId) || emptyAged(d.clientId, client);
    const k = bucketFor(due, asOf);
    row[k] = r2(row[k] + amount); row.total = r2(row.total + amount); row.count++;
    rows.set(d.clientId, row);
    invoices.push({ docId, number: d.documentNumber, client, due, owing: amount });
  }
  return { asOf, rows: [...rows.values()].sort((a, b) => b.total - a.total), invoices: invoices.sort((a, b) => a.due.localeCompare(b.due)) };
}

/** Sales by client between two dates (invoiced, less credit notes), and what each paid in that time. */
export function salesByClient(data: CRMData, j: Journal, from: string, to: string) {
  const rows = new Map<string, { clientId: string; name: string; net: number; vat: number; total: number; received: number; invoices: number }>();
  const docClient = (id?: string) => data.documents.find(d => d.id === id)?.clientId;
  const row = (clientId: string) => {
    let r = rows.get(clientId);
    if (!r) { r = { clientId, name: data.clients.find(c => c.id === clientId)?.name || 'Unknown client', net: 0, vat: 0, total: 0, received: 0, invoices: 0 }; rows.set(clientId, r); }
    return r;
  };
  for (const e of j.entries) {
    if (e.date < from || e.date > to) continue;
    if (e.source.kind === 'invoice' || e.source.kind === 'receipt' || e.source.kind === 'credit_note') {
      const sign = e.source.kind === 'credit_note' ? -1 : 1;
      const clientId = docClient(e.source.id);
      if (!clientId) continue;
      const r = row(clientId);
      const vat = e.lines.filter(l => l.account === 'vat').reduce((s, l) => s + l.credit - l.debit, 0);
      const total = e.lines.filter(l => l.account === 'ar').reduce((s, l) => s + l.debit - l.credit, 0);
      r.vat = r2(r.vat + vat); r.total = r2(r.total + total); r.net = r2(r.total - r.vat);
      if (sign > 0) r.invoices++;
    } else {
      // Money received against invoices.
      for (const l of e.lines) if (l.account === 'ar' && l.credit > 0 && l.docId && e.source.kind === 'payment') {
        const clientId = docClient(l.docId);
        if (clientId) { const r = row(clientId); r.received = r2(r.received + l.credit); }
      }
    }
  }
  const list = [...rows.values()].sort((a, b) => b.net - a.net);
  return { from, to, rows: list, net: r2(list.reduce((s, r) => s + r.net, 0)), vat: r2(list.reduce((s, r) => s + r.vat, 0)), total: r2(list.reduce((s, r) => s + r.total, 0)), received: r2(list.reduce((s, r) => s + r.received, 0)) };
}

// ---------- CSV ----------

const cell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(cell).join(',')).join('\n');
export const money = (n: number) => n.toFixed(2);
export { AGE_BUCKETS };
