import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Globe, HandCoins, Pencil, Plus, Printer, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import type { Business, CRMData, ExpenseRecord } from '../types';
import {
  DEFAULT_WITHHOLDING, TAX_TREATIES, coeValid, contractorPaymentsOf, contractorYear, countryName, earlierThisYear, isNonResident, isNrwht, nextCertificateNo, nrwhtFor, nrwhtUnpaid,
  ptFor, ptMonthSummary, ptSummaryCsv, withheldFromYou,
  type Contractor, type ContractorPayment, type PtRemittance, type WithholdingSettings
} from '../lib/withholding';
import { usePlatformConfig } from '../lib/platformConfig';
import { trackAction } from '../lib/analytics';
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from '../lib/currencies';

// Finance → Contractors: people a business pays for services, provisional tax (PT) withheld from them,
// the monthly PT summary for FRCS, and certificates. Also the PT clients withheld from this business.

interface Props {
  data: CRMData;
  onUpdateData: (d: CRMData) => void;
  /** Saves an expense (and its ledger entry) the same way the expense form does. */
  onSaveExpense: (e: ExpenseRecord) => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const input = 'w-full bg-white border border-zinc-300 rounded-xl py-2 px-3 text-xs text-zinc-900 focus:outline-none focus:border-emerald-600';
const label = 'block text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1';

function openPrintable(title: string, body: string) {
  const win = window.open('', '_blank');
  if (!win) { alert('Allow pop-ups to open the certificate.'); return; }
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:680px;margin:32px auto;padding:0 16px;font-size:14px}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:7px 0;border-bottom:1px solid #e2e8f0;text-align:left}
.r{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#64748b}.grid{display:flex;gap:24px;flex-wrap:wrap;margin-top:16px}.grid>div{flex:1;min-width:220px}
.sign{margin-top:40px;border-top:1px solid #94a3b8;width:260px;padding-top:4px}button{margin-top:24px}@media print{button{display:none}}</style></head><body>${body}
<button onclick="window.print()">Print or save as PDF</button></body></html>`);
  win.document.close();
}

const party = (who: string, name: string, tin: string, extra = '') =>
  `<div><span class="muted">${who}</span><br><strong>${esc(name)}</strong>${tin ? `<br>TIN ${esc(tin)}` : ''}${extra}</div>`;

function printCertificate(b: Business | undefined, e: ExpenseRecord & { contractorPayment: ContractorPayment }) {
  const cp = e.contractorPayment;
  if (isNrwht(cp)) {
    const foreign = cp.currency && cp.currency !== 'FJD' && cp.foreignAmount ? `${esc(cp.currency)} ${cp.foreignAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at ${cp.exchangeRate}` : '';
    openPrintable(`Non-resident withholding tax statement ${cp.certificateNo}`, `
<h1>Non-resident withholding tax statement</h1><p class="muted">${esc(cp.certificateNo)} · ${esc(e.date)}</p>
<div class="grid">${party('Payer (Fiji)', b?.legalName || b?.name || '', b?.tin || '', b?.address ? `<br>${esc(b.address)}` : '')}${party('Paid to', cp.contractorName, cp.tin, cp.country ? `<br>${esc(TAX_TREATIES[cp.country]?.name || cp.country)}` : '')}</div>
<table>
<tr><td>${esc(e.description || 'Fees for services')}${cp.invoiceRef ? ` <span class="muted">(invoice ${esc(cp.invoiceRef)})</span>` : ''}${foreign ? `<br><span class="muted">${foreign}</span>` : ''}</td><td class="r">${fjd(cp.gross)}</td></tr>
${cp.method === 'gross_up' && cp.applied ? `<tr><td class="muted">Grossed up for the tax</td><td class="r muted">${fjd(cp.base)}</td></tr>` : ''}
<tr><td><strong>Non-resident withholding tax${cp.applied ? ` at ${cp.rate}%` : ''}</strong></td><td class="r"><strong>${fjd(cp.withheld)}</strong></td></tr>
<tr><td>Paid to the payee</td><td class="r">${fjd(cp.net)}</td></tr></table>
<p class="muted">${esc(cp.applied ? `Withheld under section 10 of the Income Tax Act 2015 and paid to the Fiji Revenue and Customs Service${cp.paidToFrcs ? ` on ${cp.paidToFrcs.date}${cp.paidToFrcs.reference ? ` (${cp.paidToFrcs.reference})` : ''}` : ''}. This is a final tax in Fiji; the payee may be able to claim it as a foreign tax credit at home.` : cp.reason)}</p>
<div class="sign">Signed for the payer</div>`);
    return;
  }
  openPrintable(`Withholding certificate ${cp.certificateNo}`, `
<h1>Provisional tax withholding certificate</h1><p class="muted">${esc(cp.certificateNo)} · ${esc(e.date)}</p>
<div class="grid">${party('Payer', b?.legalName || b?.name || '', b?.tin || '', b?.address ? `<br>${esc(b.address)}` : '')}${party('Paid to', cp.contractorName, cp.tin)}</div>
<table>
<tr><td>${esc(e.description || 'Payment for services')}${cp.invoiceRef ? ` <span class="muted">(invoice ${esc(cp.invoiceRef)})</span>` : ''}</td><td class="r">${fjd(cp.gross)}</td></tr>
${cp.vat ? `<tr><td class="muted">Less VAT</td><td class="r muted">${fjd(cp.vat)}</td></tr>` : ''}
<tr><td>Gross payment excluding VAT</td><td class="r">${fjd(cp.base)}</td></tr>
${cp.catchUpBase ? `<tr><td class="muted">Earlier payments this year withheld now</td><td class="r muted">${fjd(cp.catchUpBase)}</td></tr>` : ''}
<tr><td><strong>Provisional tax withheld${cp.applied ? ` at ${cp.rate}%` : ''}</strong></td><td class="r"><strong>${fjd(cp.withheld)}</strong></td></tr>
<tr><td>Paid to the contractor</td><td class="r">${fjd(cp.net)}</td></tr></table>
<p class="muted">${esc(cp.applied ? 'The tax withheld is paid to FRCS on the contractor\'s behalf and counts towards their income tax for the year.' : cp.reason)}</p>
<div class="sign">Signed for the payer</div>`);
}

function printAnnual(b: Business | undefined, c: Contractor, year: string, y: ReturnType<typeof contractorYear>) {
  openPrintable(`Annual provisional tax certificate ${year} ${c.name}`, `
<h1>Annual provisional tax certificate ${esc(year)}</h1><p class="muted">Year ended 31 December ${esc(year)} · issued ${esc(today())}</p>
<div class="grid">${party('Payer', b?.legalName || b?.name || '', b?.tin || '', b?.address ? `<br>${esc(b.address)}` : '')}${party('Paid to', c.name, c.tin, c.coeNumber ? `<br>COE ${esc(c.coeNumber)}` : '')}</div>
<table><tr><th>Date</th><th>Certificate</th><th class="r">Gross excl. VAT</th><th class="r">PT withheld</th></tr>
${y.payments.map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.contractorPayment.certificateNo)}</td><td class="r">${fjd(e.contractorPayment.base)}</td><td class="r">${fjd(e.contractorPayment.withheld)}</td></tr>`).join('')}
<tr><td colspan="2"><strong>Total</strong></td><td class="r"><strong>${fjd(y.base)}</strong></td><td class="r"><strong>${fjd(y.withheld)}</strong></td></tr></table>
<p class="muted">Total paid including VAT: ${fjd(y.gross)}. Give this certificate to the contractor by the end of February.</p>
<div class="sign">Signed for the payer</div>`);
}

const blankContractor = (businessId: string): Contractor => ({ id: '', businessId, name: '', tin: '', email: '', phone: '', vatRegistered: false, writtenAgreement: true, expectedYearly: undefined, coeNumber: '', coeExpiry: '', notes: '', createdAt: '' });

export default function ContractorsView({ data, onUpdateData, onSaveExpense }: Props) {
  const { config } = usePlatformConfig();
  const settings: WithholdingSettings = config.withholding || DEFAULT_WITHHOLDING;
  const businesses = data.businesses || [];
  const [businessId, setBusinessId] = useState(data.activeBusinessId || businesses[0]?.id || '');
  const business = businesses.find(b => b.id === businessId);
  const contractors = (data.contractors || []).filter(c => (c.businessId || '') === businessId);
  const payments = contractorPaymentsOf(data, businessId).sort((a, b) => b.date.localeCompare(a.date));
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [paying, setPaying] = useState<Contractor | null>(null);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [year, setYear] = useState(today().slice(0, 4));
  const [remitting, setRemitting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const nrUnpaid = useMemo(() => nrwhtUnpaid(data, businessId), [data, businessId]);
  const nrPayments = payments.filter(e => isNrwht(e.contractorPayment));

  const summary = useMemo(() => ptMonthSummary(data, businessId, month), [data, businessId, month]);
  const fromYou = useMemo(() => withheldFromYou(data, year, businessId), [data, year, businessId]);

  // What's still to pay FRCS, by month, oldest first.
  const owing = useMemo(() => {
    const months = [...new Set(payments.filter(p => p.contractorPayment.withheld > 0 && !isNrwht(p.contractorPayment)).map(p => p.date.slice(0, 7)))].sort();
    return months.map(m => ptMonthSummary(data, businessId, m)).filter(s => s.withheld - s.remitted > 0.004);
  }, [data, businessId, payments]);

  const saveContractor = (c: Contractor) => {
    const now = new Date().toISOString();
    const list = data.contractors || [];
    const next = c.id ? list.map(x => x.id === c.id ? { ...c, updatedAt: now } : x) : [{ ...c, id: `ctr-${Date.now()}`, createdAt: now, updatedAt: now }, ...list];
    onUpdateData({ ...data, contractors: next });
    setEditing(null);
  };
  const removeContractor = (c: Contractor) => {
    if (!confirm(`Remove ${c.name}? Their past payments stay in your books.`)) return;
    onUpdateData({ ...data, contractors: (data.contractors || []).filter(x => x.id !== c.id) });
  };

  const exportCsv = () => {
    const blob = new Blob([ptSummaryCsv(summary)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `provisional-tax-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const recordRemittance = (r: Omit<PtRemittance, 'id' | 'businessId' | 'month'>) => {
    const now = new Date().toISOString();
    onUpdateData({ ...data, ptRemittances: [{ ...r, id: `ptr-${Date.now()}`, businessId, month, updatedAt: now }, ...(data.ptRemittances || [])] });
    trackAction('contractor_pt_remitted');
    setRemitting(false);
  };
  const removeRemittance = (id: string) => {
    if (!confirm('Remove this payment to FRCS?')) return;
    onUpdateData({ ...data, ptRemittances: (data.ptRemittances || []).filter(r => r.id !== id) });
  };

  const markNrPaid = (expenseId: string, paid: { date: string; reference?: string }) => {
    onUpdateData({ ...data, expenses: (data.expenses || []).map(e => e.id === expenseId && e.contractorPayment ? { ...e, contractorPayment: { ...e.contractorPayment, paidToFrcs: paid } } : e) });
    trackAction('contractor_nrwht_paid');
    setMarkingPaid(null);
  };

  const toggleCertificate = (docId: string, certificateNo?: string) => {
    onUpdateData({
      ...data,
      documents: data.documents.map(d => d.id === docId && d.withholdingTax
        ? { ...d, withholdingTax: { ...d.withholdingTax, certificateReceived: certificateNo !== undefined ? true : !d.withholdingTax.certificateReceived, ...(certificateNo !== undefined ? { certificateNo } : {}) }, updatedAt: new Date().toISOString() }
        : d)
    });
  };

  return (
    <div className="space-y-4" data-testid="contractors-view">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2"><HandCoins className="w-4 h-4 text-emerald-600" /> Contractors and withholding tax</h3>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xl leading-relaxed">
              When you pay a resident contractor under a written agreement and they'll be paid FJD {settings.threshold.toLocaleString()} or more this year, withhold {settings.rate}% provisional tax from the payment (excluding VAT) and pay it to FRCS by the end of the next month. People with a certificate of exemption are exempt. Pay someone who isn't resident in Fiji and non-resident withholding tax ({settings.nonResidentRate}%, or a tax treaty's rate) applies instead. Employees are paid through PAYE.
            </p>
          </div>
          {businesses.length > 1 && (
            <select aria-label="Business" value={businessId} onChange={e => setBusinessId(e.target.value)} className="bg-white border border-zinc-300 rounded-xl py-1.5 px-2 text-xs font-bold">
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
        {nrUnpaid.payments.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1" role="status" data-testid="nrwht-owing">
            <p className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span><strong>{fjd(nrUnpaid.total)}</strong> non-resident withholding tax to pay FRCS. Pay it when you apply for tax clearance: banks won't send the money overseas without it.</span></p>
          </div>
        )}
        {owing.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1" role="status">
            {owing.map(s => (
              <p key={s.month} className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{fjd(round2(s.withheld - s.remitted))}</strong> withheld in {s.month} to pay FRCS by <strong>{s.due}</strong>{s.due < today() ? ' (overdue: penalties apply)' : ''}.</span>
                <button className="underline font-bold ml-1" onClick={() => setMonth(s.month)}>Open</button>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Contractors */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Contractors ({contractors.length})</h4>
          <button onClick={() => setEditing(blankContractor(businessId))} className="bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add contractor</button>
        </div>
        {contractors.length === 0 ? (
          <p className="text-xs text-zinc-500">Add the crew, freelancers and other people you pay for services. You'll need their name and TIN.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {contractors.map(c => {
              const y = contractorYear(data, c.id, today().slice(0, 4));
              const exempt = coeValid(c, today());
              return (
                <div key={c.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-xs font-bold text-zinc-900">{c.name}</p>
                    {isNonResident(c) ? (
                      <>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1"><Globe className="w-3 h-3" /> Non-resident · {countryName(c)} · {c.payeeType === 'individual' ? 'person' : 'enterprise'}{c.permanentEstablishment ? ' · permanent establishment in Fiji' : ''}{c.tin ? ` · tax no. ${c.tin}` : ''}</p>
                        <p className="text-[10px] text-zinc-500">This year: {fjd(y.gross)} · NRWHT {fjd(y.withheld)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[10px] text-zinc-500">
                          TIN {c.tin || '—'}{c.vatRegistered ? ' · VAT registered' : ''}{c.writtenAgreement ? ' · written agreement' : ' · no written agreement'}
                          {exempt ? ` · exempt (COE ${c.coeNumber})` : ''}
                        </p>
                        <p className="text-[10px] text-zinc-500">This year: {fjd(y.base)} excl. VAT · PT withheld {fjd(y.withheld)}</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPaying(c)} className="bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">Pay</button>
                    {!isNonResident(c) && <button onClick={() => printAnnual(business, c, year, contractorYear(data, c.id, year))} title={`Annual certificate ${year}`} aria-label={`Annual certificate for ${c.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><FileText className="w-3.5 h-3.5" /></button>}
                    <button onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeContractor(c)} aria-label={`Remove ${c.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly summary */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700">Monthly provisional tax summary</h4>
          <div className="flex items-center gap-2">
            <input type="month" aria-label="Month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" />
            <button onClick={exportCsv} className="text-xs font-bold border border-zinc-300 rounded-xl px-2.5 py-1 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500">Lists everyone you paid in the month, including people with a certificate of exemption. Due to FRCS by <strong>{summary.due}</strong>.</p>
        {summary.rows.length === 0 ? <p className="text-xs text-zinc-500">No contractor payments in {month}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="pt-summary">
              <thead><tr className="text-[10px] uppercase text-zinc-500 text-left"><th className="py-1.5">Contractor</th><th>TIN</th><th>COE</th><th className="text-right">Gross incl. VAT</th><th className="text-right">PT withheld</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {summary.rows.map(r => (
                  <tr key={r.contractorId}><td className="py-1.5 font-bold">{r.name}</td><td className="font-mono">{r.tin}</td><td className="font-mono">{r.coeNumber || '—'}</td><td className="text-right font-mono">{fjd(r.gross)}</td><td className="text-right font-mono">{fjd(r.withheld)}</td></tr>
                ))}
                <tr className="font-black"><td className="py-1.5" colSpan={3}>Total</td><td className="text-right font-mono">{fjd(summary.gross)}</td><td className="text-right font-mono">{fjd(summary.withheld)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-zinc-100 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs">Paid to FRCS: <strong className="font-mono">{fjd(summary.remitted)}</strong>{summary.withheld > 0 && <> of <span className="font-mono">{fjd(summary.withheld)}</span></>}
              {summary.withheld > 0 && summary.remitted + 0.004 >= summary.withheld && <span className="ml-2 text-emerald-700 font-bold">Paid in full</span>}</p>
            {summary.withheld > 0 && <button onClick={() => setRemitting(true)} className="text-xs font-bold bg-zinc-900 text-white rounded-xl px-3 py-1.5">Record payment to FRCS</button>}
          </div>
          {summary.remittances.map(r => (
            <p key={r.id} className="text-[11px] text-zinc-600 flex items-center gap-2">{r.date} · {fjd(r.amount)}{r.reference ? ` · ${r.reference}` : ''}
              <button onClick={() => removeRemittance(r.id)} aria-label="Remove payment to FRCS" className="text-rose-600"><X className="w-3 h-3" /></button></p>
          ))}
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4">
        <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 mb-2">Payments to contractors</h4>
        {payments.length === 0 ? <p className="text-xs text-zinc-500">None yet. Use Pay next to a contractor.</p> : (
          <div className="divide-y divide-zinc-100">
            {payments.slice(0, 50).map(e => {
              const cp = e.contractorPayment;
              return (
                <div key={e.id} className="py-2 flex items-center gap-3 flex-wrap text-xs">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-bold">{cp.contractorName} <span className="text-zinc-400 font-normal">· {e.date} · {cp.certificateNo}</span></p>
                    <p className="text-[10px] text-zinc-500">{e.description}{cp.override ? ` · changed by you: ${cp.overrideReason}` : ''}</p>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <p>{fjd(cp.gross)}</p>
                    <p className={cp.withheld > 0 ? 'text-amber-700' : 'text-zinc-400'}>{isNrwht(cp) ? 'NRWHT' : 'PT'} {fjd(cp.withheld)}</p>
                  </div>
                  <button onClick={() => printCertificate(business, e)} aria-label={`Certificate ${cp.certificateNo}`} title="Withholding certificate" className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><Printer className="w-3.5 h-3.5" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Non-resident withholding tax */}
      {nrPayments.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2" data-testid="nrwht-section">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Non-resident withholding tax</h4>
          <p className="text-[11px] text-zinc-500">Pay FRCS when you apply for tax clearance to send the money overseas, then record it here.</p>
          <div className="divide-y divide-zinc-100">
            {nrPayments.map(e => {
              const cp = e.contractorPayment;
              return (
                <div key={e.id} className="py-2 flex items-center gap-3 flex-wrap text-xs">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-bold">{cp.contractorName} <span className="text-zinc-400 font-normal">· {e.date}{cp.currency && cp.currency !== 'FJD' && cp.foreignAmount ? ` · ${cp.currency} ${cp.foreignAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}</span></p>
                    <p className="text-[10px] text-zinc-500">{cp.withheld > 0 ? `${cp.rate}% ${cp.method === 'gross_up' ? 'grossed up' : 'taken off the invoice'}` : 'No tax'}{cp.vatReverseCharge ? ` · reverse-charge VAT ${fjd(cp.vatReverseCharge)}` : ''}</p>
                  </div>
                  <span className="font-mono text-[11px]">{fjd(cp.withheld)}</span>
                  {cp.withheld > 0 && (cp.paidToFrcs
                    ? <span className="text-[11px] text-emerald-700 font-bold">Paid {cp.paidToFrcs.date}</span>
                    : <button onClick={() => setMarkingPaid(e.id)} className="text-[11px] font-bold bg-zinc-900 text-white rounded-lg px-2.5 py-1">Record payment to FRCS</button>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Withheld from you */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Tax clients withheld from you</h4>
          <input type="number" aria-label="Year" min="2000" max="2100" value={year} onChange={e => setYear(e.target.value)} className="w-20 bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" />
        </div>
        <p className="text-[11px] text-zinc-500">Provisional tax a client deducted when paying your invoices counts towards your income tax for the year. Claim it in your return, and ask each client for their withholding certificate.</p>
        {fromYou.rows.length === 0 ? <p className="text-xs text-zinc-500">None recorded for {year}. When you record a payment, enter any tax the client withheld.</p> : (
          <>
            <p className="text-xs">Total withheld in {year}: <strong className="font-mono">{fjd(fromYou.total)}</strong>{fromYou.missing > 0 && <span className="text-amber-700 font-bold"> · {fromYou.missing} certificate{fromYou.missing === 1 ? '' : 's'} still to get</span>}</p>
            <div className="divide-y divide-zinc-100">
              {fromYou.rows.map(r => (
                <div key={r.docId} className="py-1.5 flex items-center gap-3 text-xs flex-wrap">
                  <span className="flex-1 min-w-[160px]"><strong>{r.number}</strong> · {r.client} · {r.date}</span>
                  <span className="font-mono">{fjd(r.amount)}</span>
                  <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={r.certificateReceived} onChange={() => toggleCertificate(r.docId)} /> Certificate received</label>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {editing && <ContractorForm initial={editing} onCancel={() => setEditing(null)} onSave={saveContractor} />}
      {paying && isNonResident(paying) && <NrPayForm data={data} contractor={paying} business={business} settings={settings} vatRate={config.defaultVatRate || 12.5} onCancel={() => setPaying(null)}
        onSave={e => { onSaveExpense(e); trackAction(e.contractorPayment!.withheld > 0 ? 'contractor_paid_nrwht' : 'contractor_paid_nr'); setPaying(null); }} />}
      {markingPaid && <NrPaidForm onCancel={() => setMarkingPaid(null)} onSave={p => markNrPaid(markingPaid, p)} />}
      {paying && !isNonResident(paying) && <PayForm data={data} contractor={paying} business={business} settings={settings} vatRate={config.defaultVatRate || 12.5} onCancel={() => setPaying(null)}
        onSave={e => { onSaveExpense(e); trackAction(e.contractorPayment!.withheld > 0 ? 'contractor_paid_pt' : 'contractor_paid'); setPaying(null); }} />}
      {remitting && <RemitForm owed={round2(Math.max(0, summary.withheld - summary.remitted))} month={month} onCancel={() => setRemitting(false)} onSave={recordRemittance} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-zinc-950/70 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <h3 className="text-sm font-black text-zinc-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-zinc-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function ContractorForm({ initial, onCancel, onSave }: { initial: Contractor; onCancel: () => void; onSave: (c: Contractor) => void }) {
  const [c, setC] = useState<Contractor>(initial);
  const set = <K extends keyof Contractor>(k: K, v: Contractor[K]) => setC(prev => ({ ...prev, [k]: v }));
  const nonRes = isNonResident(c);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.name.trim()) return;
    const base = { ...c, name: c.name.trim(), tin: c.tin.trim(), coeNumber: c.coeNumber?.trim() || '', expectedYearly: c.expectedYearly && c.expectedYearly > 0 ? c.expectedYearly : undefined };
    onSave(nonRes
      ? { ...base, country: c.country || 'OTHER', countryName: (c.country || 'OTHER') === 'OTHER' ? c.countryName?.trim() || '' : '', payeeType: c.payeeType || 'enterprise', permanentEstablishment: !!c.permanentEstablishment, vatRegistered: false, coeNumber: '', coeExpiry: '' }
      : { ...base, residency: 'resident' });
  };
  return (
    <Modal title={initial.id ? 'Edit contractor' : 'Add contractor'} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex bg-zinc-100 p-0.5 rounded-xl text-xs font-bold" role="radiogroup" aria-label="Where they're resident for tax">
          {(['resident', 'non_resident'] as const).map(r => (
            <button type="button" key={r} role="radio" aria-checked={(c.residency || 'resident') === r} onClick={() => set('residency', r)}
              className={`flex-1 py-1.5 rounded-lg ${(c.residency || 'resident') === r ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>
              {r === 'resident' ? 'Fiji resident' : 'Not resident in Fiji'}
            </button>
          ))}
        </div>
        {nonRes ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className={label} htmlFor="ctr-name">Name *</label><input id="ctr-name" required className={input} value={c.name} onChange={e => set('name', e.target.value)} /></div>
              <div><label className={label} htmlFor="ctr-country">Country they're resident in</label>
                <select id="ctr-country" className={input} value={c.country || 'OTHER'} onChange={e => set('country', e.target.value)}>
                  {Object.entries(TAX_TREATIES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, t]) => <option key={code} value={code}>{t.name}</option>)}
                  <option value="OTHER">Another country (no tax treaty)</option>
                </select></div>
              {(c.country || 'OTHER') === 'OTHER' && <div><label className={label} htmlFor="ctr-country-name">Which country</label><input id="ctr-country-name" className={input} value={c.countryName || ''} onChange={e => set('countryName', e.target.value)} placeholder="e.g. United States" /></div>}
              <div><label className={label} htmlFor="ctr-payee">They are</label>
                <select id="ctr-payee" className={input} value={c.payeeType || 'enterprise'} onChange={e => set('payeeType', e.target.value as any)}>
                  <option value="enterprise">A company or other enterprise</option>
                  <option value="individual">A person working on their own</option>
                </select></div>
              <div><label className={label} htmlFor="ctr-tin">Their tax number</label><input id="ctr-tin" className={input} value={c.tin} onChange={e => set('tin', e.target.value)} /></div>
              <div><label className={label} htmlFor="ctr-email">Email</label><input id="ctr-email" type="email" className={input} value={c.email || ''} onChange={e => set('email', e.target.value)} /></div>
            </div>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={!!c.permanentEstablishment} onChange={e => set('permanentEstablishment', e.target.checked)} className="mt-0.5" />
              <span><strong>Permanent establishment in Fiji</strong><span className="block text-[10px] text-zinc-500">A branch, office or other fixed place of business here. Then they're taxed in Fiji as a business, and no withholding tax applies.</span></span></label>
          </>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label} htmlFor="ctr-name">Name *</label><input id="ctr-name" required className={input} value={c.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className={label} htmlFor="ctr-tin">TIN</label><input id="ctr-tin" className={input} value={c.tin} onChange={e => set('tin', e.target.value)} /></div>
          <div><label className={label} htmlFor="ctr-expected">Expected this year (FJD, excl. VAT)</label><input id="ctr-expected" type="number" min="0" step="0.01" className={input} value={c.expectedYearly ?? ''} onChange={e => set('expectedYearly', e.target.value === '' ? undefined : Number(e.target.value))} /></div>
          <div><label className={label} htmlFor="ctr-email">Email</label><input id="ctr-email" type="email" className={input} value={c.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div><label className={label} htmlFor="ctr-phone">Phone</label><input id="ctr-phone" className={input} value={c.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
        </div>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={c.writtenAgreement} onChange={e => set('writtenAgreement', e.target.checked)} className="mt-0.5" />
          <span><strong>Written agreement</strong><span className="block text-[10px] text-zinc-500">A contract, deal memo or crew agreement. Invoices, receipts and purchase orders don't count.</span></span></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.vatRegistered} onChange={e => set('vatRegistered', e.target.checked)} /> <strong>VAT registered</strong></label>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="ctr-coe">Certificate of exemption no.</label><input id="ctr-coe" className={input} value={c.coeNumber || ''} onChange={e => set('coeNumber', e.target.value)} placeholder="If they have one" /></div>
          <div><label className={label} htmlFor="ctr-coe-exp">Valid to</label><input id="ctr-coe-exp" type="date" className={input} value={c.coeExpiry || ''} onChange={e => set('coeExpiry', e.target.value)} /></div>
        </div>
          </>
        )}
        <div><label className={label} htmlFor="ctr-notes">Notes</label><textarea id="ctr-notes" rows={2} className={input} value={c.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save contractor</button>
        </div>
      </form>
    </Modal>
  );
}

const PAY_METHODS = ['Bank Transfer', 'BSP Fiji', 'ANZ Fiji', 'Westpac Fiji', 'M-Paisa', 'MyCash', 'Cash', 'Cheque'];

function PayForm({ data, contractor, business, settings, vatRate, onCancel, onSave }: {
  data: CRMData; vatRate: number; contractor: Contractor; business: Business | undefined; settings: WithholdingSettings; onCancel: () => void; onSave: (e: ExpenseRecord) => void;
}) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [gross, setGross] = useState(0);
  const [vat, setVat] = useState<number | null>(null);
  const [projectId, setProjectId] = useState('');
  const [method, setMethod] = useState('Bank Transfer');
  const [catchUp, setCatchUp] = useState(false);
  const [override, setOverride] = useState<'' | 'apply' | 'skip'>('');
  const [overrideReason, setOverrideReason] = useState('');

  const autoVat = contractor.vatRegistered ? round2(gross * vatRate / (100 + vatRate)) : 0;
  const vatAmount = contractor.vatRegistered ? (vat ?? autoVat) : 0;
  const earlier = earlierThisYear(data, contractor.id, date);
  const decision = ptFor(contractor, { date, gross, vat: vatAmount, catchUp }, earlier, settings);
  const applied = override === 'apply' ? true : override === 'skip' ? false : decision.applies;
  const withheld = applied ? (decision.applies ? decision.withheld : Math.min(gross, round2(decision.base * settings.rate / 100))) : 0;
  const net = round2(gross - withheld);
  const projects = (data.projects || []).filter(p => !business || !p.businessId || p.businessId === business.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (gross <= 0) return;
    if (override && !overrideReason.trim()) return;
    const cp: ContractorPayment = {
      contractorId: contractor.id, contractorName: contractor.name, tin: contractor.tin,
      gross: round2(gross), vat: vatAmount, base: decision.base, rate: settings.rate,
      ...(applied && decision.applies && catchUp && decision.catchUpAvailable > 0 ? { catchUpBase: decision.catchUpAvailable } : {}),
      withheld, net, applied,
      ...(!override && decision.underThreshold ? { underThreshold: true } : {}),
      reason: override ? `Changed by you: ${overrideReason.trim()}` : decision.reason,
      ...(override ? { override: true, overrideReason: overrideReason.trim() } : {}),
      ...(coeValid(contractor, date) ? { coeNumber: contractor.coeNumber } : {}),
      certificateNo: nextCertificateNo(data, business?.id || '', date.slice(0, 4)),
      ...(invoiceRef.trim() ? { invoiceRef: invoiceRef.trim() } : {})
    };
    onSave({
      id: `exp-ctr-${Date.now()}`,
      date, vendor: contractor.name,
      description: description.trim() || `Services: ${contractor.name}`,
      amount: round2(gross), category: 'Subcontractors', paymentMethod: method,
      vatAmount: vatAmount || undefined, isVatClaimable: vatAmount > 0, isTaxDeductible: true,
      businessId: business?.id, projectId: projectId || undefined, currency: 'FJD',
      notes: withheld > 0 ? `Provisional tax ${fjd(withheld)} withheld (${cp.certificateNo}); paid to contractor ${fjd(net)}. Pay the tax to FRCS by the end of next month.` : cp.reason,
      createdAt: new Date().toISOString(),
      contractorPayment: cp
    });
  };

  return (
    <Modal title={`Pay ${contractor.name}`} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="pay-date">Date *</label><input id="pay-date" type="date" required className={input} value={date} onChange={e => setDate(e.target.value || today())} /></div>
          <div><label className={label} htmlFor="pay-ref">Their invoice no.</label><input id="pay-ref" className={input} value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} /></div>
          <div className="col-span-2"><label className={label} htmlFor="pay-desc">What for</label><input id="pay-desc" className={input} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Sound recordist, 5 days" /></div>
          <div><label className={label} htmlFor="pay-gross">Amount charged (FJD{contractor.vatRegistered ? ', incl. VAT' : ''}) *</label><input id="pay-gross" type="number" min="0" step="0.01" required className={input} value={gross || ''} onChange={e => setGross(Number(e.target.value) || 0)} /></div>
          {contractor.vatRegistered && <div><label className={label} htmlFor="pay-vat">VAT in it</label><input id="pay-vat" type="number" min="0" step="0.01" className={input} value={vat ?? autoVat} onChange={e => setVat(e.target.value === '' ? null : Number(e.target.value))} /></div>}
          <div><label className={label} htmlFor="pay-method">Paid by</label><select id="pay-method" className={input} value={method} onChange={e => setMethod(e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
          {projects.length > 0 && <div><label className={label} htmlFor="pay-project">Project</label><select id="pay-project" className={input} value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">None</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        </div>

        <div className={`rounded-xl border p-3 text-xs space-y-1.5 ${applied ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-200'}`} data-testid="pt-decision">
          <p className="font-bold">{applied ? `Withhold ${settings.rate}% provisional tax` : 'No provisional tax to withhold'}</p>
          <p className="text-[11px] text-zinc-600">{override ? 'You changed this. ' : ''}{decision.reason}</p>
          {decision.warning && !override && <p className="text-[11px] text-amber-800">{decision.warning}</p>}
          {decision.applies && decision.catchUpAvailable > 0 && !override && (
            <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={catchUp} onChange={e => setCatchUp(e.target.checked)} /> Also withhold on the earlier payments ({fjd(decision.catchUpAvailable)})</label>
          )}
          <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Excl. VAT</span>{fjd(decision.base)}</div>
            <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">PT withheld</span><span data-testid="pt-withheld">{fjd(withheld)}</span></div>
            <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Pay them</span><strong data-testid="pt-net">{fjd(net)}</strong></div>
          </div>
        </div>

        <details className="text-xs" open={!!override}>
          <summary className="cursor-pointer text-zinc-600 font-bold">Change this</summary>
          <div className="pt-2 space-y-2">
            <select aria-label="Provisional tax" className={input} value={override} onChange={e => setOverride(e.target.value as any)}>
              <option value="">Follow the rules above</option>
              <option value="apply">Withhold {settings.rate}% anyway</option>
              <option value="skip">Don't withhold</option>
            </select>
            {override && <input aria-label="Reason for the change" required className={input} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Why? e.g. agreement signed after the first payment" />}
          </div>
        </details>

        <p className="text-[10px] text-zinc-500">Saved as a {fjd(gross)} expense (Subcontractors){vatAmount > 0 ? ` with ${fjd(vatAmount)} VAT to claim` : ''}. You'll get a withholding certificate to give them.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" disabled={gross <= 0} className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-50">Save payment</button>
        </div>
      </form>
    </Modal>
  );
}

function RemitForm({ owed, month, onCancel, onSave }: { owed: number; month: string; onCancel: () => void; onSave: (r: { amount: number; date: string; reference?: string }) => void }) {
  const [amount, setAmount] = useState(owed);
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  return (
    <Modal title={`Provisional tax paid to FRCS for ${month}`} onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); if (amount > 0) onSave({ amount: round2(amount), date, ...(reference.trim() ? { reference: reference.trim() } : {}) }); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="rem-amount">Amount (FJD)</label><input id="rem-amount" type="number" min="0" step="0.01" required className={input} value={amount || ''} onChange={e => setAmount(Number(e.target.value) || 0)} /></div>
          <div><label className={label} htmlFor="rem-date">Paid on</label><input id="rem-date" type="date" required className={input} value={date} onChange={e => setDate(e.target.value || today())} /></div>
          <div className="col-span-2"><label className={label} htmlFor="rem-ref">Receipt or reference</label><input id="rem-ref" className={input} value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. Taxpayer Online Services receipt" /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function NrPayForm({ data, contractor, business, settings, vatRate, onCancel, onSave }: {
  data: CRMData; vatRate: number; contractor: Contractor; business: Business | undefined; settings: WithholdingSettings; onCancel: () => void; onSave: (e: ExpenseRecord) => void;
}) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [foreign, setForeign] = useState(0);
  const [rate, setRate] = useState(() => getCurrencyConfig('USD').approxFjdMultiplier || 1);
  const [method, setMethod] = useState<'gross_up' | 'net_off'>('net_off');
  const [projectId, setProjectId] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [reverseCharge, setReverseCharge] = useState(false);
  const [override, setOverride] = useState<'' | 'apply' | 'skip'>('');
  const [overrideReason, setOverrideReason] = useState('');

  const invoice = round2(foreign * (currency === 'FJD' ? 1 : rate));
  const auto = nrwhtFor(contractor, { invoice, method }, settings);
  const forced = override === 'apply' && !auto.applies ? nrwhtFor({ ...contractor, permanentEstablishment: false, country: 'OTHER' }, { invoice, method }, settings) : null;
  const d = override === 'skip' ? { ...auto, applies: false, tax: 0, paidToThem: invoice, cost: invoice, base: invoice } : forced || auto;
  const vatRc = reverseCharge ? round2(invoice * vatRate / 100) : 0;
  const projects = (data.projects || []).filter(p => !business || !p.businessId || p.businessId === business.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invoice <= 0 || (override && !overrideReason.trim())) return;
    const cp: ContractorPayment = {
      kind: 'nrwht', contractorId: contractor.id, contractorName: contractor.name, tin: contractor.tin,
      gross: invoice, vat: 0, base: d.base, rate: d.applies ? d.rate : 0, withheld: d.tax, net: d.paidToThem, applied: d.applies,
      reason: override ? `Changed by you: ${overrideReason.trim()}` : auto.reason,
      ...(override ? { override: true, overrideReason: overrideReason.trim() } : {}),
      method, currency, foreignAmount: round2(foreign), exchangeRate: currency === 'FJD' ? 1 : rate,
      country: countryName(contractor),
      ...(vatRc ? { vatReverseCharge: vatRc } : {}),
      certificateNo: nextCertificateNo(data, business?.id || '', date.slice(0, 4)),
      ...(invoiceRef.trim() ? { invoiceRef: invoiceRef.trim() } : {})
    };
    onSave({
      id: `exp-ctr-${Date.now()}`,
      date, vendor: contractor.name,
      description: description.trim() || `Services: ${contractor.name} (${countryName(contractor)})`,
      amount: d.cost, category: 'Subcontractors', paymentMethod: payMethod,
      isVatClaimable: false, isTaxDeductible: true,
      businessId: business?.id, projectId: projectId || undefined, currency: 'FJD',
      ...(currency !== 'FJD' ? { originalCurrency: currency, originalAmount: round2(foreign), exchangeRate: rate } : {}),
      notes: d.tax > 0
        ? `Non-resident withholding tax ${fjd(d.tax)} (${cp.certificateNo}, ${method === 'gross_up' ? 'grossed up' : 'taken off the invoice'}); paid to them ${fjd(d.paidToThem)}. Pay the tax to FRCS when you apply for tax clearance.`
        : cp.reason,
      createdAt: new Date().toISOString(),
      contractorPayment: cp
    });
  };

  return (
    <Modal title={`Pay ${contractor.name}`} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[11px] text-zinc-500 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Not resident in Fiji · {countryName(contractor)}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="nr-date">Date *</label><input id="nr-date" type="date" required className={input} value={date} onChange={e => setDate(e.target.value || today())} /></div>
          <div><label className={label} htmlFor="nr-ref">Their invoice no.</label><input id="nr-ref" className={input} value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} /></div>
          <div className="col-span-2"><label className={label} htmlFor="nr-desc">What for</label><input id="nr-desc" className={input} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Colour grading, 3 days" /></div>
          <div><label className={label} htmlFor="nr-currency">Invoice currency</label>
            <select id="nr-currency" className={input} value={currency} onChange={e => { setCurrency(e.target.value); setRate(getCurrencyConfig(e.target.value).approxFjdMultiplier || 1); }}>
              {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select></div>
          <div><label className={label} htmlFor="nr-amount">Invoice amount ({currency}) *</label><input id="nr-amount" type="number" min="0" step="0.01" required className={input} value={foreign || ''} onChange={e => setForeign(Number(e.target.value) || 0)} /></div>
          {currency !== 'FJD' && <div><label className={label} htmlFor="nr-rate">FJD per {currency}</label><input id="nr-rate" type="number" min="0" step="0.0001" className={input} value={rate} onChange={e => setRate(Number(e.target.value) || 0)} /></div>}
          <div><label className={label} htmlFor="nr-paid-by">Paid by</label><select id="nr-paid-by" className={input} value={payMethod} onChange={e => setPayMethod(e.target.value)}>{['Bank Transfer', 'Overseas Telegraphic Transfer (TT)', 'BSP Fiji', 'ANZ Fiji', 'Westpac Fiji', 'PayPal / Payoneer', 'Credit Card'].map(m => <option key={m}>{m}</option>)}</select></div>
          {projects.length > 0 && <div><label className={label} htmlFor="nr-project">Project</label><select id="nr-project" className={input} value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">None</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        </div>

        <div className="flex bg-zinc-100 p-0.5 rounded-xl text-[11px] font-bold" role="radiogroup" aria-label="Who bears the tax">
          {([['net_off', 'Take it off the invoice'], ['gross_up', 'Gross up (we pay the tax)']] as const).map(([m, text]) => (
            <button type="button" key={m} role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={`flex-1 py-1.5 rounded-lg ${method === m ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>{text}</button>
          ))}
        </div>

        <div className={`rounded-xl border p-3 text-xs space-y-1.5 ${d.applies ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-200'}`} data-testid="nrwht-decision">
          <p className="font-bold">{d.applies ? `Withhold ${d.rate}% non-resident withholding tax` : 'No non-resident withholding tax'}</p>
          <p className="text-[11px] text-zinc-600">{override ? 'You changed this. ' : ''}{auto.reason}</p>
          <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Invoice (FJD)</span>{fjd(invoice)}</div>
            <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Tax to FRCS</span><span data-testid="nrwht-tax">{fjd(d.tax)}</span></div>
            <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Send them</span><strong data-testid="nrwht-net">{fjd(d.paidToThem)}</strong></div>
          </div>
          {currency !== 'FJD' && d.applies && <p className="text-[10px] text-zinc-500">Send them {currency} {(rate > 0 ? d.paidToThem / rate : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. This payment costs you {fjd(d.cost)}.</p>}
        </div>

        <label className="flex items-start gap-2 text-[11px]"><input type="checkbox" checked={reverseCharge} onChange={e => setReverseCharge(e.target.checked)} className="mt-0.5" />
          <span>We're VAT registered: note reverse-charge VAT on this imported service ({vatRate}%{reverseCharge ? `, ${fjd(vatRc)}` : ''})<span className="block text-[10px] text-zinc-500">Account for it in your VAT return. It's kept with the payment for reference.</span></span></label>

        <details className="text-xs" open={!!override}>
          <summary className="cursor-pointer text-zinc-600 font-bold">Change this</summary>
          <div className="pt-2 space-y-2">
            <select aria-label="Non-resident withholding tax" className={input} value={override} onChange={e => setOverride(e.target.value as any)}>
              <option value="">Follow the rules above</option>
              <option value="apply">Withhold {settings.nonResidentRate}% anyway</option>
              <option value="skip">Don't withhold</option>
            </select>
            {override && <input aria-label="Reason for the change" required className={input} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Why? e.g. no certificate of tax residence" />}
          </div>
        </details>

        <p className="text-[10px] text-zinc-500">Saved as a {fjd(d.cost)} expense (Subcontractors). Pay the tax to FRCS when you apply for tax clearance to send the money; banks won't send it without clearance.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" disabled={invoice <= 0} className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-50">Save payment</button>
        </div>
      </form>
    </Modal>
  );
}

function NrPaidForm({ onCancel, onSave }: { onCancel: () => void; onSave: (p: { date: string; reference?: string }) => void }) {
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  return (
    <Modal title="Non-resident withholding tax paid to FRCS" onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); onSave({ date, ...(reference.trim() ? { reference: reference.trim() } : {}) }); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="nrp-date">Paid on</label><input id="nrp-date" type="date" required className={input} value={date} onChange={e => setDate(e.target.value || today())} /></div>
          <div><label className={label} htmlFor="nrp-ref">Receipt or clearance no.</label><input id="nrp-ref" className={input} value={reference} onChange={e => setReference(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save</button>
        </div>
      </form>
    </Modal>
  );
}
