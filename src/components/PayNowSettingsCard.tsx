import React, { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import type { Business, CRMData } from '../types';
import { DEFAULT_PAYPAL_CURRENCY, PAYPAL_CHARGE_CURRENCIES, currencyName, homeRate, manualPayMethods } from '../lib/payNow';

interface PayNowSettingsCardProps {
  data: CRMData;
  onUpdateData: (data: CRMData) => void;
}

interface PaypalStatus { configured: boolean; connected: boolean; env: 'live' | 'sandbox' | null; clientId: string | null }

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

/** Settings → Pay now: which payment methods the active business offers, and its PayPal connection. */
export default function PayNowSettingsCard({ data, onUpdateData }: PayNowSettingsCardProps) {
  const business = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const [status, setStatus] = useState<PaypalStatus | null>(null);
  const [form, setForm] = useState({ clientId: '', secret: '', env: 'live' as 'live' | 'sandbox' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!business) return;
    setStatus(null);
    fetch(`/api/payments/paypal?businessId=${encodeURIComponent(business.id)}`).then(r => json<PaypalStatus>(r)).then(setStatus).catch(() => setStatus(null));
  }, [business?.id]);

  if (!business) return null;
  const pay = business.payNow || {};
  const manual = manualPayMethods(business);
  const home = data.userProfile.defaultCurrency || 'FJD';
  const chargeCurrency = pay.paypalCurrency && PAYPAL_CHARGE_CURRENCIES.includes(pay.paypalCurrency) ? pay.paypalCurrency : DEFAULT_PAYPAL_CURRENCY;

  const update = (patch: Partial<NonNullable<Business['payNow']>>) => onUpdateData({
    ...data,
    businesses: data.businesses.map(b => b.id === business.id ? { ...b, payNow: { ...(b.payNow || {}), ...patch }, updatedAt: new Date().toISOString() } : b)
  });
  const flash = (text: string, ok = true) => { setNotice({ text, ok }); setTimeout(() => setNotice(null), 5000); };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await json<PaypalStatus>(await fetch('/api/payments/paypal', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, ...form })
      }));
      setStatus(s => ({ ...(s || { configured: true }), ...r, connected: true }) as PaypalStatus);
      setForm({ clientId: '', secret: '', env: form.env });
      update({ paypal: true });
      flash('PayPal connected. Clients can now pay by PayPal or card.');
    } catch (err: any) {
      flash(err?.message || 'Couldn’t connect PayPal.', false);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect PayPal? Clients will no longer be able to pay by PayPal or card.')) return;
    setBusy(true);
    try {
      await json(await fetch(`/api/payments/paypal?businessId=${encodeURIComponent(business.id)}`, { method: 'DELETE' }));
      setStatus(s => s ? { ...s, connected: false, env: null, clientId: null } : s);
      update({ paypal: false });
      flash('PayPal disconnected.');
    } catch (err: any) {
      flash(err?.message || 'Couldn’t disconnect.', false);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void, hint: string, disabled = false) => (
    <label className={`flex items-start gap-2 text-xs ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="mt-0.5" />
      <span><span className="font-semibold text-slate-800">{label}</span><span className="block text-[11px] text-slate-500">{hint}</span></span>
    </label>
  );
  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs mt-1 normal-case font-normal';

  return (
    <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-sky-600" /> Pay now on invoices</h3>
        <p className="text-xs text-slate-500 mt-1">The payment methods clients see on {business.name || 'this business'}'s invoices, online and in the client portal.</p>
      </div>

      <div className="space-y-2.5">
        {toggle('Bank transfer', manual.bank, v => update({ bank: v }), business.bankDetails ? 'Shows your bank details. You confirm the payment when it arrives.' : 'Add your bank details to this business first.', !business.bankDetails)}
        {toggle('M-PAiSA', manual.mpaisa, v => update({ mpaisa: v }), business.mPaisaId ? `Shows ${business.mPaisaId}. You confirm the payment when it arrives.` : 'Add your M-PAiSA number to this business first.', !business.mPaisaId)}
        {toggle('MyCash', manual.mycash, v => update({ mycash: v }), business.myCashId ? `Shows ${business.myCashId}. You confirm the payment when it arrives.` : 'Add your MyCash number to this business first.', !business.myCashId)}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-bold text-slate-800">PayPal and card</p>
        <p className="text-[11px] text-slate-500">
          Payments go straight to your own PayPal business account and the invoice is marked paid automatically, with a receipt.
          Card payments run through PayPal, so clients don't need a PayPal account.
        </p>

        {status && !status.configured && <p className="text-[11px] text-amber-700">Online payments aren't set up on this server yet.</p>}

        {status?.connected ? (
          <div className="space-y-3">
            <p className="text-xs text-emerald-700 font-semibold">
              Connected{status.env === 'sandbox' ? ' in test mode (sandbox): no real money is taken' : ''}. App ID ending {status.clientId?.slice(-6)}.
            </p>
            {toggle('Offer PayPal', pay.paypal !== false, v => update({ paypal: v }), 'Clients can pay with their PayPal account.')}
            {toggle('Offer card payments', pay.paypal !== false && pay.paypalCard !== false, v => update({ paypalCard: v }), 'Shows a “Credit or debit card” option. PayPal decides where cards are available.', pay.paypal === false)}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Charge currency for {home} invoices
                <select value={chargeCurrency} onChange={e => update({ paypalCurrency: e.target.value })} className={input}>
                  {PAYPAL_CHARGE_CURRENCIES.map(c => <option key={c} value={c}>{c} ({currencyName(c)}){c === DEFAULT_PAYPAL_CURRENCY ? ', closest to FJD' : ''}</option>)}
                </select>
                <span className="block normal-case font-normal text-[11px] text-slate-500 mt-1">
                  PayPal doesn't take {home}. NZD is the default because it's closest in value to FJD. Clients are told the amount and currency before they pay. Invoices in {home} are converted at 1 {chargeCurrency} = {homeRate(chargeCurrency, business, home).toFixed(4)} {home}
                  {business.customExchangeRates?.[chargeCurrency] ? ' (your rate)' : ' (approximate; set your own rate in this business’s currency settings)'}. Invoices in USD, AUD, NZD and other PayPal currencies are charged as they are.
                </span>
              </label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Surcharge for PayPal and card (%)
                <input type="number" min={0} max={10} step={0.1} value={pay.surchargePercent ?? 0}
                  onChange={e => update({ surchargePercent: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} className={input} />
                <span className="block normal-case font-normal text-[11px] text-slate-500 mt-1">
                  0 means you absorb PayPal's fee. Otherwise clients see the surcharge before they pay. Check that surcharging is allowed where you and your clients are.
                </span>
              </label>
            </div>
            <button type="button" disabled={busy} onClick={disconnect} className="text-xs font-bold text-rose-600 cursor-pointer disabled:opacity-50">Disconnect PayPal</button>
          </div>
        ) : status?.configured ? (
          <form onSubmit={connect} className="space-y-3">
            <ol className="list-decimal pl-5 text-[11px] text-slate-600 space-y-1">
              <li>Sign in at <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noopener noreferrer" className="underline text-sky-700">developer.paypal.com</a> with your PayPal business account.</li>
              <li>Under <strong>Apps &amp; Credentials</strong>, choose <strong>Live</strong> and create an app (any name, for example “Frilensa”).</li>
              <li>Copy its <strong>Client ID</strong> and <strong>Secret</strong> into the boxes below.</li>
            </ol>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Client ID
                <input required value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} autoComplete="off" spellCheck={false} className={`${input} font-mono`} />
              </label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Secret
                <input required type="password" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} autoComplete="off" spellCheck={false} className={`${input} font-mono`} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={form.env === 'sandbox'} onChange={e => setForm({ ...form, env: e.target.checked ? 'sandbox' : 'live' })} />
              These are sandbox (test) keys
            </label>
            <p className="text-[11px] text-slate-500">The secret is checked with PayPal, then stored encrypted on Frilensa's server. It's never shown again or sent to your browser.</p>
            <button type="submit" disabled={busy} className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
              {busy ? 'Checking with PayPal…' : 'Connect PayPal'}
            </button>
          </form>
        ) : null}
        {notice && <p className={`text-[11px] ${notice.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{notice.text}</p>}
      </div>
    </section>
  );
}
