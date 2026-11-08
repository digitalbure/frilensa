import React from 'react';
import { Clock, Sparkles } from 'lucide-react';
import type { CRMData } from '../types';
import { usePlatformConfig } from '../lib/platformConfig';
import { LIMIT_NAMES, openPlanReceipt, openUpgrade, usageOf, useBilling, type LimitKind } from '../lib/billingClient';

const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KINDS: LimitKind[] = ['invoices', 'clients', 'businesses', 'services', 'projects', 'aiScans'];

/** Settings → Plan: your plan, how long it's paid for, payments waiting, and what you've used. */
export default function PlanCard({ data }: { data: CRMData }) {
  const billing = useBilling();
  const { config } = usePlatformConfig();
  const planId = billing?.plan || data.platformSettings?.activePlan || 'free';
  const plan = config.plans[planId];
  const sub = billing?.subscription;
  const paid = !!billing?.billing.enabled;
  const left = billing?.daysLeft ?? null;
  const pending = (billing?.payments || []).filter(p => p.status === 'pending');
  const used = { ...usageOf(data, (billing?.today || new Date().toISOString()).slice(0, 7)), aiScans: billing?.aiScansUsed || 0 };

  let status = '';
  if (!paid) status = 'Free to switch during early access.';
  else if (planId === 'free') status = sub && sub.plan !== 'free' && sub.method !== 'early_access' ? `Your ${config.plans[sub.plan]?.name || ''} plan ended on ${sub.paidUntil}.` : 'Upgrade any time for higher limits.';
  else if (sub?.method === 'early_access') status = billing?.billing.earlyAccessUntil ? `Early access until ${billing.billing.earlyAccessUntil}. Pay before then to keep it.` : 'Early access.';
  else if (sub?.paidUntil) status = left !== null && left < 0 ? `Ran out on ${sub.paidUntil}. Renew to keep it.` : `Paid until ${sub.paidUntil}${left !== null && left <= 14 ? ` (${left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`})` : ''}.`;
  else status = 'Active.';
  const urgent = paid && planId !== 'free' && ((left !== null && left <= 7) || sub?.method === 'early_access');

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-sky-600 mt-0.5" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Plan</span>
            <span className="text-xs font-bold text-zinc-900 uppercase">{plan?.name || 'Free'} plan</span>
            <p className={`text-[11px] mt-0.5 ${urgent ? 'text-amber-700 font-semibold' : 'text-zinc-500'}`}>{status}</p>
          </div>
        </div>
        <button type="button" onClick={() => openUpgrade('')}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all shrink-0 cursor-pointer ${urgent ? 'bg-sky-600 text-white border-sky-600' : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'}`}>
          {!paid ? 'Change plan' : planId === 'free' ? 'Upgrade' : 'Renew or change'}
        </button>
      </div>

      {pending.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
          <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{pending.map(p => `${p.planName} payment of ${fjd(p.amount)} (ref ${p.reference})`).join('; ')} is waiting for Frilensa to confirm.</span>
        </div>
      )}

      {plan && (
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 text-center">
          {KINDS.map(k => {
            const meta = LIMIT_NAMES[k];
            const max = Number(plan.limits[meta.key]);
            const n = used[k];
            const full = max >= 0 && n >= max;
            return (
              <div key={k} className={`p-2 rounded-lg ${full && paid ? 'bg-amber-50' : 'bg-zinc-50'}`}>
                <span className="text-[8.5px] text-zinc-500 uppercase block font-semibold">{meta.many}{meta.monthly ? ' / month' : ''}</span>
                <span className="text-xs font-mono font-bold text-zinc-800">{n} / {max < 0 ? '∞' : max}</span>
              </div>
            );
          })}
        </div>
      )}
      {!paid && <p className="text-[10px] text-zinc-400">Limits aren't enforced during early access.</p>}

      {(billing?.payments || []).some(p => p.status !== 'pending') && (
        <details className="text-[11px] text-zinc-600">
          <summary className="cursor-pointer font-semibold text-zinc-700">Plan payments</summary>
          <ul className="mt-1 space-y-0.5">
            {billing!.payments.filter(p => p.status !== 'pending').slice(0, 10).map(p => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.createdAt.slice(0, 10)} · {p.planName} ({p.cycle}) · {p.method === 'paypal' ? 'PayPal' : p.method === 'bank' ? 'Bank' : p.method === 'mpaisa' ? 'M-PAiSA' : 'MyCash'}</span>
                <span className="flex items-center gap-2">
                  <span className={p.status === 'approved' ? 'text-emerald-700' : 'text-rose-600'}>{p.status === 'approved' ? fjd(p.amount) : p.status === 'rejected' ? 'Not found' : 'Failed'}</span>
                  {p.receipt && <button type="button" onClick={() => openPlanReceipt(p.id)} className="text-sky-700 underline font-semibold cursor-pointer">{p.receipt.taxInvoice ? 'Tax invoice' : 'Receipt'}</button>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
