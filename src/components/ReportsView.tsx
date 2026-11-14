import React, { useMemo, useState } from 'react';
import { Download, FileBarChart, Printer } from 'lucide-react';
import type { CRMData } from '../types';
import { buildJournal } from '../lib/journal';
import { AGE_BUCKETS, agedReceivables, balanceSheet, cashFlow, generalLedger, money, salesByClient, toCsv, trialBalance } from '../lib/reports';
import { agedPayables } from '../lib/bills';
import { trackAction } from '../lib/analytics';

// Finance → Reports: the reports an accountant asks for, all from the journal (lib/journal.ts).

type ReportId = 'balance' | 'cashflow' | 'trial' | 'ledger' | 'receivables' | 'payables' | 'sales';
const REPORTS: { id: ReportId; name: string; hint: string; dates: 'asOf' | 'range' }[] = [
  { id: 'balance', name: 'Balance sheet', hint: 'What you own and owe', dates: 'asOf' },
  { id: 'cashflow', name: 'Cash flow', hint: 'Money in and out', dates: 'range' },
  { id: 'receivables', name: 'Who owes you', hint: 'By how late', dates: 'asOf' },
  { id: 'payables', name: 'What you owe', hint: 'Bills, by how late', dates: 'asOf' },
  { id: 'sales', name: 'Sales by client', hint: 'Invoiced and received', dates: 'range' },
  { id: 'trial', name: 'Trial balance', hint: 'For your accountant', dates: 'asOf' },
  { id: 'ledger', name: 'General ledger', hint: 'Every entry', dates: 'range' }
];

