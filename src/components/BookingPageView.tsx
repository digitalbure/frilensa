import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Minus, Plus } from 'lucide-react';
import type { BookingQuestion } from '../lib/bookings';

// Public booking page at /book/<slug>, and the same page inside the website widget's overlay
// (?embed=1). Prices and answers are checked again on the server.

interface BookingForm {
  businessId: string;
  business: { name: string; brandSlogan: string; colorTheme: string; logoType?: string; logoUrl?: string; email: string; phone: string; address: string };
  currency: string;
  vatRate: number;
  terms: { text: string; paymentTermsDays: number; quoteValidDays: number };
  intro: string;
  afterMessage: string;
  services: { id: string; name: string; description: string; rate: number; unit: string; category: string; billingInterval: string; minQuantity: number; maxQuantity: number | null; vat: boolean }[];
  questions: (BookingQuestion & { help: string; required: boolean; options: string[]; appliesToServiceIds: string[] })[];
  availability?: { enabled: false } | { enabled: true; earliestDate: string; latestDate: string; unavailableDates: string[]; fullDates: string[]; leadDays: number };
  deposit?: { type: 'percent' | 'fixed'; value: number } | null;
}

interface BookingPageViewProps {
  slug: string;
  embed: boolean;
  /** Service to preselect (widget data-service). */
  service?: string | null;
  /** Page the widget is on, recorded with the booking. */
  host?: string | null;
}

