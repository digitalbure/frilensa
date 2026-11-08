import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Clock, CreditCard, Smartphone, Wallet } from 'lucide-react';
import type { PlanTier } from '../types';
import { usePlatformConfig } from '../lib/platformConfig';
import { finishPaypalPayment, payManually, paypalCharge, planPrice, startPaypalPayment, useBilling, type BillingCycle } from '../lib/billingClient';
import { loadPaypalSdk } from '../lib/payNowClient';

type Method = 'card' | 'paypal' | 'bank' | 'mpaisa' | 'mycash';
const LABEL: Record<Method, string> = { card: 'Credit or debit card', paypal: 'PayPal', bank: 'Bank transfer', mpaisa: 'M-PAiSA', mycash: 'MyCash' };
const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Paying for a plan: card or PayPal (confirmed straight away) or a transfer Frilensa checks. */
export default function PlanPayment({ plan, cycle, onBack, onDone, onClose }: { plan: PlanTier; cycle: BillingCycle; onBack: () => void; onDone: () => void; onClose: () => void }) {
  const billing = useBilling();
  const { config } = usePlatformConfig();
  const b = billing?.billing;
  const p = config.plans[plan];
  const amount = planPrice(p, cycle);
  const methods: Method[] = [
    ...(b?.paypal && b.paypalClientId ? ['card' as const, 'paypal' as const] : []),
    ...(b?.bankDetails ? ['bank' as const] : []),
    ...(b?.mpaisa ? ['mpaisa' as const] : []),
    ...(b?.mycash ? ['mycash' as const] : [])
  ];
  const [method, setMethod] = useState<Method | null>(methods[0] || null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<'paid' | 'pending' | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const renewing = billing?.plan === plan && billing?.subscription?.method !== 'early_access';

  // Card and PayPal buttons, from Frilensa's own PayPal account.
  useEffect(() => {
    if (!b || (method !== 'card' && method !== 'paypal') || !buttonRef.current) return;
    let cancelled = false;
    const el = buttonRef.current;
    el.innerHTML = '';
    loadPaypalSdk(b.paypalClientId, b.paypalCurrency).then(paypal => {
      if (cancelled) return;
      paypal.Buttons({
        fundingSource: method === 'card' ? paypal.FUNDING.CARD : paypal.FUNDING.PAYPAL,
        style: { layout: 'vertical', shape: 'rect', label: 'pay' },
        createOrder: () => startPaypalPayment(plan, cycle),
        onApprove: async (data: any) => {
          setBusy(true); setProblem(null);
          try { await finishPaypalPayment(data.orderID); setDone('paid'); onDone(); }
          catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
        },
        onError: () => setProblem('PayPal had a problem with this payment. Nothing was charged. Try again, or choose another way to pay.')
      }).render(el).catch(() => {});
    }).catch(err => setProblem(err.message));
    return () => { cancelled = true; el.innerHTML = ''; };
  }, [method, plan, cycle, b?.paypalClientId, b?.paypalCurrency]);

  const submitManual = async () => {
    if (!method || method === 'card' || method === 'paypal') return;
    setBusy(true); setProblem(null);
    try { await payManually(plan, cycle, method, reference.trim()); setDone('pending'); }
    catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-6">
        {done === 'paid' ? <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" /> : <Clock className="w-10 h-10 text-amber-500 mx-auto" />}
        <h3 className="text-lg font-black text-slate-900">{done === 'paid' ? `You're on ${p.name}` : 'Thanks, we’ll check your payment'}</h3>
        <p className="text-sm text-slate-600">
          {done === 'paid'
            ? `Paid until ${billing?.subscription?.paidUntil || 'the end of the period'}. A receipt is in your email.`
            : `Frilensa will confirm your ${p.name} plan once the payment arrives, usually within one working day. We'll email you.`}
        </p>
        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">Done</button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"><ArrowLeft className="w-3.5 h-3.5" /> Back to plans</button>
      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{p.name} · {cycle === 'annual' ? '1 year' : '1 month'}</p>
          <p className="text-[11px] text-slate-500">{renewing && billing?.subscription?.paidUntil ? `Adds to your current plan, paid until ${billing.subscription.paidUntil}.` : 'Starts today.'} Nothing renews by itself.</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-slate-900 font-mono">{fjd(amount)}</p>
          {(method === 'card' || method === 'paypal') && b && <p className="text-[10px] text-slate-500">Charged as {b.paypalCurrency} {paypalCharge(amount, b).toFixed(2)}</p>}
        </div>
      </div>

      {methods.length === 0 ? (
        <p className="text-sm text-slate-600 text-center">Online payment isn't set up yet. Contact Frilensa to upgrade.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="How would you like to pay?">
            {methods.map(m => (
              <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { setMethod(m); setProblem(null); }}
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${method === m ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                {m === 'card' ? <CreditCard className="w-4 h-4" /> : m === 'paypal' ? <Wallet className="w-4 h-4" /> : m === 'bank' ? <Building2 className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />} {LABEL[m]}
              </button>
            ))}
          </div>

          {(method === 'card' || method === 'paypal') && <div ref={buttonRef} className="min-h-[3rem]" aria-busy={busy} />}

          {method && method !== 'card' && method !== 'paypal' && b && (
            <div className="space-y-3">
              <div className="rounded-xl bg-white border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">Pay {fjd(amount)} to Frilensa</p>
                <p className="whitespace-pre-line font-mono text-[11px]">{method === 'bank' ? b.bankDetails : method === 'mpaisa' ? `M-PAiSA: ${b.mpaisa}` : `MyCash: ${b.mycash}`}</p>
                {b.instructions && <p className="text-slate-500 whitespace-pre-line">{b.instructions}</p>}
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference or transaction number
                <input value={reference} onChange={e => setReference(e.target.value)} maxLength={80} placeholder="e.g. MP12345678"
                  className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-normal normal-case tracking-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200" />
              </label>
              <button type="button" onClick={submitManual} disabled={busy || reference.trim().length < 3} className="w-full py-2.5 rounded-xl bg-sky-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                {busy ? 'Sending…' : "I've paid"}
              </button>
              <p className="text-[10px] text-slate-500 text-center">Your plan starts once Frilensa sees the payment, usually within one working day.</p>
            </div>
          )}
        </>
      )}
      {problem && <p className="text-xs font-semibold text-rose-600 text-center">{problem}</p>}
    </div>
  );
}
