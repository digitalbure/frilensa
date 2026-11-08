import React, { useEffect, useState } from 'react';
import { Check, CreditCard, X } from 'lucide-react';
import { cleanBilling, PAYPAL_BILLING_CURRENCIES, type BillingSettings, type PlanReceipt, type Subscription } from '../lib/billing';
import { openPlanReceipt } from '../lib/billingClient';

interface AdminPayment { id: string; uid: string; email: string; planName: string; plan: string; cycle: string; amount: number; method: string; reference: string; status: string; reason?: string; createdAt: string; charged?: number; chargedCurrency?: string; receipt?: PlanReceipt }
type AdminSub = Subscription & { daysLeft: number | null; email: string };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const post = (url: string, body: unknown = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHOD: Record<string, string> = { paypal: 'PayPal', bank: 'Bank transfer', mpaisa: 'M-PAiSA', mycash: 'MyCash', admin: 'Set by admin', early_access: 'Early access' };

/** Admin → Billing: whether plans are paid, how people pay, payments to approve, and who's on a paid plan. */
export default function AdminBillingView({ billing, onSave, showToast }: { billing: BillingSettings; onSave: (b: BillingSettings) => Promise<void> | void; showToast: (m: string) => void }) {
  const [draft, setDraft] = useState<BillingSettings>(billing);
  const [data, setData] = useState<{ today: string; paypalConfigured: boolean; payments: AdminPayment[]; subscriptions: AdminSub[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { setDraft(billing); }, [billing]);
  const load = () => fetch('/api/admin/billing').then(r => json<typeof data>(r)).then(d => { setData(d); setProblem(null); }).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);

  const set = (patch: Partial<BillingSettings>) => setDraft(d => ({ ...d, ...patch }));
  const changed = JSON.stringify(cleanBilling(draft)) !== JSON.stringify(cleanBilling(billing));
  const save = async () => {
    const next = cleanBilling(draft);
    if (next.enabled && !billing.enabled && !confirm(`Turn on paid plans? Plan limits will apply to everyone, and early-access Pro and Premium plans ${next.earlyAccessUntil ? `end on ${next.earlyAccessUntil}` : 'end now'} unless they're paid for.`)) return;
    await onSave(next);
  };
  const approve = async (p: AdminPayment) => {
    try { await json(await post(`/api/admin/billing/payments/${p.id}/approve`)); showToast(`${p.email} is on ${p.planName}.`); load(); } catch (err: any) { showToast(err.message); }
  };
  const reject = async (p: AdminPayment) => {
    const reason = prompt('Why? The customer sees this.', "We couldn't find a payment with this reference.");
    if (reason === null) return;
    try { await json(await post(`/api/admin/billing/payments/${p.id}/reject`, { reason })); showToast('Payment rejected.'); load(); } catch (err: any) { showToast(err.message); }
  };

  const card = 'bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3';
  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500';
  const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
  const pending = (data?.payments || []).filter(p => p.status === 'pending');
  const recent = (data?.payments || []).filter(p => p.status !== 'pending').slice(0, 20);
  const income = (data?.payments || []).filter(p => p.status === 'approved').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      {problem && <p className="text-xs text-rose-300">{problem}</p>}

      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Paid plans</h3>
            <p className="text-[11px] text-slate-400">{billing.enabled ? 'On: plans are paid for and their limits apply.' : 'Off: early access. Everyone switches plans for free and limits aren’t enforced.'}</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-200 shrink-0">
            <input type="checkbox" checked={draft.enabled} onChange={e => set({ enabled: e.target.checked })} /> Paid plans on
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block"><span className={label}>Early access ends</span>
            <input type="date" className={input} value={draft.earlyAccessUntil} onChange={e => set({ earlyAccessUntil: e.target.value })} />
            <span className="text-[10px] text-slate-500">Early-access Pro and Premium keep working until this date. Empty: they end when paid plans start.</span>
          </label>
          <label className="block"><span className={label}>Grace days after a plan runs out</span>
            <input type="number" min={0} max={60} className={input} value={draft.graceDays} onChange={e => set({ graceDays: Number(e.target.value) })} />
          </label>
        </div>

        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-300 pt-2">How people pay</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block sm:col-span-3"><span className={label}>Bank transfer details</span>
            <textarea rows={3} className={input} value={draft.bankDetails} onChange={e => set({ bankDetails: e.target.value })} placeholder="Bank, account name, account number, branch" />
          </label>
          <label className="block"><span className={label}>M-PAiSA number</span><input className={input} value={draft.mpaisa} onChange={e => set({ mpaisa: e.target.value })} /></label>
          <label className="block"><span className={label}>MyCash number</span><input className={input} value={draft.mycash} onChange={e => set({ mycash: e.target.value })} /></label>
          <label className="block"><span className={label}>Instructions</span><input className={input} value={draft.instructions} onChange={e => set({ instructions: e.target.value })} placeholder="e.g. Use your email as the reference" /></label>
        </div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <input type="checkbox" checked={draft.paypal} onChange={e => set({ paypal: e.target.checked })} /> <CreditCard className="w-3.5 h-3.5" /> Card and PayPal
            <span className={`ml-auto text-[10px] font-semibold ${data?.paypalConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>{data ? (data.paypalConfigured ? 'Frilensa PayPal keys are set on the server' : 'Needs FRILENSA_PAYPAL_CLIENT_ID and FRILENSA_PAYPAL_SECRET on the server') : ''}</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={label}>Charge in</span>
              <select className={input} value={draft.paypalCurrency} onChange={e => set({ paypalCurrency: e.target.value })}>{PAYPAL_BILLING_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="block"><span className={label}>1 FJD =</span>
              <input type="number" step="0.0001" min={0} className={input} value={draft.paypalRate} onChange={e => set({ paypalRate: Number(e.target.value) })} />
            </label>
          </div>
          <p className="text-[10px] text-slate-500">PayPal can't charge in FJD. A FJD 25 plan is charged as {draft.paypalCurrency} {(25 * (draft.paypalRate || 0)).toFixed(2)}.</p>
        </div>
        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-300 pt-2">Your details for receipts</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block"><span className={label}>Legal name</span><input className={input} value={draft.seller.legalName} onChange={e => set({ seller: { ...draft.seller, legalName: e.target.value } })} placeholder="e.g. Frilensa Pte Limited" /></label>
          <label className="block"><span className={label}>TIN</span><input className={input} value={draft.seller.tin} onChange={e => set({ seller: { ...draft.seller, tin: e.target.value } })} /></label>
          <label className="block"><span className={label}>Email</span><input className={input} value={draft.seller.email} onChange={e => set({ seller: { ...draft.seller, email: e.target.value } })} placeholder="billing@frilensa.com" /></label>
          <label className="block sm:col-span-2"><span className={label}>Address</span><textarea rows={2} className={input} value={draft.seller.address} onChange={e => set({ seller: { ...draft.seller, address: e.target.value } })} /></label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-200"><input type="checkbox" checked={draft.seller.vatRegistered} onChange={e => set({ seller: { ...draft.seller, vatRegistered: e.target.checked } })} /> VAT-registered</label>
            {draft.seller.vatRegistered && <label className="block"><span className={label}>VAT rate % (included in prices)</span><input type="number" step="0.5" className={input} value={draft.seller.vatRate} onChange={e => set({ seller: { ...draft.seller, vatRate: Number(e.target.value) } })} /></label>}
          </div>
          <label className="block sm:col-span-3"><span className={label}>Note at the bottom of receipts</span><input className={input} value={draft.seller.footer} onChange={e => set({ seller: { ...draft.seller, footer: e.target.value } })} placeholder="e.g. Thank you. Plans are prepaid and don't renew automatically." /></label>
        </div>
        <p className="text-[10px] text-slate-500">Each approved payment gets a numbered receipt (FRL-2026-0001…), or a tax invoice showing the VAT included when you're VAT-registered. Receipts keep the details as they were when issued.</p>
        <div className="flex justify-end">
          <button type="button" disabled={!changed} onClick={save} className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40">Save billing settings</button>
        </div>
      </section>

      <section className={card}>
        <h3 className="text-sm font-bold text-slate-100">Payments to check ({pending.length})</h3>
        <p className="text-[11px] text-slate-400">Bank, M-PAiSA and MyCash payments. Approve once the money has arrived; the plan starts then and the customer is emailed.</p>
        {pending.length === 0 ? <p className="text-xs text-slate-500">Nothing waiting.</p> : pending.map(p => (
          <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-bold text-slate-100">{p.email} · {p.planName} ({p.cycle})</p>
              <p className="text-slate-400 font-mono text-[11px]">{METHOD[p.method] || p.method} · ref {p.reference} · {new Date(p.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-slate-100">{fjd(p.amount)}</span>
              <button type="button" onClick={() => reject(p)} aria-label="Reject" className="p-2 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/30 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => approve(p)} className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 font-extrabold flex items-center gap-1 cursor-pointer"><Check className="w-3.5 h-3.5" /> Approve</button>
            </div>
          </div>
        ))}
      </section>

      <section className={card}>
        <div className="flex justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-100">Paid and given plans ({data?.subscriptions.length || 0})</h3>
          <span className="text-[11px] text-slate-400">Received: <strong className="text-emerald-300">{fjd(income)}</strong></span>
        </div>
        <p className="text-[11px] text-slate-400">To give someone a plan, use Admin → Workspaces.</p>
        {(data?.subscriptions || []).map(s => (
          <div key={s.uid} className="flex justify-between gap-2 text-xs border-b border-slate-800 pb-1.5">
            <span className="text-slate-200 truncate">{s.email || `${s.uid.slice(0, 10)}…`} · <strong className="uppercase">{s.plan}</strong> · {METHOD[s.method] || s.method}{s.note ? ` · ${s.note}` : ''}</span>
            <span className={`shrink-0 ${s.status !== 'active' || (s.daysLeft !== null && s.daysLeft < 0) ? 'text-rose-300' : s.daysLeft !== null && s.daysLeft <= 7 ? 'text-amber-300' : 'text-slate-400'}`}>
              {s.status !== 'active' ? 'Ended' : s.paidUntil ? `until ${s.paidUntil}` : 'Open-ended'}
            </span>
          </div>
        ))}
        {recent.length > 0 && (
          <details className="text-[11px] text-slate-400">
            <summary className="cursor-pointer font-semibold text-slate-300">Recent payments</summary>
            {recent.map(p => <p key={p.id}>{p.createdAt.slice(0, 10)} · {p.email} · {p.planName} · {METHOD[p.method] || p.method} · {p.status === 'approved' ? fjd(p.amount) : p.status}{p.receipt && <> · <button type="button" onClick={() => openPlanReceipt(p.id, true)} className="underline text-sky-300 cursor-pointer">{p.receipt.number}</button></>}</p>)}
          </details>
        )}
      </section>
    </div>
  );
}