const money = (currency: string, n: number) => `${currency} $${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INTERVAL: Record<string, string> = { monthly: ' / month', annual: ' / year' };

export default function BookingPageView({ slug, embed, service, host }: BookingPageViewProps) {
  const [form, setForm] = useState<BookingForm | null>(null);
  const [token, setToken] = useState('');
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [contact, setContact] = useState({ name: '', email: '', phone: '', company: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ ref: string; afterMessage: string } | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const [turnstileToken, setTurnstileToken] = useState('');

  useEffect(() => {
    fetch(`/api/public/book/${encodeURIComponent(slug)}`)
      .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'This booking page could not be loaded.'); return b; })
      .then(b => {
        setForm(b.form); setToken(b.formToken); setSiteKey(b.turnstileSiteKey);
        document.title = `Book ${b.form.business.name || ''}`.trim();
        const pre = b.form.services.find((s: any) => s.id === service);
        if (pre) setQty({ [pre.id]: pre.minQuantity });
      })
      .catch(err => setError(err.message));
  }, [slug]);

  // Cloudflare Turnstile, when the server has it set up.
  useEffect(() => {
    if (!siteKey || !turnstileRef.current) return;
    const render = () => (window as any).turnstile?.render(turnstileRef.current, { sitekey: siteKey, callback: (t: string) => setTurnstileToken(t) });
    if ((window as any).turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [siteKey, form]);

  const chosen = useMemo(() => (form?.services || []).filter(s => (qty[s.id] || 0) > 0), [form, qty]);
  const chosenIds = new Set(chosen.map(s => s.id));
  const visibleQuestions = (form?.questions || []).filter(q => !q.appliesToServiceIds.length || q.appliesToServiceIds.some(id => chosenIds.has(id)));
  const groups = useMemo(() => {
    const m = new Map<string, BookingForm['services']>();
    for (const s of form?.services || []) m.set(s.category || '', [...(m.get(s.category || '') || []), s]);
    return [...m.entries()];
  }, [form]);

  const shell = (children: React.ReactNode) => (
    <div className={embed ? 'min-h-screen bg-white font-sans antialiased' : 'min-h-screen bg-slate-100 py-6 px-4 font-sans antialiased'}>
      <div className={embed ? '' : 'max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'}>{children}</div>
    </div>
  );

  if (error) return shell(
    <div className="text-center py-12 space-y-3 px-4">
      <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
      <h1 className="text-base font-bold text-slate-900">Booking unavailable</h1>
      <p className="text-sm text-slate-500 max-w-sm mx-auto">{error}</p>
    </div>
  );
  if (!form) return shell(<p className="text-sm text-slate-500 text-center py-16">Loading…</p>);

  const { business, currency } = form;
  const brand = /^#[0-9a-fA-F]{3,8}$/.test(business.colorTheme) ? business.colorTheme : '#0f766e';
  const subtotal = chosen.reduce((s, x) => s + x.rate * qty[x.id], 0);
  const vat = form.vatRate ? chosen.filter(s => s.vat).reduce((s, x) => s + x.rate * qty[x.id], 0) * form.vatRate / 100 : 0;

  const avail = form.availability;
  const unavailable = new Set(avail?.enabled ? avail.unavailableDates : []);
  const full = new Set(avail?.enabled ? avail.fullDates : []);
  const dateWhy = (v: string | undefined) => !v || !avail?.enabled ? null
    : v < avail.earliestDate ? (avail.leadDays ? `Please book at least ${avail.leadDays} day${avail.leadDays === 1 ? '' : 's'} ahead.` : 'That date has passed.')
    : v > avail.latestDate ? 'Bookings open up to a year ahead.'
    : full.has(v) ? 'That date is fully booked. Please choose another.'
    : unavailable.has(v) ? "That date isn't available. Please choose another." : null;
  const dateBlocked = visibleQuestions.some(q => q.type === 'date' && dateWhy(answers[q.id]));

  const setQ = (s: BookingForm['services'][number], n: number) => {
    let v = Math.max(0, Math.round(n * 100) / 100);
    if (v > 0 && v < s.minQuantity) v = s.minQuantity;
    if (s.maxQuantity && v > s.maxQuantity) v = s.maxQuantity;
    setQty(q => ({ ...q, [s.id]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contact,
          items: chosen.map(s => ({ serviceId: s.id, quantity: qty[s.id] })),
          answers: visibleQuestions.filter(q => answers[q.id] !== undefined && answers[q.id] !== '').map(q => ({ questionId: q.id, value: answers[q.id] })),
          formToken: token, turnstileToken, embed, hostUrl: host || undefined
        })
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error || 'Your booking could not be sent. Try again.');
      setSent({ ref: b.ref, afterMessage: b.afterMessage || form.afterMessage });
      if (embed && host && window.parent !== window) {
        try { window.parent.postMessage({ type: 'frilensa:booking-sent', ref: b.ref, slug }, new URL(host).origin); } catch { /* host isn't a valid URL */ }
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-normal text-slate-900';
  const renderQuestion = (q: BookingForm['questions'][number]) => {
    const v = answers[q.id];
    const set = (x: any) => setAnswers(a => ({ ...a, [q.id]: x }));
    const lbl = <>{q.label}{q.required ? <span className="text-rose-600"> *</span> : <span className="font-normal text-slate-400"> (optional)</span>}</>;
    const help = q.help ? <span className="block text-[11px] font-normal text-slate-500">{q.help}</span> : null;
    switch (q.type) {
      case 'long_text': return <label key={q.id} className="block text-xs font-semibold text-slate-700">{lbl}{help}<textarea rows={3} required={q.required} maxLength={3000} value={v || ''} onChange={e => set(e.target.value)} className={field} /></label>;
      case 'number': return <label key={q.id} className="block text-xs font-semibold text-slate-700">{lbl}{help}<input type="number" step="any" inputMode="decimal" required={q.required} value={v ?? ''} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} className={field} /></label>;
      case 'date': {
        const why = dateWhy(v);
        return (
          <label key={q.id} className="block text-xs font-semibold text-slate-700">{lbl}{help}
            <input type="date" required={q.required} value={v || ''} min={avail?.enabled ? avail.earliestDate : undefined} max={avail?.enabled ? avail.latestDate : undefined}
              onChange={e => set(e.target.value)} aria-invalid={Boolean(why)} className={`${field} ${why ? 'border-rose-400' : ''}`} />
            {why && <span className="block text-[11px] font-normal text-rose-600 mt-1" role="alert">{why}</span>}
            {avail?.enabled && !why && avail.fullDates.length > 0 && <span className="block text-[11px] font-normal text-slate-500 mt-1">Some dates are already fully booked.</span>}
          </label>
        );
      }
      case 'time': return <label key={q.id} className="block text-xs font-semibold text-slate-700">{lbl}{help}<input type="time" required={q.required} value={v || ''} onChange={e => set(e.target.value)} className={field} /></label>;
      case 'single_choice': return <label key={q.id} className="block text-xs font-semibold text-slate-700">{lbl}{help}<select required={q.required} value={v || ''} onChange={e => set(e.target.value)} className={field}><option value="">Choose…</option>{q.options.map(o => <option key={o}>{o}</option>)}</select></label>;
      case 'multi_choice': return (
        <fieldset key={q.id} className="text-xs font-semibold text-slate-700"><legend>{lbl}</legend>{help}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-normal">
            {q.options.map(o => <label key={o} className="flex items-center gap-1.5"><input type="checkbox" checked={(v || []).includes(o)} onChange={e => set(e.target.checked ? [...(v || []), o] : (v || []).filter((x: string) => x !== o))} /> {o}</label>)}
          </div>
        </fieldset>
      );
      case 'yes_no': return (
        <fieldset key={q.id} className="text-xs font-semibold text-slate-700"><legend>{lbl}</legend>{help}
          <div className="flex gap-4 mt-1 font-normal">
            {[['Yes', true], ['No', false]].map(([t, b]) => <label key={String(t)} className="flex items-center gap-1.5"><input type="radio" name={q.id} required={q.required} checked={v === b} onChange={() => set(b)} /> {t as string}</label>)}
          </div>
        </fieldset>
      );
      default: return <label key={q.id} className="block text-xs font-semibold text-slate-700">{lbl}{help}<input required={q.required} maxLength={300} value={v || ''} onChange={e => set(e.target.value)} className={field} /></label>;
    }
  };

  if (sent) return shell(
    <div className="p-6 sm:p-8 space-y-3 text-center">
      <CheckCircle2 className="w-10 h-10 mx-auto" style={{ color: brand }} />
      <h1 className="text-lg font-bold text-slate-900">Booking request sent</h1>
      <p className="text-sm text-slate-600">{business.name || 'The business'} has your request ({sent.ref}).</p>
      {sent.afterMessage && <p className="text-sm text-slate-700 whitespace-pre-line">{sent.afterMessage}</p>}
      {embed && <button type="button" onClick={() => window.parent.postMessage({ type: 'frilensa:close' }, host ? new URL(host).origin : '*')} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 cursor-pointer">Close</button>}
    </div>
  );

  return shell(<>
    <div className="h-2" style={{ backgroundColor: brand }} />
    <form onSubmit={submit} className="p-5 sm:p-8 space-y-6">
      <div className="flex items-start gap-3 pr-8">
        {business.logoType === 'image' && business.logoUrl ? <img src={business.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain border border-slate-100" /> : null}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: brand }}>Book</p>
          <h1 className="text-lg font-bold text-slate-900">{business.name}</h1>
          {business.brandSlogan && <p className="text-xs text-slate-500">{business.brandSlogan}</p>}
        </div>
      </div>
      {form.intro && <p className="text-sm text-slate-700 whitespace-pre-line">{form.intro}</p>}

      {form.services.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-900">What would you like?</h2>
          {groups.map(([category, list]) => (
            <section key={category || 'general'} className="space-y-2">
              {category && <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</h3>}
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {list.map(s => {
                  const n = qty[s.id] || 0;
                  return (
                    <li key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                        {s.description && <p className="text-xs text-slate-500 whitespace-pre-line">{s.description}</p>}
                        <p className="text-xs font-mono text-slate-800 mt-1">
                          {money(currency, s.rate)}{s.unit ? ` per ${s.unit.toLowerCase()}` : ''}{INTERVAL[s.billingInterval] || ''}
                          {s.minQuantity > 1 && <span className="font-sans text-slate-500"> · minimum {s.minQuantity}</span>}
                          {s.maxQuantity && <span className="font-sans text-slate-500"> · up to {s.maxQuantity}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" aria-label={`Fewer ${s.name}`} disabled={n === 0} onClick={() => setQ(s, n - 1 < s.minQuantity ? 0 : n - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
                        <input type="number" min={0} step="any" inputMode="decimal" aria-label={`Quantity of ${s.name}`} value={n || ''} placeholder="0" onChange={e => setQ(s, Number(e.target.value) || 0)} className="w-16 text-center border border-slate-200 rounded-lg py-1.5 text-sm font-mono" />
                        <button type="button" aria-label={`More ${s.name}`} disabled={Boolean(s.maxQuantity && n >= s.maxQuantity)} onClick={() => setQ(s, n === 0 ? s.minQuantity : n + 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {chosen.length > 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs space-y-1">
              {chosen.map(s => <div key={s.id} className="flex justify-between gap-3"><span>{qty[s.id]} × {s.name}</span><span className="font-mono">{money(currency, s.rate * qty[s.id])}</span></div>)}
              {vat > 0 && <div className="flex justify-between gap-3 text-slate-500"><span>VAT ({form.vatRate}%)</span><span className="font-mono">{money(currency, vat)}</span></div>}
              <div className="flex justify-between gap-3 font-bold text-slate-900 border-t border-slate-200 pt-1"><span>Estimate</span><span className="font-mono">{money(currency, subtotal + vat)}</span></div>
              <p className="text-slate-500">This is an estimate. The quote you receive may differ.</p>
            </div>
          )}
        </div>
      )}

      {visibleQuestions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">About your booking</h2>
          {visibleQuestions.map(renderQuestion)}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Your details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">Your name <span className="text-rose-600">*</span><input required maxLength={120} autoComplete="name" value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} className={field} /></label>
          <label className="block text-xs font-semibold text-slate-700">Email <span className="text-rose-600">*</span><input required type="email" autoComplete="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} className={field} /></label>
          <label className="block text-xs font-semibold text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span><input type="tel" autoComplete="tel" maxLength={40} value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} className={field} /></label>
          <label className="block text-xs font-semibold text-slate-700">Organisation <span className="font-normal text-slate-400">(optional)</span><input maxLength={120} autoComplete="organization" value={contact.company} onChange={e => setContact({ ...contact, company: e.target.value })} className={field} /></label>
        </div>
        <label className="block text-xs font-semibold text-slate-700">Anything else? <span className="font-normal text-slate-400">(optional)</span><textarea rows={3} maxLength={3000} value={contact.message} onChange={e => setContact({ ...contact, message: e.target.value })} className={field} /></label>
        {/* Honeypot: hidden from people, filled in by bots. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={contact.website} onChange={e => setContact({ ...contact, website: e.target.value })} /></label>
        </div>
      </div>

      <section className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Terms</h2>
        <p>{form.vatRate > 0 ? `Prices exclude VAT (${form.vatRate}%).` : 'No VAT is charged.'} Quotes are valid for {form.terms.quoteValidDays} days. Invoices are due {form.terms.paymentTermsDays} days after issue.</p>
        {form.deposit && <p>A {form.deposit.type === 'percent' ? `${form.deposit.value}%` : money(currency, form.deposit.value)} deposit is asked for to confirm a booking.</p>}
        {form.terms.text && <p className="whitespace-pre-line">{form.terms.text}</p>}
      </section>

      {siteKey && <div ref={turnstileRef} />}
      {formError && <p className="text-xs text-rose-600" role="alert">{formError}</p>}
      <button type="submit" disabled={busy || dateBlocked || (Boolean(siteKey) && !turnstileToken)} className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-white text-sm font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: brand }}>
        {busy ? 'Sending…' : 'Send booking request'}
      </button>
      {!embed && <p className="text-[11px] text-slate-400">Bookings by Frilensa</p>}
    </form>
  </>);
}
