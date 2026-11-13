import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Pencil, Plus, Printer, Trash2, Users, Wallet, X } from 'lucide-react';
import type { Business, CRMData } from '../types';
import {
  DEFAULT_PAYROLL, FREQUENCY_NAMES, bookkeepingForRun, calcLine, employeeYear, employerFnpfRate, normalPayFor, payrollMonth, payrollMonthCsv,
  runTotals, withoutRunBookkeeping, ytdFor,
  type Employee, type PayFrequency, type PayLine, type PayRun, type PayrollPayment, type PayrollSettings
} from '../lib/payroll';
import { usePlatformConfig } from '../lib/platformConfig';
import { trackAction } from '../lib/analytics';

// Finance → Payroll: employees, pay runs with PAYE and FNPF, payslips, the monthly PAYE and FNPF totals
// with due dates, and each employee's tax withholding certificate for the year.

interface Props { data: CRMData; onUpdateData: (d: CRMData) => void }

const today = () => new Date().toISOString().slice(0, 10);
const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const input = 'w-full bg-white border border-zinc-300 rounded-xl py-2 px-3 text-xs text-zinc-900 focus:outline-none focus:border-emerald-600';
const small = 'w-full bg-white border border-zinc-300 rounded-lg py-1 px-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-emerald-600';
const label = 'block text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1';
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function openPrintable(title: string, body: string) {
  const win = window.open('', '_blank');
  if (!win) { alert('Allow pop-ups to open the payslip.'); return; }
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:680px;margin:32px auto;padding:0 16px;font-size:14px}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:left}
.r{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#64748b}.grid{display:flex;gap:24px;flex-wrap:wrap;margin-top:16px}.grid>div{flex:1;min-width:220px}
.slip{page-break-after:always;margin-bottom:48px}.sign{margin-top:40px;border-top:1px solid #94a3b8;width:260px;padding-top:4px}button{margin-top:24px}@media print{button{display:none}}</style></head><body>${body}
<button onclick="window.print()">Print or save as PDF</button></body></html>`);
  win.document.close();
}

const payslipHtml = (b: Business | undefined, run: PayRun, l: PayLine) => `<div class="slip">
<h1>Payslip</h1><p class="muted">${esc(FREQUENCY_NAMES[run.frequency])} pay · ${esc(run.periodStart)} to ${esc(run.periodEnd)} · paid ${esc(run.payDate)}</p>
<div class="grid"><div><span class="muted">Employer</span><br><strong>${esc(b?.legalName || b?.name || '')}</strong>${b?.tin ? `<br>TIN ${esc(b.tin)}` : ''}</div>
<div><span class="muted">Employee</span><br><strong>${esc(l.name)}</strong>${l.tin ? `<br>TIN ${esc(l.tin)}` : ''}${l.fnpfNumber ? `<br>FNPF ${esc(l.fnpfNumber)}` : ''}<br>Tax code ${esc(l.taxCode)}</div></div>
<table>
<tr><td>Normal pay${l.hours !== undefined ? ` (${l.hours} hours)` : ''}</td><td class="r">${fjd(l.normalPay)}</td></tr>
${l.extraPay ? `<tr><td>Overtime, bonus and allowances</td><td class="r">${fjd(l.extraPay)}</td></tr>` : ''}
<tr><td><strong>Gross pay</strong></td><td class="r"><strong>${fjd(l.gross)}</strong></td></tr>
<tr><td>PAYE</td><td class="r">−${fjd(l.paye)}</td></tr>
<tr><td>FNPF (employee)</td><td class="r">−${fjd(l.fnpfEmployee)}</td></tr>
${l.otherDeductions ? `<tr><td>Other deductions</td><td class="r">−${fjd(l.otherDeductions)}</td></tr>` : ''}
${l.reimbursements ? `<tr><td>Reimbursements (not taxed)</td><td class="r">${fjd(l.reimbursements)}</td></tr>` : ''}
<tr><td><strong>Net pay</strong></td><td class="r"><strong>${fjd(l.net)}</strong></td></tr>
<tr><td class="muted">FNPF paid by your employer</td><td class="r muted">${fjd(l.fnpfEmployer)}</td></tr></table>
${l.note ? `<p class="muted">${esc(l.note)}</p>` : ''}</div>`;

function printCertificate(b: Business | undefined, e: Employee, year: string, y: ReturnType<typeof employeeYear>) {
  const o = e.openingYtd?.year === year ? e.openingYtd : undefined;
  openPrintable(`Tax withholding certificate ${year} ${e.name}`, `
<h1>Tax withholding certificate ${esc(year)}</h1><p class="muted">Employment income for the year ended 31 December ${esc(year)} · issued ${esc(today())}</p>
<div class="grid"><div><span class="muted">Employer</span><br><strong>${esc(b?.legalName || b?.name || '')}</strong>${b?.tin ? `<br>TIN ${esc(b.tin)}` : ''}${b?.address ? `<br>${esc(b.address)}` : ''}</div>
<div><span class="muted">Employee</span><br><strong>${esc(e.name)}</strong>${e.tin ? `<br>TIN ${esc(e.tin)}` : ''}${e.fnpfNumber ? `<br>FNPF ${esc(e.fnpfNumber)}` : ''}</div></div>
<table><tr><th>Pay date</th><th class="r">Gross</th><th class="r">PAYE</th><th class="r">FNPF (employee)</th></tr>
${o ? `<tr><td>Earlier this year</td><td class="r">${fjd(o.normal + o.extra)}</td><td class="r">${fjd(o.paye)}</td><td class="r">${fjd(o.fnpfEmployee || 0)}</td></tr>` : ''}
${y.pays.map(p => `<tr><td>${esc(p.run.payDate)}</td><td class="r">${fjd(p.line.gross)}</td><td class="r">${fjd(p.line.paye)}</td><td class="r">${fjd(p.line.fnpfEmployee)}</td></tr>`).join('')}
<tr><td><strong>Total</strong></td><td class="r"><strong>${fjd(y.gross + (o ? o.normal + o.extra : 0))}</strong></td><td class="r"><strong>${fjd(y.paye + (o?.paye || 0))}</strong></td><td class="r"><strong>${fjd(y.fnpfEmployee + (o?.fnpfEmployee || 0))}</strong></td></tr></table>
<p class="muted">Employer FNPF contributions for the year: ${fjd(y.fnpfEmployer)}.</p>
<div class="sign">Signed for the employer</div>`);
}

const blankEmployee = (businessId: string): Employee => ({
  id: '', businessId, name: '', tin: '', fnpfNumber: '', taxCode: 'P', residency: 'resident', frequency: 'fortnightly', payType: 'salary',
  rate: 0, fnpf: true, startDate: today(), createdAt: ''
});
const activeIn = (e: Employee, from: string, to: string) => e.startDate <= to && (!e.endDate || e.endDate >= from);

export default function PayrollView({ data, onUpdateData }: Props) {
  const { config } = usePlatformConfig();
  const settings: PayrollSettings = config.payroll || DEFAULT_PAYROLL;
  const businesses = data.businesses || [];
  const [businessId, setBusinessId] = useState(data.activeBusinessId || businesses[0]?.id || '');
  const business = businesses.find(b => b.id === businessId);
  const employees = (data.employees || []).filter(e => (e.businessId || '') === businessId);
  const allRuns = data.payRuns || [];
  const runs = allRuns.filter(r => r.businessId === businessId).sort((a, b) => b.payDate.localeCompare(a.payDate));
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [openRun, setOpenRun] = useState<PayRun | null>(null);
  const [newRun, setNewRun] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [year, setYear] = useState(today().slice(0, 4));
  const [paying, setPaying] = useState<'paye' | 'fnpf' | null>(null);

  const summary = useMemo(() => payrollMonth(allRuns, businessId, month), [allRuns, businessId, month]);
  const payments = (data.payrollPayments || []).filter(p => p.businessId === businessId);
  const paidFor = (m: string, kind: 'paye' | 'fnpf') => round2(payments.filter(p => p.month === m && p.kind === kind).reduce((s, p) => s + p.amount, 0));

  // Months with PAYE or FNPF still to pay, oldest first.
  const owing = useMemo(() => {
    const months = [...new Set(runs.filter(r => r.status === 'paid').map(r => r.payDate.slice(0, 7)))].sort();
    return months.map(m => payrollMonth(allRuns, businessId, m)).flatMap(s => [
      { month: s.month, kind: 'PAYE', left: round2(s.paye - paidFor(s.month, 'paye')), due: s.payeDue },
      { month: s.month, kind: 'FNPF', left: round2(s.fnpfEmployee + s.fnpfEmployer - paidFor(s.month, 'fnpf')), due: s.payeDue }
    ]).filter(x => x.left > 0.004);
  }, [allRuns, businessId, payments]);

  const saveEmployee = (e: Employee) => {
    const now = new Date().toISOString();
    const list = data.employees || [];
    onUpdateData({ ...data, employees: e.id ? list.map(x => x.id === e.id ? { ...e, updatedAt: now } : x) : [{ ...e, id: `emp-${Date.now()}`, createdAt: now, updatedAt: now }, ...list] });
    setEditingEmployee(null);
  };
  const removeEmployee = (e: Employee) => {
    if (!confirm(`Remove ${e.name}? Their past pay runs stay in your books. To keep them on record, set a finish date instead.`)) return;
    onUpdateData({ ...data, employees: (data.employees || []).filter(x => x.id !== e.id) });
  };

  const createRun = (frequency: PayFrequency, periodStart: string, periodEnd: string, payDate: string) => {
    const people = employees.filter(e => e.frequency === frequency && activeIn(e, periodStart, periodEnd));
    const run: PayRun = {
      id: `run-${Date.now()}`, businessId, frequency, periodStart, periodEnd, payDate, status: 'draft', createdAt: new Date().toISOString(),
      lines: people.map(e => calcLine(e, { normalPay: normalPayFor(e), extraPay: 0, reimbursements: 0, otherDeductions: 0, ...(e.payType === 'hourly' ? { hours: e.hours ?? 0 } : {}) },
        { frequency, payDate }, ytdFor(allRuns, e, payDate), settings))
    };
    setNewRun(false);
    setOpenRun(run);
  };

  const saveRun = (run: PayRun, markPaid: boolean) => {
    const now = new Date().toISOString();
    let next: CRMData = { ...data };
    let saved: PayRun = { ...run, updatedAt: now };
    if (markPaid) {
      const books = bookkeepingForRun(saved);
      saved = { ...saved, status: 'paid', paidAt: now, expenseIds: books.expenses.map(e => e.id) };
      next = { ...next, expenses: [...books.expenses, ...(next.expenses || []).filter(e => !saved.expenseIds!.includes(e.id))], transactions: [...books.transactions, ...(next.transactions || []).filter(t => !saved.expenseIds!.includes(t.id))] };
      trackAction('payroll_run_paid');
    }
    const exists = allRuns.some(r => r.id === saved.id);
    next = { ...next, payRuns: exists ? allRuns.map(r => r.id === saved.id ? saved : r) : [saved, ...allRuns] };
    onUpdateData(next);
    setOpenRun(null);
  };
  const reopenRun = (run: PayRun) => {
    if (!confirm('Reopen this pay run? Its wages and FNPF expenses are taken out of your books until you mark it paid again.')) return;
    const books = withoutRunBookkeeping(data, run);
    const reopened: PayRun = { ...run, status: 'draft', paidAt: undefined, expenseIds: [], updatedAt: new Date().toISOString() };
    onUpdateData({ ...data, ...books, payRuns: allRuns.map(r => r.id === run.id ? reopened : r) });
    setOpenRun(reopened);
  };
  const deleteRun = (run: PayRun) => {
    if (!confirm('Delete this draft pay run?')) return;
    onUpdateData({ ...data, payRuns: allRuns.filter(r => r.id !== run.id) });
    setOpenRun(null);
  };

  const recordPayment = (p: Omit<PayrollPayment, 'id' | 'businessId' | 'month' | 'kind'>) => {
    if (!paying) return;
    onUpdateData({ ...data, payrollPayments: [{ ...p, id: `prp-${Date.now()}`, businessId, month, kind: paying, updatedAt: new Date().toISOString() }, ...(data.payrollPayments || [])] });
    trackAction(paying === 'paye' ? 'payroll_paye_paid' : 'payroll_fnpf_paid');
    setPaying(null);
  };
  const removePayment = (id: string) => {
    if (!confirm('Remove this payment?')) return;
    onUpdateData({ ...data, payrollPayments: (data.payrollPayments || []).filter(p => p.id !== id) });
  };

  const exportCsv = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payrollMonthCsv(summary)], { type: 'text/csv' }));
    a.download = `payroll-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const erRate = employerFnpfRate(settings, today());

  return (
    <div className="space-y-4" data-testid="payroll-view">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-600" /> Payroll</h3>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xl leading-relaxed">
              Pay your employees with PAYE worked out the FRCS way (year to date, tax code P, or 20% for secondary jobs and no declaration) and FNPF at {settings.fnpfEmployee}% from the employee and {erRate}% from you{settings.fnpfEmployerTemporary && today() <= settings.fnpfEmployerTemporary.to ? ` (${settings.fnpfEmployerTemporary.rate}% from ${settings.fnpfEmployerTemporary.from} to ${settings.fnpfEmployerTemporary.to}, then ${settings.fnpfEmployer}%)` : ''}. PAYE is due to FRCS by the end of the next month. Contractors are paid in the Contractors tab.
            </p>
          </div>
          {businesses.length > 1 && (
            <select aria-label="Business" value={businessId} onChange={e => setBusinessId(e.target.value)} className="bg-white border border-zinc-300 rounded-xl py-1.5 px-2 text-xs font-bold">
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
        {owing.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1" role="status" data-testid="payroll-owing">
            {owing.map(o => (
              <p key={o.month + o.kind} className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{fjd(o.left)}</strong> {o.kind} for {o.month} to pay {o.kind === 'PAYE' ? 'FRCS' : 'FNPF'}{o.kind === 'PAYE' ? <> by <strong>{o.due}</strong>{o.due < today() ? ' (overdue: penalties apply)' : ''}</> : ' (contribution schedule by the 14th of the next month)'}.</span>
                <button className="underline font-bold ml-1" onClick={() => setMonth(o.month)}>Open</button>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Employees */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Employees ({employees.length})</h4>
          <button onClick={() => setEditingEmployee(blankEmployee(businessId))} className="bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add employee</button>
        </div>
        {employees.length === 0 ? <p className="text-xs text-zinc-500">Add the people you employ. You'll need their TIN, FNPF number and tax code (from their tax code declaration).</p> : (
          <div className="divide-y divide-zinc-100">
            {employees.map(e => (
              <div key={e.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-xs font-bold text-zinc-900">{e.name}{e.endDate && e.endDate < today() ? <span className="text-zinc-400 font-normal"> · finished {e.endDate}</span> : ''}</p>
                  <p className="text-[10px] text-zinc-500">{e.jobTitle ? `${e.jobTitle} · ` : ''}{FREQUENCY_NAMES[e.frequency]} · {e.payType === 'hourly' ? `${fjd(e.rate)} an hour` : `${fjd(e.rate)} a period`} · code {e.taxCode}{e.residency === 'non_resident' ? ' · non-resident' : ''}{e.fnpf ? '' : ' · no FNPF'}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => printCertificate(business, e, year, employeeYear(allRuns.filter(r => r.businessId === businessId), e.id, year))} aria-label={`Tax certificate for ${e.name}`} title={`Tax withholding certificate ${year}`} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><FileText className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingEmployee(e)} aria-label={`Edit ${e.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeEmployee(e)} aria-label={`Remove ${e.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pay runs */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700">Pay runs</h4>
          <button disabled={employees.length === 0} onClick={() => setNewRun(true)} className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> New pay run</button>
        </div>
        {runs.length === 0 ? <p className="text-xs text-zinc-500">No pay runs yet.</p> : (
          <div className="divide-y divide-zinc-100">
            {runs.slice(0, 40).map(r => {
              const t = runTotals(r);
              return (
                <button key={r.id} onClick={() => setOpenRun(r)} className="w-full text-left py-2 flex items-center gap-3 flex-wrap text-xs hover:bg-zinc-50">
                  <span className="flex-1 min-w-[180px]"><strong>{FREQUENCY_NAMES[r.frequency]} pay {r.periodStart} to {r.periodEnd}</strong>
                    <span className="block text-[10px] text-zinc-500">Pay date {r.payDate} · {r.lines.length} {r.lines.length === 1 ? 'person' : 'people'} · PAYE {fjd(t.paye)} · FNPF {fjd(t.fnpfEmployee + t.fnpfEmployer)}</span></span>
                  <span className="font-mono">{fjd(t.net)}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{r.status === 'paid' ? 'Paid' : 'Draft'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly PAYE and FNPF */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700">PAYE and FNPF for the month</h4>
          <div className="flex items-center gap-2">
            <input type="month" aria-label="Month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" />
            <button onClick={exportCsv} className="text-xs font-bold border border-zinc-300 rounded-xl px-2.5 py-1 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500">From paid pay runs with a pay date in the month. PAYE: file and pay FRCS by <strong>{summary.payeDue}</strong>. FNPF: send the contribution schedule by <strong>{summary.fnpfScheduleDue}</strong> and pay as myFNPF asks.</p>
        {summary.rows.length === 0 ? <p className="text-xs text-zinc-500">No paid pay runs in {month}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="payroll-summary">
              <thead><tr className="text-[10px] uppercase text-zinc-500 text-left"><th className="py-1.5">Employee</th><th className="text-right">Gross</th><th className="text-right">PAYE</th><th className="text-right">FNPF 8%</th><th className="text-right">FNPF employer</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {summary.rows.map(r => <tr key={r.employeeId}><td className="py-1.5 font-bold">{r.name}</td><td className="text-right font-mono">{fjd(r.gross)}</td><td className="text-right font-mono">{fjd(r.paye)}</td><td className="text-right font-mono">{fjd(r.fnpfEmployee)}</td><td className="text-right font-mono">{fjd(r.fnpfEmployer)}</td></tr>)}
                <tr className="font-black"><td className="py-1.5">Total</td><td className="text-right font-mono">{fjd(summary.gross)}</td><td className="text-right font-mono">{fjd(summary.paye)}</td><td className="text-right font-mono">{fjd(summary.fnpfEmployee)}</td><td className="text-right font-mono">{fjd(summary.fnpfEmployer)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        {summary.rows.length > 0 && (
          <div className="border-t border-zinc-100 pt-3 grid sm:grid-cols-2 gap-3">
            {(['paye', 'fnpf'] as const).map(kind => {
              const owed = kind === 'paye' ? summary.paye : round2(summary.fnpfEmployee + summary.fnpfEmployer);
              const paid = paidFor(month, kind);
              return (
                <div key={kind} className="space-y-1">
                  <p className="text-xs">{kind === 'paye' ? 'PAYE paid to FRCS' : 'FNPF paid'}: <strong className="font-mono">{fjd(paid)}</strong> of <span className="font-mono">{fjd(owed)}</span>{paid + 0.004 >= owed && owed > 0 && <span className="ml-1 text-emerald-700 font-bold">Paid in full</span>}</p>
                  {paid + 0.004 < owed && <button onClick={() => setPaying(kind)} className="text-[11px] font-bold bg-zinc-900 text-white rounded-lg px-2.5 py-1">Record {kind === 'paye' ? 'PAYE' : 'FNPF'} payment</button>}
                  {payments.filter(p => p.month === month && p.kind === kind).map(p => (
                    <p key={p.id} className="text-[11px] text-zinc-600 flex items-center gap-2">{p.date} · {fjd(p.amount)}{p.reference ? ` · ${p.reference}` : ''}
                      <button onClick={() => removePayment(p.id)} aria-label="Remove payment" className="text-rose-600"><X className="w-3 h-3" /></button></p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 border-t border-zinc-100 pt-2">
          <span>Tax certificates for</span>
          <input type="number" aria-label="Certificate year" min="2000" max="2100" value={year} onChange={e => setYear(e.target.value)} className="w-20 bg-white border border-zinc-300 rounded-lg py-0.5 px-2 text-xs font-mono" />
          <span>: use the certificate button next to each employee.</span>
        </div>
      </div>

      {editingEmployee && <EmployeeForm initial={editingEmployee} onCancel={() => setEditingEmployee(null)} onSave={saveEmployee} />}
      {newRun && <NewRunForm employees={employees} onCancel={() => setNewRun(false)} onCreate={createRun} />}
      {openRun && <RunEditor run={openRun} business={business} employees={data.employees || []} allRuns={allRuns} settings={settings}
        onClose={() => setOpenRun(null)} onSave={saveRun} onReopen={reopenRun} onDelete={deleteRun} />}
      {paying && <PaymentForm title={`${paying === 'paye' ? 'PAYE' : 'FNPF'} paid for ${month}`} owed={round2((paying === 'paye' ? summary.paye : summary.fnpfEmployee + summary.fnpfEmployer) - paidFor(month, paying))} onCancel={() => setPaying(null)} onSave={recordPayment} />}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-zinc-950/70 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white rounded-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl my-auto max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-black text-zinc-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-zinc-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function EmployeeForm({ initial, onCancel, onSave }: { initial: Employee; onCancel: () => void; onSave: (e: Employee) => void }) {
  const [e, setE] = useState<Employee>(initial);
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setE(prev => ({ ...prev, [k]: v }));
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!e.name.trim() || !(e.rate >= 0)) return;
    onSave({ ...e, name: e.name.trim(), tin: e.tin.trim(), fnpfNumber: e.fnpfNumber.trim(), endDate: e.endDate || undefined, hours: e.payType === 'hourly' ? e.hours || 0 : undefined, employerTopUp: e.employerTopUp || undefined,
      openingYtd: e.openingYtd && (e.openingYtd.normal || e.openingYtd.extra || e.openingYtd.paye || e.openingYtd.fnpfEmployee) ? e.openingYtd : undefined });
  };
  return (
    <Modal title={initial.id ? 'Edit employee' : 'Add employee'} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label} htmlFor="emp-name">Name *</label><input id="emp-name" required className={input} value={e.name} onChange={ev => set('name', ev.target.value)} /></div>
          <div><label className={label} htmlFor="emp-tin">TIN</label><input id="emp-tin" className={input} value={e.tin} onChange={ev => set('tin', ev.target.value)} /></div>
          <div><label className={label} htmlFor="emp-fnpf">FNPF number</label><input id="emp-fnpf" className={input} value={e.fnpfNumber} onChange={ev => set('fnpfNumber', ev.target.value)} /></div>
          <div><label className={label} htmlFor="emp-title">Job title</label><input id="emp-title" className={input} value={e.jobTitle || ''} onChange={ev => set('jobTitle', ev.target.value)} /></div>
          <div><label className={label} htmlFor="emp-code">Tax code</label>
            <select id="emp-code" className={input} value={e.taxCode} onChange={ev => set('taxCode', ev.target.value as Employee['taxCode'])}>
              <option value="P">P: main job</option><option value="S">S: second job (20%)</option><option value="N">No declaration yet (20%)</option>
            </select></div>
          <div><label className={label} htmlFor="emp-res">Tax residence</label>
            <select id="emp-res" className={input} value={e.residency} onChange={ev => set('residency', ev.target.value as Employee['residency'])}>
              <option value="resident">Fiji resident</option><option value="non_resident">Non-resident</option>
            </select></div>
          <div><label className={label} htmlFor="emp-freq">Paid</label>
            <select id="emp-freq" className={input} value={e.frequency} onChange={ev => set('frequency', ev.target.value as PayFrequency)}>
              {(Object.keys(FREQUENCY_NAMES) as PayFrequency[]).map(f => <option key={f} value={f}>{FREQUENCY_NAMES[f]}</option>)}
            </select></div>
          <div><label className={label} htmlFor="emp-type">Pay</label>
            <select id="emp-type" className={input} value={e.payType} onChange={ev => set('payType', ev.target.value as Employee['payType'])}>
              <option value="salary">Salary or wage per pay period</option><option value="hourly">Hourly rate</option>
            </select></div>
          <div><label className={label} htmlFor="emp-rate">{e.payType === 'hourly' ? 'Rate an hour (FJD)' : 'Pay per period (FJD)'}</label><input id="emp-rate" type="number" min="0" step="0.01" required className={input} value={e.rate || ''} onChange={ev => set('rate', Number(ev.target.value) || 0)} /></div>
          {e.payType === 'hourly' && <div><label className={label} htmlFor="emp-hours">Usual hours a period</label><input id="emp-hours" type="number" min="0" step="0.25" className={input} value={e.hours ?? ''} onChange={ev => set('hours', Number(ev.target.value) || 0)} /></div>}
          <div><label className={label} htmlFor="emp-start">Started</label><input id="emp-start" type="date" required className={input} value={e.startDate} onChange={ev => set('startDate', ev.target.value || today())} /></div>
          <div><label className={label} htmlFor="emp-end">Finished</label><input id="emp-end" type="date" className={input} value={e.endDate || ''} onChange={ev => set('endDate', ev.target.value)} /></div>
          <div><label className={label} htmlFor="emp-email">Email</label><input id="emp-email" type="email" className={input} value={e.email || ''} onChange={ev => set('email', ev.target.value)} /></div>
          <div><label className={label} htmlFor="emp-bank">Bank account</label><input id="emp-bank" className={input} value={e.bankAccount || ''} onChange={ev => set('bankAccount', ev.target.value)} /></div>
        </div>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={e.fnpf} onChange={ev => set('fnpf', ev.target.checked)} className="mt-0.5" />
          <span><strong>FNPF member</strong><span className="block text-[10px] text-zinc-500">Almost every employee contributes. Untick only for someone FNPF has exempted, such as some short-term foreign experts.</span></span></label>
        <details className="text-xs" open={!!e.openingYtd}>
          <summary className="cursor-pointer font-bold text-zinc-600">Paid earlier this year, before Frilensa</summary>
          <p className="text-[10px] text-zinc-500 mt-1">If you paid them this tax year with another payroll, enter the totals so far. PAYE uses them to stay right for the year.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {([['normal', 'Normal pay'], ['extra', 'Overtime, bonus'], ['paye', 'PAYE'], ['fnpfEmployee', 'Employee FNPF']] as const).map(([k, text]) => (
              <div key={k}><label className={label} htmlFor={`emp-open-${k}`}>{text}</label>
                <input id={`emp-open-${k}`} type="number" min="0" step="0.01" className={input} value={e.openingYtd?.[k] || ''}
                  onChange={ev => set('openingYtd', { year: e.openingYtd?.year || today().slice(0, 4), normal: 0, extra: 0, paye: 0, fnpfEmployee: 0, ...e.openingYtd, [k]: Number(ev.target.value) || 0 })} /></div>
            ))}
          </div>
          {e.openingYtd && <p className="text-[10px] text-zinc-500 mt-1">For the {e.openingYtd.year} tax year.</p>}
        </details>
        {e.fnpf && <div className="w-48"><label className={label} htmlFor="emp-topup">Extra employer FNPF (%)</label><input id="emp-topup" type="number" min="0" max="2" step="0.5" className={input} value={e.employerTopUp ?? ''} onChange={ev => set('employerTopUp', Number(ev.target.value) || 0)} placeholder="0" /></div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save employee</button>
        </div>
      </form>
    </Modal>
  );
}

function NewRunForm({ employees, onCancel, onCreate }: { employees: Employee[]; onCancel: () => void; onCreate: (f: PayFrequency, start: string, end: string, payDate: string) => void }) {
  const counts = (Object.keys(FREQUENCY_NAMES) as PayFrequency[]).map(f => [f, employees.filter(e => e.frequency === f).length] as const);
  const [frequency, setFrequency] = useState<PayFrequency>([...counts].sort((a, b) => b[1] - a[1])[0][0]);
  const defaultStart = (f: PayFrequency) => f === 'monthly' ? `${today().slice(0, 7)}-01` : addDays(today(), f === 'weekly' ? -6 : -13);
  const endFor = (f: PayFrequency, start: string) => f === 'monthly' ? addDays(new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7), 1)).toISOString().slice(0, 10), -1) : addDays(start, f === 'weekly' ? 6 : 13);
  const [start, setStart] = useState(defaultStart(frequency));
  const [end, setEnd] = useState(endFor(frequency, defaultStart(frequency)));
  const [payDate, setPayDate] = useState(endFor(frequency, defaultStart(frequency)));
  const changeFreq = (f: PayFrequency) => { setFrequency(f); const s = defaultStart(f); setStart(s); setEnd(endFor(f, s)); setPayDate(endFor(f, s)); };
  const people = employees.filter(e => e.frequency === frequency && activeIn(e, start, end)).length;
  return (
    <Modal title="New pay run" onClose={onCancel}>
      <form onSubmit={ev => { ev.preventDefault(); if (start <= end) onCreate(frequency, start, end, payDate); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label} htmlFor="run-freq">Who</label>
            <select id="run-freq" className={input} value={frequency} onChange={ev => changeFreq(ev.target.value as PayFrequency)}>
              {counts.map(([f, n]) => <option key={f} value={f}>{FREQUENCY_NAMES[f]} pay ({n} {n === 1 ? 'person' : 'people'})</option>)}
            </select></div>
          <div><label className={label} htmlFor="run-start">Period from</label><input id="run-start" type="date" required className={input} value={start} onChange={ev => { setStart(ev.target.value); setEnd(endFor(frequency, ev.target.value)); setPayDate(endFor(frequency, ev.target.value)); }} /></div>
          <div><label className={label} htmlFor="run-end">to</label><input id="run-end" type="date" required className={input} value={end} onChange={ev => setEnd(ev.target.value)} /></div>
          <div><label className={label} htmlFor="run-pay">Pay date</label><input id="run-pay" type="date" required className={input} value={payDate} onChange={ev => setPayDate(ev.target.value)} /></div>
        </div>
        <p className="text-[11px] text-zinc-500">{people} {people === 1 ? 'employee' : 'employees'} in this run. PAYE is worked out by the pay date.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" disabled={people === 0} className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-40">Start pay run</button>
        </div>
      </form>
    </Modal>
  );
}

type LineInput = { hours?: number; normalPay: number; extraPay: number; reimbursements: number; otherDeductions: number; note?: string };

function RunEditor({ run, business, employees, allRuns, settings, onClose, onSave, onReopen, onDelete }: {
  run: PayRun; business: Business | undefined; employees: Employee[]; allRuns: PayRun[]; settings: PayrollSettings;
  onClose: () => void; onSave: (r: PayRun, paid: boolean) => void; onReopen: (r: PayRun) => void; onDelete: (r: PayRun) => void;
}) {
  const paid = run.status === 'paid';
  const [inputs, setInputs] = useState<Record<string, LineInput>>(() => Object.fromEntries(run.lines.map(l => [l.employeeId,
    { hours: l.hours, normalPay: l.normalPay, extraPay: l.extraPay, reimbursements: l.reimbursements, otherDeductions: l.otherDeductions, note: l.note }])));
  const lines: PayLine[] = paid ? run.lines : run.lines.map(l => {
    const e = employees.find(x => x.id === l.employeeId);
    const i = inputs[l.employeeId];
    if (!e) return l;
    return calcLine(e, i, run, ytdFor(allRuns, e, run.payDate, run.id), settings);
  });
  const t = runTotals({ lines });
  const set = (id: string, patch: Partial<LineInput>) => setInputs(prev => {
    const e = employees.find(x => x.id === id);
    const next = { ...prev[id], ...patch };
    if (e && e.payType === 'hourly' && patch.hours !== undefined) next.normalPay = normalPayFor(e, patch.hours);
    return { ...prev, [id]: next };
  });
  const current = (): PayRun => ({ ...run, lines });
  const num = (v: string) => Number(v) || 0;

  return (
    <Modal wide title={`${FREQUENCY_NAMES[run.frequency]} pay ${run.periodStart} to ${run.periodEnd}`} onClose={onClose}>
      <p className="text-[11px] text-zinc-500">Pay date {run.payDate} · {paid ? `paid, recorded in your books` : 'draft'} · employer FNPF {employerFnpfRate(settings, run.payDate)}%</p>
      <div className="space-y-2" data-testid="run-lines">
        {lines.map(l => {
          const e = employees.find(x => x.id === l.employeeId);
          const i = inputs[l.employeeId];
          return (
            <div key={l.employeeId} className="border border-zinc-200 rounded-xl p-3 space-y-2" data-testid={`line-${l.name}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-bold">{l.name} <span className="text-zinc-400 font-normal">· code {l.taxCode}{l.residency === 'non_resident' ? ' · non-resident' : ''}</span></p>
                {paid && <button onClick={() => openPrintable(`Payslip ${l.name} ${run.payDate}`, payslipHtml(business, run, l))} className="text-[11px] font-bold border border-zinc-300 rounded-lg px-2 py-0.5 flex items-center gap-1"><Printer className="w-3 h-3" /> Payslip</button>}
              </div>
              {!paid && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {e?.payType === 'hourly' && <div><label className={label}>Hours<input aria-label={`Hours for ${l.name}`} type="number" min="0" step="0.25" className={small} value={i.hours ?? ''} onChange={ev => set(l.employeeId, { hours: num(ev.target.value) })} /></label></div>}
                  <div><label className={label}>Normal pay<input aria-label={`Normal pay for ${l.name}`} type="number" min="0" step="0.01" className={small} value={i.normalPay} onChange={ev => set(l.employeeId, { normalPay: num(ev.target.value) })} /></label></div>
                  <div><label className={label}>Overtime, bonus<input aria-label={`Overtime and bonus for ${l.name}`} type="number" min="0" step="0.01" className={small} value={i.extraPay || ''} onChange={ev => set(l.employeeId, { extraPay: num(ev.target.value) })} /></label></div>
                  <div><label className={label}>Reimburse<input aria-label={`Reimbursements for ${l.name}`} type="number" min="0" step="0.01" className={small} value={i.reimbursements || ''} onChange={ev => set(l.employeeId, { reimbursements: num(ev.target.value) })} /></label></div>
                  <div><label className={label}>Deductions<input aria-label={`Other deductions for ${l.name}`} type="number" min="0" step="0.01" className={small} value={i.otherDeductions || ''} onChange={ev => set(l.employeeId, { otherDeductions: num(ev.target.value) })} /></label></div>
                </div>
              )}
              <div className="grid grid-cols-5 gap-2 font-mono text-[11px]">
                <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Gross</span>{fjd(l.gross)}</div>
                <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">PAYE</span><span data-testid="line-paye">{fjd(l.paye)}</span></div>
                <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">FNPF {settings.fnpfEmployee}%</span><span data-testid="line-fnpf">{fjd(l.fnpfEmployee)}</span></div>
                <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Employer FNPF</span>{fjd(l.fnpfEmployer)}</div>
                <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Net pay</span><strong data-testid="line-net">{fjd(l.net)}</strong></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]" data-testid="run-totals">
        <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Net pay to send</span><strong>{fjd(t.net)}</strong></div>
        <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">PAYE to FRCS</span>{fjd(t.paye)}</div>
        <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">FNPF to pay</span>{fjd(t.fnpfEmployee + t.fnpfEmployer)}</div>
        <div><span className="block text-[9px] uppercase text-zinc-500 font-sans font-bold">Cost to you</span>{fjd(t.gross + t.reimbursements + t.fnpfEmployer)}</div>
      </div>
      <div className="flex justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {!paid && <button onClick={() => onDelete(run)} className="text-xs font-bold px-3 py-2 rounded-xl border border-rose-200 text-rose-700">Delete draft</button>}
          {paid && <button onClick={() => onReopen(run)} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Reopen</button>}
          {paid && <button onClick={() => openPrintable(`Payslips ${run.payDate}`, run.lines.map(l => payslipHtml(business, run, l)).join(''))} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300 flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> All payslips</button>}
        </div>
        {!paid && (
          <div className="flex gap-2">
            <button onClick={() => onSave(current(), false)} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Save draft</button>
            <button onClick={() => onSave(current(), true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white">Mark as paid</button>
          </div>
        )}
      </div>
      {!paid && <p className="text-[10px] text-zinc-500">Marking it paid adds the wages and your FNPF to your expenses and makes payslips. Pay runs count towards the year-to-date PAYE in the order of their pay dates.</p>}
    </Modal>
  );
}

function PaymentForm({ title, owed, onCancel, onSave }: { title: string; owed: number; onCancel: () => void; onSave: (p: { amount: number; date: string; reference?: string }) => void }) {
  const [amount, setAmount] = useState(Math.max(0, owed));
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={ev => { ev.preventDefault(); if (amount > 0) onSave({ amount: round2(amount), date, ...(reference.trim() ? { reference: reference.trim() } : {}) }); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="pp-amount">Amount (FJD)</label><input id="pp-amount" type="number" min="0" step="0.01" required className={input} value={amount || ''} onChange={ev => setAmount(Number(ev.target.value) || 0)} /></div>
          <div><label className={label} htmlFor="pp-date">Paid on</label><input id="pp-date" type="date" required className={input} value={date} onChange={ev => setDate(ev.target.value || today())} /></div>
          <div className="col-span-2"><label className={label} htmlFor="pp-ref">Receipt or reference</label><input id="pp-ref" className={input} value={reference} onChange={ev => setReference(ev.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save</button>
        </div>
      </form>
    </Modal>
  );
}