type Cell = string | number;
const TYPE_NAMES: Record<string, string> = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' };
interface Table { title: string; subtitle: string; columns: string[]; rows: { cells: Cell[]; strong?: boolean; heading?: boolean }[]; note?: string }

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function presets() {
  const t = today(), y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  const end = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return [
    { label: 'This month', from: `${t.slice(0, 7)}-01`, to: t },
    { label: 'Last month', from: `${py}-${String(pm).padStart(2, '0')}-01`, to: end(py, pm) },
    { label: 'This year', from: `${y}-01-01`, to: t },
    { label: 'Last year', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
  ];
}

export default function ReportsView({ data }: { data: CRMData }) {
  const businessId = data.activeBusinessId || data.businesses[0]?.id || '';
  const business = data.businesses.find(b => b.id === businessId);
  const [report, setReport] = useState<ReportId>('balance');
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());
  const meta = REPORTS.find(r => r.id === report)!;
  const journal = useMemo(() => buildJournal(data, { businessId }), [data, businessId]);

  const table: Table = useMemo(() => {
    const period = `${from} to ${to}`;
    switch (report) {
      case 'balance': {
        const bs = balanceSheet(journal, asOf);
        const sect = (name: string, lines: { name: string; amount: number }[], total: number) => [
          { cells: [name, ''], heading: true }, ...lines.map(l => ({ cells: [l.name, l.amount] as Cell[] })), { cells: [`Total ${name.toLowerCase()}`, total], strong: true }];
        return { title: 'Balance sheet', subtitle: `On ${asOf}`, columns: ['', 'FJD'], rows: [
          ...sect('Assets', bs.assets, bs.totalAssets), ...sect('Liabilities', bs.liabilities, bs.totalLiabilities), ...sect('Equity', bs.equity, bs.totalEquity),
          { cells: ['Liabilities and equity', Math.round((bs.totalLiabilities + bs.totalEquity) * 100) / 100], strong: true }
        ], note: 'Worked out from what you record in Frilensa, on the accrual basis. Equity includes your profit to date.' };
      }
      case 'cashflow': {
        const cf = cashFlow(journal, from, to);
        return { title: 'Cash flow', subtitle: period, columns: ['', 'In', 'Out', 'Net'], rows: [
          { cells: ['Money at the start', '', '', cf.opening], strong: true },
          ...cf.rows.map(r => ({ cells: [r.group, r.in, r.out, r.net] as Cell[] })),
          { cells: ['Net change', '', '', cf.net], strong: true },
          { cells: ['Money at the end', '', '', cf.closing], strong: true }
        ], note: 'All your bank, cash, card and mobile money accounts together.' };
      }
      case 'trial': {
        const tb = trialBalance(journal, asOf);
        return { title: 'Trial balance', subtitle: `On ${asOf}`, columns: ['Account', 'Type', 'Debit', 'Credit'], rows: [
          ...tb.rows.map(r => ({ cells: [r.account.name, TYPE_NAMES[r.account.type], r.debit || '', r.credit || ''] as Cell[] })),
          { cells: ['Total', '', tb.debit, tb.credit], strong: true }
        ] };
      }
      case 'ledger': {
        const gl = generalLedger(journal, from, to);
        const rows: Table['rows'] = [];
        for (const a of gl) {
          rows.push({ cells: [a.account.name, '', '', '', '', ''], heading: true });
          rows.push({ cells: ['', 'Brought forward', '', '', '', a.opening] });
          for (const l of a.lines) rows.push({ cells: [l.date, l.description, l.reference, l.debit || '', l.credit || '', l.balance] });
          rows.push({ cells: ['', 'Closing balance', '', '', '', a.closing], strong: true });
        }
        return { title: 'General ledger', subtitle: period, columns: ['Date', 'Entry', 'Reference', 'Debit', 'Credit', 'Balance'], rows };
      }
      case 'receivables': {
        const ar = agedReceivables(data, journal, asOf);
        const total = (k: string) => Math.round(ar.rows.reduce((s, r) => s + (r as any)[k], 0) * 100) / 100;
        return { title: 'Who owes you', subtitle: `On ${asOf}, by days past the due date`, columns: ['Client', ...AGE_BUCKETS.map(b => b.label), 'Total'], rows: [
          ...ar.rows.map(r => ({ cells: [r.name, ...AGE_BUCKETS.map(b => r[b.key] || ''), r.total] as Cell[] })),
          { cells: ['Total', ...AGE_BUCKETS.map(b => total(b.key)), total('total')], strong: true }
        ], note: ar.invoices.length ? `Invoices: ${ar.invoices.map(i => `${i.number} (${i.client}, due ${i.due}, ${fmt(i.owing)})`).join('; ')}` : undefined };
      }
      case 'payables': {
        const ap = agedPayables(data, asOf, businessId);
        const total = (k: string) => Math.round(ap.reduce((s, r) => s + (r as any)[k], 0) * 100) / 100;
        return { title: 'What you owe', subtitle: `On ${asOf}, by days past the due date`, columns: ['Supplier', ...AGE_BUCKETS.map(b => b.label), 'Total'], rows: [
          ...ap.map(r => ({ cells: [r.name, ...AGE_BUCKETS.map(b => r[b.key] || ''), r.total] as Cell[] })),
          { cells: ['Total', ...AGE_BUCKETS.map(b => total(b.key)), total('total')], strong: true }
        ], note: 'Unpaid supplier bills (Finance → Bills).' };
      }
      case 'sales': {
        const s = salesByClient(data, journal, from, to);
        return { title: 'Sales by client', subtitle: period, columns: ['Client', 'Invoices', 'Sales excl. VAT', 'VAT', 'Total', 'Received'], rows: [
          ...s.rows.map(r => ({ cells: [r.name, String(r.invoices), r.net, r.vat, r.total, r.received] as Cell[] })),
          { cells: ['Total', '', s.net, s.vat, s.total, s.received], strong: true }
        ], note: 'Invoiced in the period less credit notes; received is money paid against invoices in the period.' };
      }
    }
  }, [report, journal, data, asOf, from, to, businessId]);

  const unassigned = useMemo(() => journal.entries.some(e => e.lines.some(l => l.account === 'cash:unassigned')), [journal]);
  const isNum = (c: Cell) => typeof c === 'number';
  const numericCol = (i: number) => table.rows.some(r => isNum(r.cells[i]));

  const download = () => {
    const csv = toCsv([[table.title, table.subtitle], [], table.columns, ...table.rows.map(r => r.cells.map(c => typeof c === 'number' ? money(c) : c))]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${table.title.toLowerCase().replace(/\s+/g, '-')}-${meta.dates === 'asOf' ? asOf : `${from}-to-${to}`}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    trackAction(`report_csv_${report}`);
  };
  const print = () => {
    const win = window.open('', '_blank');
    if (!win) return alert('Allow pop-ups to print the report.');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(table.title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:24px;font-size:12px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:left}th{font-size:10px;text-transform:uppercase;color:#64748b}.n{text-align:right;font-variant-numeric:tabular-nums}
.s td{font-weight:700;border-top:1px solid #94a3b8}.h td{font-weight:700;background:#f8fafc}.muted{color:#64748b}button{margin-top:16px}@media print{button{display:none}}</style></head><body>
<h1>${esc(table.title)}</h1><p class="muted">${esc(business?.legalName || business?.name || '')}${business?.tin ? ` · TIN ${esc(business.tin)}` : ''} · ${esc(table.subtitle)} · FJD</p>
<table><tr>${table.columns.map((c, i) => `<th class="${numericCol(i) ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr>
${table.rows.map(r => `<tr class="${r.strong ? 's' : r.heading ? 'h' : ''}">${r.cells.map(c => `<td class="${isNum(c) ? 'n' : ''}">${esc(isNum(c) ? fmt(c as number) : c)}</td>`).join('')}</tr>`).join('')}</table>
${table.note ? `<p class="muted">${esc(table.note)}</p>` : ''}<p class="muted">Prepared with Frilensa on ${esc(today())}.</p><button onclick="window.print()">Print or save as PDF</button></body></html>`);
    win.document.close();
    trackAction(`report_print_${report}`);
  };

  return (
    <div className="space-y-4" data-testid="reports-view">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2"><FileBarChart className="w-4 h-4 text-emerald-600" /> Reports</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="tablist">
          {REPORTS.map(r => (
            <button key={r.id} role="tab" aria-selected={report === r.id} onClick={() => setReport(r.id)}
              className={`text-left rounded-xl border px-2.5 py-2 ${report === r.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:border-zinc-400'}`}>
              <span className="block text-xs font-bold">{r.name}</span>
              <span className={`block text-[10px] ${report === r.id ? 'text-zinc-300' : 'text-zinc-500'}`}>{r.hint}</span>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          {meta.dates === 'asOf' ? (
            <div><label className="block text-[10px] font-bold uppercase text-zinc-500" htmlFor="rep-asof">On</label>
              <input id="rep-asof" type="date" className="bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" value={asOf} onChange={e => setAsOf(e.target.value || today())} /></div>
          ) : (
            <>
              <div><label className="block text-[10px] font-bold uppercase text-zinc-500" htmlFor="rep-from">From</label>
                <input id="rep-from" type="date" className="bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" value={from} onChange={e => e.target.value && setFrom(e.target.value)} /></div>
              <div><label className="block text-[10px] font-bold uppercase text-zinc-500" htmlFor="rep-to">To</label>
                <input id="rep-to" type="date" className="bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" value={to} onChange={e => e.target.value && setTo(e.target.value)} /></div>
              <div className="flex gap-1 flex-wrap">{presets().map(p => <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }} className="text-[11px] font-bold border border-zinc-200 rounded-lg px-2 py-1">{p.label}</button>)}</div>
            </>
          )}
          <div className="ml-auto flex gap-1.5">
            <button onClick={download} className="text-xs font-bold border border-zinc-300 rounded-xl px-2.5 py-1 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> CSV</button>
            <button onClick={print} className="text-xs font-bold border border-zinc-300 rounded-xl px-2.5 py-1 flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Print or PDF</button>
          </div>
        </div>
        {unassigned && <p className="text-[11px] text-amber-800 bg-amber-50 rounded-xl p-2">Some money isn't assigned to an account yet. Add your accounts or assign it in Finance → Accounts so cash figures are complete.</p>}
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
        <div>
          <h4 className="text-sm font-black text-zinc-900">{table.title}</h4>
          <p className="text-[11px] text-zinc-500">{table.subtitle} · FJD</p>
        </div>
        {table.rows.length <= (report === 'ledger' ? 0 : 1) && report !== 'balance' && report !== 'cashflow' ? <p className="text-xs text-zinc-500">Nothing to show for these dates.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="report-table">
              <thead><tr className="text-[10px] uppercase text-zinc-500 text-left">{table.columns.map((c, i) => <th key={i} className={`py-1.5 ${numericCol(i) ? 'text-right' : ''} pr-2`}>{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {table.rows.map((r, i) => (
                  <tr key={i} className={r.heading ? 'bg-zinc-50 font-bold' : r.strong ? 'font-black border-t border-zinc-300' : ''}>
                    {r.cells.map((c, k) => <td key={k} className={`py-1.5 pr-2 ${isNum(c) ? 'text-right font-mono whitespace-nowrap' : ''} ${isNum(c) && (c as number) < 0 ? 'text-rose-700' : ''}`}>{isNum(c) ? fmt(c as number) : c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {table.note && <p className="text-[11px] text-zinc-500">{table.note}</p>}
      </div>
    </div>
  );
}
