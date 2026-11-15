import React, { useMemo, useState } from 'react';
import { MessageCircle, Printer, Smartphone } from 'lucide-react';
import type { CRMData, Client } from '../../types';
import { buildJournal } from '../../lib/journal';
import { AGE_BUCKETS, clientStatement, statementMessage } from '../../lib/statements';
import { phoneDigits, smsLink, whatsappLink } from '../../lib/chase';
import { trackAction } from '../../lib/analytics';

// A client's statement: what they were invoiced, credited and paid between two dates, from the journal.

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const yearStart = () => `${new Date().getFullYear()}-01-01`;

export default function ClientStatementTab({ data, client }: { data: CRMData; client: Client }) {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const journal = useMemo(() => buildJournal(data, { businessId: data.activeBusinessId }), [data]);
  const s = useMemo(() => clientStatement(data, journal, client.id, from, to > from ? to : from), [data, journal, client.id, from, to]);
  const business = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const cur = data.userProfile?.defaultCurrency || 'FJD';
  const greet = (client.contactPerson || client.contactName || client.name || '').trim();
  const msg = statementMessage(s, greet, business?.name || 'us', cur);
  const phone = phoneDigits(client.phone || '');
  const input = 'bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs';

  const print = () => {
    const win = window.open('', '_blank');
    if (!win) return alert('Allow pop-ups to print the statement.');
    const row = (cells: string[], cls = '') => `<tr class="${cls}">${cells.map((c, i) => `<td class="${i >= 4 ? 'n' : ''}">${c}</td>`).join('')}</tr>`;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statement – ${esc(client.name)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:28px;font-size:12px}h1{font-size:20px;margin:0}.top{display:flex;justify-content:space-between;gap:24px}
table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:left}th{font-size:10px;text-transform:uppercase;color:#64748b}
.n{text-align:right;font-variant-numeric:tabular-nums}.s td{font-weight:700;border-top:1px solid #94a3b8}.muted{color:#64748b}.box{border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-top:14px}button{margin-top:16px}@media print{button{display:none}}</style></head><body>
<div class="top"><div><h1>Statement</h1><p class="muted">${esc(s.from)} to ${esc(s.to)} · ${esc(cur)}</p>
<p><b>${esc(client.name)}</b><br>${esc(client.address || '')}${client.tin ? `<br>TIN ${esc(client.tin)}` : ''}</p></div>
<div style="text-align:right"><b>${esc(business?.legalName ? `${business.legalName} trading as ${business.name}` : business?.name || '')}</b><br>${esc(business?.address || '')}${business?.tin ? `<br>TIN ${esc(business.tin)}` : ''}${business?.email ? `<br>${esc(business.email)}` : ''}</div></div>
<table><tr><th>Date</th><th>Type</th><th>Reference</th><th>Details</th><th class="n">Charges</th><th class="n">Credits</th><th class="n">Balance</th></tr>
${row([esc(s.from), '', '', 'Balance brought forward', '', '', fmt(s.opening)])}
${s.lines.map(l => row([esc(l.date), esc(l.kind), esc(l.reference), esc(l.description), l.charge ? fmt(l.charge) : '', l.credit ? fmt(l.credit) : '', fmt(l.balance)])).join('')}
${row([esc(s.to), '', '', s.closing >= 0 ? 'Amount owing' : 'In credit', fmt(s.charges), fmt(s.credits), fmt(s.closing)], 's')}</table>
<table><tr>${AGE_BUCKETS.map(b => `<th class="n">${esc(b.label)}</th>`).join('')}<th class="n">Total owing</th></tr>
<tr>${AGE_BUCKETS.map(b => `<td class="n">${fmt(s.aged[b.key])}</td>`).join('')}<td class="n"><b>${fmt(s.aged.total)}</b></td></tr></table>
${s.open.length ? `<div class="box"><b>Invoices to pay</b>${s.open.map(o => `<div>${esc(o.number)}: ${esc(cur)} ${fmt(o.owing)}, due ${esc(o.dueDate)}${o.link ? ` · <a href="${esc(o.link)}">view and pay</a>` : ''}</div>`).join('')}</div>` : ''}
${business?.bankDetails ? `<div class="box"><b>How to pay</b><div>${esc(business.bankDetails)}</div></div>` : ''}
<p class="muted">Prepared with Frilensa on ${esc(today())}.</p><button onclick="window.print()">Print or save as PDF</button></body></html>`);
    win.document.close();
    trackAction('statement_print');
  };

  return (
    <div className="space-y-4" data-testid="client-statement">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-bold uppercase text-slate-500">From<input type="date" aria-label="Statement from" className={`${input} block mt-1`} value={from} onChange={e => setFrom(e.target.value || yearStart())} /></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">To<input type="date" aria-label="Statement to" className={`${input} block mt-1`} value={to} onChange={e => setTo(e.target.value || today())} /></label>
        <div className="flex gap-1.5 ml-auto">
          <button type="button" onClick={print} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Print / PDF</button>
          <a href={whatsappLink(phone, msg)} target="_blank" rel="noreferrer" onClick={() => trackAction('statement_whatsapp')} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
          <a href={smsLink(phone, msg)} onClick={() => trackAction('statement_sms')} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> SMS</a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {([['Brought forward', s.opening], ['Invoiced', s.charges], ['Paid or credited', s.credits]] as const).map(([l, n]) => (
          <div key={l} className="bg-slate-50 rounded-xl p-2"><p className="text-[9px] uppercase font-bold text-slate-500">{l}</p><p className="font-mono text-xs font-black">{fmt(n)}</p></div>
        ))}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white text-slate-900">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Details</th><th className="p-2 text-right">Charges</th><th className="p-2 text-right">Credits</th><th className="p-2 text-right">Balance</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="p-2 font-mono">{s.from}</td><td className="p-2 text-slate-500">Brought forward</td><td /><td /><td className="p-2 text-right font-mono">{fmt(s.opening)}</td></tr>
            {s.lines.map((l, i) => (
              <tr key={i}><td className="p-2 font-mono whitespace-nowrap">{l.date}</td><td className="p-2"><span className="font-semibold">{l.kind}</span> {l.reference && <span className="text-slate-500">{l.reference}</span>}<div className="text-[11px] text-slate-500">{l.description}</div></td>
                <td className="p-2 text-right font-mono">{l.charge ? fmt(l.charge) : ''}</td><td className="p-2 text-right font-mono">{l.credit ? fmt(l.credit) : ''}</td><td className="p-2 text-right font-mono">{fmt(l.balance)}</td></tr>
            ))}
            <tr className="font-bold bg-slate-50"><td className="p-2 font-mono">{s.to}</td><td className="p-2">{s.closing >= 0 ? 'Owing' : 'In credit'}</td><td /><td /><td className="p-2 text-right font-mono" data-testid="statement-closing">{cur} {fmt(s.closing)}</td></tr>
          </tbody>
        </table>
      </div>
      {s.lines.length === 0 && <p className="text-xs text-slate-500">Nothing invoiced or paid in these dates.</p>}

      <div className="grid grid-cols-5 gap-1 text-center">
        {AGE_BUCKETS.map(b => <div key={b.key} className={`rounded-lg p-1.5 ${s.aged[b.key] > 0 && b.key !== 'current' ? 'bg-rose-50' : 'bg-slate-50'}`}><p className="text-[9px] font-bold text-slate-500">{b.label}</p><p className="font-mono text-[11px] font-bold">{fmt(s.aged[b.key])}</p></div>)}
      </div>

      {s.open.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-[10px] font-black uppercase text-slate-500">Invoices to pay</h5>
          {s.open.map(o => (
            <div key={o.docId} className="flex items-center gap-2 text-xs"><span className="font-semibold">{o.number}</span><span className="text-slate-500">due {o.dueDate}</span>
              <span className="ml-auto font-mono font-bold">{fmt(o.owing)}</span>{o.link && <a href={o.link} target="_blank" rel="noreferrer" className="text-sky-700 font-semibold">Link</a>}</div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-400">Amounts in {cur}. Built from your books, so it matches Who owes you and your reports.</p>
    </div>
  );
}
