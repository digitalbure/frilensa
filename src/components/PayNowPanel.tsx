import React, { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Copy, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { capturePaypalOrder, createPaypalOrder, fetchPayOptions, loadPaypalSdk, type PayOptions, type PayTarget } from '../lib/payNowClient';
import { formatMoney } from '../lib/payNow';

type Method = 'bank' | 'mpaisa' | 'mycash' | 'card' | 'paypal';

interface PayNowPanelProps {
  target: PayTarget;
  brand: string;
  businessName: string;
  /** Reports a manual payment (bank, M-PAiSA, MyCash) for the business to confirm. */
  onReport: (method: string, reference: string) => Promise<void>;
  /** Called after a PayPal or card payment is captured. */
  onPaid: (receiptNumber: string | null) => void;
}

const LABEL: Record<Method, string> = {
  bank: 'Bank transfer', mpaisa: 'M-PAiSA', mycash: 'MyCash', card: 'Credit or debit card', paypal: 'PayPal'
};

/** "Pay now" on an invoice: pick a method, then pay by PayPal or card, or pay manually and report it. */
export default function PayNowPanel({ target, brand, businessName, onReport, onPaid }: PayNowPanelProps) {
  const [options, setOptions] = useState<PayOptions | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPayOptions(target).then(setOptions).catch(() => setOptions(null));
  }, [target.kind === 'public' ? target.token : target.documentId]);

  const methods: Method[] = options ? [
    ...(options.bank ? ['bank' as const] : []),
    ...(options.mpaisa ? ['mpaisa' as const] : []),
    ...(options.mycash ? ['mycash' as const] : []),
    ...(options.paypal?.card ? ['card' as const] : []),
    ...(options.paypal ? ['paypal' as const] : [])
  ] : [];

  // Render PayPal's button for the chosen funding source.
  useEffect(() => {
    if (!options?.paypal || (method !== 'card' && method !== 'paypal') || !buttonRef.current) return;
    let cancelled = false;
    const el = buttonRef.current;
    el.innerHTML = '';
    setError(null);
    loadPaypalSdk(options.paypal.clientId, options.paypal.currency).then(paypal => {
      if (cancelled) return;
      const buttons = paypal.Buttons({
        fundingSource: method === 'card' ? paypal.FUNDING.CARD : paypal.FUNDING.PAYPAL,
        style: { layout: 'vertical', shape: 'rect', label: 'pay' },
        createOrder: () => createPaypalOrder(target),
        onApprove: async (data: { orderID: string }) => {
          setBusy(true);
          try {
            const r = await capturePaypalOrder(target, data.orderID);
            onPaid(r.receiptNumber);
          } catch (err: any) {
            setError(err?.message || 'The payment could not be completed.');
          } finally {
            setBusy(false);
          }
        },
        onError: () => setError('PayPal had a problem. You have not been charged. Try again, or choose another way to pay.'),
        onCancel: () => setError(null)
      });
      if (!buttons.isEligible()) {
        setError(method === 'card' ? 'Card payments aren’t available here. Try PayPal instead.' : 'PayPal isn’t available here. Choose another way to pay.');
        return;
      }
      buttons.render(el).catch(() => {});
    }).catch((err: Error) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [method, options?.paypal?.clientId, options?.paypal?.currency]);

  if (!options || options.balance <= 0 || methods.length === 0) return null;

  const copyRef = async () => {
    try { await navigator.clipboard.writeText(options.reference); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const report = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method || !reference.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onReport(LABEL[method], reference.trim());
    } catch (err: any) {
      setError(err?.message || 'Couldn’t send that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const pp = options.paypal;
  const icon = (m: Method) => m === 'bank' ? <Building2 className="w-4 h-4" /> : m === 'card' ? <CreditCard className="w-4 h-4" /> : m === 'paypal' ? <Wallet className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />;

  return (
    <section className="border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Pay now</h2>
        <span className="text-xs font-mono text-slate-700">{formatMoney(options.currency, options.balance)}</span>
      </div>
      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {methods.map(m => (
          <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { setMethod(m); setError(null); }}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold text-left cursor-pointer ${method === m ? 'text-white border-transparent' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            style={method === m ? { backgroundColor: brand } : undefined}>
            {icon(m)} <span>{LABEL[m]}{m === 'card' ? <span className="block text-[10px] font-normal opacity-80">via PayPal</span> : null}</span>
          </button>
        ))}
      </div>

      {method && (method === 'bank' || method === 'mpaisa' || method === 'mycash') && (
        <form onSubmit={report} className="space-y-3 text-xs text-slate-700">
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            {method === 'bank' && <p className="whitespace-pre-line">{options.bank!.details}</p>}
            {method === 'mpaisa' && <p>Send to M-PAiSA <strong>{options.mpaisa!.number}</strong></p>}
            {method === 'mycash' && <p>Send to MyCash <strong>{options.mycash!.number}</strong></p>}
            <p>Amount: <strong>{formatMoney(options.currency, options.balance)}</strong></p>
            <p className="flex items-center gap-1.5">Use reference <strong>{options.reference}</strong>
              <button type="button" onClick={copyRef} className="text-slate-500 cursor-pointer" aria-label="Copy reference"><Copy className="w-3.5 h-3.5" /></button>
              {copied && <span className="text-emerald-700">Copied</span>}
            </p>
          </div>
          <p>When you've paid, tell {businessName || 'the business'} so they can confirm it.</p>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Your transaction reference
            <input required value={reference} onChange={e => setReference(e.target.value)} maxLength={120}
              className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 normal-case font-medium" />
          </label>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 cursor-pointer" style={{ backgroundColor: brand }}>
            {busy ? 'Sending…' : 'I’ve paid'}
          </button>
        </form>
      )}

      {method && (method === 'card' || method === 'paypal') && pp && (
        <div className="space-y-2 text-xs text-slate-700">
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            {pp.currency !== pp.invoiceCurrency && (
              <p>{formatMoney(pp.invoiceCurrency, pp.balance)} is charged as <strong>{formatMoney(pp.currency, pp.amount)}</strong> (1 {pp.currency} = {pp.rate.toFixed(4)} {pp.invoiceCurrency}).</p>
            )}
            {pp.surcharge > 0 && <p>Card and PayPal fee ({pp.surchargePercent}%): {formatMoney(pp.currency, pp.surcharge)}</p>}
            <p>You pay <strong>{formatMoney(pp.currency, pp.total)}</strong>{pp.surcharge > 0 || pp.currency !== pp.invoiceCurrency ? '' : ' to settle this invoice'}.</p>
            {pp.env === 'sandbox' && <p className="text-amber-700">Test mode: no real money is taken.</p>}
          </div>
          {busy && <p className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Confirming your payment…</p>}
          <div ref={buttonRef} className={busy ? 'hidden' : ''} />
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </section>
  );
}
