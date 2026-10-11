import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Minus, Plus, Printer } from 'lucide-react';
import { fetchPublicRateCard, sendQuoteRequest, type PublicRateCard } from '../lib/rateCards';

interface RateCardPublicViewProps {
  token: string;
}

const INTERVAL: Record<string, string> = { monthly: ' / month', annual: ' / year' };

function money(currency: string, value: number) {
  return `${currency} $${(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Public rate card at /?rates=<token>: a business's services and rates, and a quote request form. */
export default function RateCardPublicView({ token }: RateCardPublicViewProps) {
  const [card, setCard] = useState<PublicRateCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicRateCard(token)
      .then(c => { setCard(c); document.title = `${c.business.name || 'Rate card'} · Rates`; })
      .catch(err => setError(err?.message || 'This rate card could not be loaded.'));
  }, [token]);

  const groups = useMemo(() => {
    const map = new Map<string, PublicRateCard['services']>();
    for (const s of card?.services || []) {
      const key = s.category || '';
      map.set(key, [...(map.get(key) || []), s]);
    }
    return [...map.entries()];
  }, [card]);

  if (error) {
    return (
      <Shell>
        <div className="text-center py-12 space-y-3 px-4">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
          <h1 className="text-base font-bold text-slate-900">Rate card unavailable</h1>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">{error}</p>
        </div>
      </Shell>
    );
  }
  if (!card) return <Shell><p className="text-sm text-slate-500 text-center py-16">Loading rates…</p></Shell>;

  const { business, currency } = card;
  const brand = business.colorTheme || '#0284c7';
  const chosen = card.services.filter(s => (quantities[s.id] || 0) > 0);
  const subtotal = chosen.reduce((sum, s) => sum + s.rate * quantities[s.id], 0);
  const vat = card.vatRate ? chosen.filter(s => s.vat).reduce((sum, s) => sum + s.rate * quantities[s.id], 0) * card.vatRate / 100 : 0;

  const setQty = (id: string, qty: number) => setQuantities(q => ({ ...q, [id]: Math.max(0, Math.round(qty * 100) / 100) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (chosen.length === 0 && !form.message.trim()) {
      setFormError('Choose at least one service, or tell them what you need.');
      return;
    }
    setBusy(true);
    try {
      const res = await sendQuoteRequest(token, { ...form, items: chosen.map(s => ({ serviceId: s.id, quantity: quantities[s.id] })) });
      setSent(res.ref);
    } catch (err: any) {
      setFormError(err?.message || 'Your request could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="h-2" style={{ backgroundColor: brand }} />
      <div className="p-5 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {business.logoType === 'image' && business.logoUrl ? (
              <img src={business.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain border border-slate-100" />
            ) : null}
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-slate-900">{business.name}</h1>
              {business.brandSlogan && <p className="text-xs text-slate-500">{business.brandSlogan}</p>}
              <div className="text-xs text-slate-500 space-y-0.5">
                {business.address && <p>{business.address}</p>}
                {(business.email || business.phone) && <p>{[business.email, business.phone].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
          </div>
          <div className="sm:text-right space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: brand }}>Services and rates</p>
            <button type="button" onClick={() => window.print()} className="print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-50">
              <Printer className="w-3.5 h-3.5" /> Print or save as PDF
            </button>
          </div>
        </div>

        {card.intro && <p className="text-sm text-slate-700 whitespace-pre-line">{card.intro}</p>}

        {card.services.length === 0 ? (
          <p className="text-sm text-slate-500">No services are listed yet. Contact {business.name || 'the business'} for a quote.</p>
        ) : (
          <div className="space-y-5">
            {groups.map(([category, services]) => (
              <section key={category || 'general'} className="space-y-2">
                {category && <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</h2>}
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                  {services.map(s => {
                    const qty = quantities[s.id] || 0;
                    return (
                      <li key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 break-inside-avoid">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                          {s.description && <p className="text-xs text-slate-500 whitespace-pre-line">{s.description}</p>}
                          <p className="text-xs font-mono text-slate-800 mt-1">
                            {money(currency, s.rate)}{s.unit ? ` per ${s.unit.toLowerCase()}` : ''}{INTERVAL[s.billingInterval] || ''}
                            {s.minQuantity > 1 && <span className="font-sans text-slate-500"> · minimum {s.minQuantity}</span>}
                            {card.vatRate > 0 && !s.vat && <span className="font-sans text-slate-500"> · no VAT</span>}
                          </p>
                        </div>
                        <div className="print:hidden flex items-center gap-1.5 shrink-0">
                          <button type="button" aria-label={`Fewer ${s.name}`} onClick={() => setQty(s.id, qty - 1 < s.minQuantity ? 0 : qty - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer disabled:opacity-40" disabled={qty === 0}>
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number" min={0} step="any" inputMode="decimal" aria-label={`Quantity of ${s.name}`}
                            value={qty || ''} placeholder="0"
                            onChange={e => setQty(s.id, Number(e.target.value) || 0)}
                            className="w-16 text-center border border-slate-200 rounded-lg py-1.5 text-sm font-mono"
                          />
                          <button type="button" aria-label={`More ${s.name}`} onClick={() => setQty(s.id, qty === 0 ? s.minQuantity : qty + 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <section className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Terms</h2>
          <p>{card.vatRate > 0 ? `Rates exclude VAT (${card.vatRate}%) unless marked "no VAT".` : 'No VAT is charged.'} Quotes are valid for {card.terms.quoteValidDays} days. Invoices are due {card.terms.paymentTermsDays} days after issue.</p>
          {card.terms.text && <p className="whitespace-pre-line">{card.terms.text}</p>}
        </section>

        <section className="print:hidden border-t border-slate-100 pt-5 space-y-3">
          {sent ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 flex gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p>Request {sent} sent. {business.name || 'The business'} will reply to {form.email} with a quote.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Ask for a quote</h2>
              {chosen.length > 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs space-y-1">
                  {chosen.map(s => (
                    <div key={s.id} className="flex justify-between gap-3">
                      <span>{quantities[s.id]} × {s.name}</span>
                      <span className="font-mono">{money(currency, s.rate * quantities[s.id])}</span>
                    </div>
                  ))}
                  {vat > 0 && <div className="flex justify-between gap-3 text-slate-500"><span>VAT ({card.vatRate}%)</span><span className="font-mono">{money(currency, vat)}</span></div>}
                  <div className="flex justify-between gap-3 font-bold text-slate-900 border-t border-slate-200 pt-1">
                    <span>Estimate</span><span className="font-mono">{money(currency, subtotal + vat)}</span>
                  </div>
                  <p className="text-slate-500">This is an estimate. The quote you receive may differ.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Pick quantities above, or describe what you need below.</p>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label="Your name" required value={form.name} onChange={v => setForm({ ...form, name: v })} />
                <Field label="Email" type="email" required value={form.email} onChange={v => setForm({ ...form, email: v })} />
                <Field label="Phone (optional)" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
                <Field label="Company (optional)" value={form.company} onChange={v => setForm({ ...form, company: v })} />
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                What do you need? (optional)
                <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} maxLength={3000} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-normal" />
              </label>
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <button type="submit" disabled={busy} className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-white text-sm font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: brand }}>
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </form>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input type={type} required={required} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-normal" />
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 font-sans antialiased print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0">{children}</div>
    </div>
  );
}
