import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Printer, FileSpreadsheet } from 'lucide-react';
import type { CRMData } from '../types';
import { computeVatReturn, vatPeriod, type VatBasis } from '../lib/vatReturn';
import { todayIn } from '../lib/retainers';
import { documentsCsv, lineItemsCsv, expensesCsv, clientsCsv, transactionsCsv, vatReturnCsv, downloadCsv } from '../lib/exports';

type PeriodKind = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_half' | 'last_half' | 'this_year' | 'last_year' | 'custom';

const PERIODS: { id: PeriodKind; label: string }[] = [
  { id: 'last_month', label: 'Last month' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_half', label: 'Last 6 months (Jan–Jun or Jul–Dec)' },
  { id: 'this_half', label: 'This half-year' },
  { id: 'last_year', label: 'Last year' },
  { id: 'this_year', label: 'This year' },
  { id: 'custom', label: 'Custom dates' }
];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Bookkeeping → VAT return: the figures for a VAT period, the lines behind them, and CSV exports. */
export default function VatReturnView({ data }: { data: CRMData }) {
  const today = todayIn();
  const [periodKind, setPeriodKind] = useState<PeriodKind>('last_month');
  const [custom, setCustom] = useState(() => vatPeriod('last_month', today));
  const [basis, setBasis] = useState<VatBasis>('invoice');
  const [businessId, setBusinessId] = useState<string>(data.businesses.length > 1 ? '' : (data.businesses[0]?.id || ''));
  const [showLines, setShowLines] = useState(false);

  const period = periodKind === 'custom' ? custom : vatPeriod(periodKind, today);
  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;
  const vat = useMemo(
    () => (validPeriod ? computeVatReturn(data, { from: period.from, to: period.to, basis, businessId: businessId || null }) : null),
    [data, period.from, period.to, basis, businessId, validPeriod]
  );

  const money = (n: number) => `${vat?.currency || 'FJD'} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const businessName = businessId ? data.businesses.find(b => b.id === businessId)?.name || '' : 'All businesses';
  const fileStem = `${(businessId ? businessName : 'all').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${period.from}-to-${period.to}`;
  const range = { from: period.from, to: period.to, businessId: businessId || null };

  const rows = vat ? [
    { label: 'Standard-rated sales (excl. VAT)', amount: vat.sales.standardRated },
    { label: 'Zero-rated or exempt sales', amount: vat.sales.zeroRatedOrExempt },
    ...(vat.sales.reimbursedNoVat ? [{ label: 'Costs reimbursed by clients, no VAT (not sales)', amount: vat.sales.reimbursedNoVat }] : []),
    { label: 'Output VAT on sales', amount: vat.sales.outputVat, strong: true },
    ...(vat.creditNotes.count ? [{ label: `Less VAT on credit notes (${vat.creditNotes.count})`, amount: -vat.creditNotes.vat }] : []),
    { label: 'Purchases with claimable VAT (excl. VAT)', amount: vat.purchases.net },
    { label: 'Input VAT you can claim', amount: -vat.purchases.inputVat, strong: true }
  ] : [];

  const print = () => {
    if (!vat) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const tr = (l: string, a: string, strong = false) => `<tr${strong ? ' style="font-weight:700"' : ''}><td>${escapeHtml(l)}</td><td style="text-align:right">${escapeHtml(a)}</td></tr>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>VAT return ${period.from} to ${period.to}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:32px;font-size:13px}h1{font-size:18px;margin:0}p{margin:4px 0;color:#475569}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#64748b}.small{font-size:11px}</style></head><body>
<h1>VAT return: ${escapeHtml(businessName)}</h1>
<p>${period.from} to ${period.to} · ${vat.basis === 'payments' ? 'Payments basis' : 'Invoice basis'} · amounts in ${vat.currency}</p>
<table>${rows.map(r => tr(r.label, money(r.amount), r.strong)).join('')}${tr(vat.netVat >= 0 ? 'Net VAT payable' : 'Net VAT refundable', money(Math.abs(vat.netVat)), true)}</table>
${vat.warnings.length ? `<p class="small" style="margin-top:16px"><b>Check before filing:</b></p><ul class="small">${vat.warnings.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
<table class="small"><tr><th>Date</th><th>Type</th><th>Reference</th><th>Client or supplier</th><th style="text-align:right">Net</th><th style="text-align:right">VAT</th></tr>
${vat.lines.map(l => `<tr><td>${l.date}</td><td>${l.kind === 'sale' ? 'Sale' : l.kind === 'purchase' ? 'Purchase' : 'Credit note'}</td><td>${escapeHtml(l.reference)}</td><td>${escapeHtml(l.party)}</td><td style="text-align:right">${l.net.toFixed(2)}</td><td style="text-align:right">${l.vat.toFixed(2)}</td></tr>`).join('')}</table>
<p class="small" style="margin-top:16px">Prepared with Frilensa from the records in your workspace. Check the figures before filing your return with FRCS.</p>
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const select = 'bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs text-zinc-800';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">VAT return</h2>
          <p className="text-[11px] text-zinc-500">The figures for your VAT return, worked out from your invoices, receipts, credit notes and expenses. Check them before you file with FRCS; Frilensa doesn't file for you.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[11px] text-zinc-600 space-y-1">
            <span className="block font-semibold">Period</span>
            <select value={periodKind} onChange={e => setPeriodKind(e.target.value as PeriodKind)} className={`${select} w-full`}>
              {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-zinc-600 space-y-1">
            <span className="block font-semibold">Basis</span>
            <select value={basis} onChange={e => setBasis(e.target.value as VatBasis)} className={`${select} w-full`}>
              <option value="invoice">Invoice basis (when invoiced)</option>
              <option value="payments">Payments basis (when paid)</option>
            </select>
          </label>
          <label className="text-[11px] text-zinc-600 space-y-1">
            <span className="block font-semibold">Business</span>
            <select value={businessId} onChange={e => setBusinessId(e.target.value)} className={`${select} w-full`}>
              {data.businesses.length > 1 && <option value="">All businesses</option>}
              {data.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
        {periodKind === 'custom' && (
          <div className="flex gap-2 items-center text-[11px] text-zinc-600">
            <input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className={select} />
            <span>to</span>
            <input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className={select} />
          </div>
        )}
        <p className="text-[10px] text-zinc-400">{period.from} to {period.to}. Use the basis you're registered for with FRCS; if unsure, ask your accountant.</p>
      </div>

      {!vat ? (
        <p className="text-xs text-rose-700">Choose a start date on or before the end date.</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-zinc-100 p-4">
            <table className="w-full text-xs">
              <tbody>
                {rows.map(r => (
                  <tr key={r.label} className="border-b border-zinc-100">
                    <td className={`py-2 ${r.strong ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}>{r.label}</td>
                    <td className={`py-2 text-right font-mono ${r.strong ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>{money(r.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 text-sm font-bold text-zinc-900">{vat.netVat >= 0 ? 'Net VAT payable' : 'Net VAT refundable'}</td>
                  <td className={`pt-3 text-right font-mono text-sm font-bold ${vat.netVat >= 0 ? 'text-zinc-900' : 'text-emerald-700'}`}>{money(Math.abs(vat.netVat))}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-zinc-400 mt-2">
              {vat.sales.count} sale{vat.sales.count === 1 ? '' : 's'} and {vat.purchases.count} purchase{vat.purchases.count === 1 ? '' : 's'} included.
              {vat.purchases.notClaimedCount > 0 && ` ${vat.purchases.notClaimedCount} expense${vat.purchases.notClaimedCount === 1 ? '' : 's'} (${money(vat.purchases.notClaimedGross)}) not marked VAT claimable, so not claimed.`}
            </p>
          </div>

          {vat.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900"><AlertTriangle className="w-3.5 h-3.5" /> Check before filing</p>
              <ul className="list-disc pl-5 text-[11px] text-amber-900 space-y-0.5">
                {vat.warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadCsv(`vat-return-${fileStem}.csv`, vatReturnCsv(vat))} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
            <button type="button" onClick={print} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 text-zinc-800 cursor-pointer">
              <Printer className="w-3.5 h-3.5" /> Print or save as PDF
            </button>
            <button type="button" onClick={() => setShowLines(s => !s)} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 text-zinc-800 cursor-pointer">
              {showLines ? 'Hide' : 'Show'} the {vat.lines.length} lines
            </button>
          </div>

          {showLines && (
            <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
              <table className="w-full text-[11px] min-w-[560px]">
                <thead>
                  <tr className="text-left text-zinc-400 uppercase text-[9px] tracking-wider">
                    <th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Reference</th><th className="p-2">Client or supplier</th>
                    <th className="p-2 text-right">Net</th><th className="p-2 text-right">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {vat.lines.map(l => (
                    <tr key={`${l.kind}-${l.id}`} className="border-t border-zinc-100">
                      <td className="p-2 font-mono">{l.date}</td>
                      <td className="p-2">{l.kind === 'sale' ? 'Sale' : l.kind === 'purchase' ? 'Purchase' : 'Credit note'}{l.note ? <span className="text-zinc-400"> · {l.note}</span> : null}</td>
                      <td className="p-2">{l.reference}</td>
                      <td className="p-2">{l.party}</td>
                      <td className="p-2 text-right font-mono">{l.net.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">{l.vat.toFixed(2)}</td>
                    </tr>
                  ))}
                  {vat.lines.length === 0 && <tr><td colSpan={6} className="p-3 text-zinc-400">Nothing in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="bg-white rounded-2xl border border-zinc-100 p-4 space-y-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-zinc-900"><FileSpreadsheet className="w-4 h-4" /> Exports for your accountant</h3>
          <p className="text-[11px] text-zinc-500">CSV files that open in Excel, Google Sheets or accounting software. Dated records use the period and business chosen above.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'Invoices, quotes and receipts', file: 'documents', make: () => documentsCsv(data, range) },
            { label: 'Invoice line items', file: 'line-items', make: () => lineItemsCsv(data, range) },
            { label: 'Expenses', file: 'expenses', make: () => expensesCsv(data, range) },
            { label: 'Bank transactions', file: 'transactions', make: () => transactionsCsv(data, range) },
            { label: 'Clients (all, with amounts owed)', file: 'clients', make: () => clientsCsv(data), allTime: true }
          ].map(x => (
            <button
              key={x.file}
              type="button"
              onClick={() => downloadCsv(x.allTime ? `clients-${today}.csv` : `${x.file}-${fileStem}.csv`, x.make())}
              className="flex items-center justify-between gap-2 text-left text-xs px-3 py-2 rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-800 cursor-pointer"
            >
              <span>{x.label}</span>
              <Download className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
