import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, FileText, Link2, RefreshCw } from 'lucide-react';
import type { Business, CRMData } from '../types';
import { createRateCardLink, deleteRateCardLink, rateCardUrl } from '../lib/rateCards';
import { DEFAULT_INVOICE_TERMS, DEFAULT_QUOTE_TERMS } from '../lib/documentTerms';

interface RateCardSettingsProps {
  data: CRMData;
  onUpdateData: (data: CRMData) => void;
}

/** Shareable rate card link and default terms for the active business (Bookkeeping → Services). */
export default function RateCardSettings({ data, onUpdateData }: RateCardSettingsProps) {
  const business = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [terms, setTerms] = useState(() => termsOf(business));

  useEffect(() => { setTerms(termsOf(business)); }, [business?.id]);

  if (!business) return null;

  const update = (patch: Partial<Business>) => onUpdateData({
    ...data,
    businesses: data.businesses.map(b => b.id === business.id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b)
  });

  const flash = (text: string, ok = true) => {
    setNotice({ text, ok });
    setTimeout(() => setNotice(null), 4000);
  };

  const createLink = async () => {
    setBusy(true);
    try {
      const token = await createRateCardLink(business.id);
      update({ rateCardToken: token });
      flash(business.rateCardToken ? 'New link created. The old link no longer works.' : 'Your rate card link is ready to share.');
    } catch (err: any) {
      flash(err?.message || 'Couldn’t create the link. Try again.', false);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!business.rateCardToken || !confirm('Turn off the rate card? The link will stop working.')) return;
    setBusy(true);
    try {
      await deleteRateCardLink(business.rateCardToken);
      update({ rateCardToken: '' });
      flash('Rate card turned off.');
    } catch (err: any) {
      flash(err?.message || 'Couldn’t turn it off. Try again.', false);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(rateCardUrl(business.rateCardToken!));
      flash('Link copied.');
    } catch {
      flash('Couldn’t copy. Select the link and copy it.', false);
    }
  };

  const saveTerms = (e: React.FormEvent) => {
    e.preventDefault();
    update({
      paymentTermsDays: clampDays(terms.paymentTermsDays, 14),
      quoteValidDays: clampDays(terms.quoteValidDays, 30),
      invoiceTerms: terms.invoiceTerms.trim(),
      quoteTerms: terms.quoteTerms.trim()
    });
    flash('Terms saved. New quotes and invoices will use them.');
  };

  const listed = data.services.filter(s => s.isActive !== false && s.showOnRateCard !== false && (!s.businessId || s.businessId === business.id)).length;
  const input = 'w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs mt-1';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-zinc-700" />
          <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Rate card</h3>
        </div>
        <p className="text-xs text-zinc-600">
          A page with your services and rates for {business.name || 'this business'}. Clients can pick what they need and ask you for a quote. They can also print it or save it as a PDF.
        </p>
        {business.rateCardToken ? (
          <>
            <div className="flex items-center gap-2">
              <input readOnly value={rateCardUrl(business.rateCardToken)} onFocus={e => e.currentTarget.select()} className="flex-1 min-w-0 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-[11px] font-mono" aria-label="Rate card link" />
              <button type="button" onClick={copyLink} className="p-2 rounded-lg border border-zinc-200 text-zinc-700 cursor-pointer" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
              <a href={rateCardUrl(business.rateCardToken)} target="_blank" rel="noopener" className="p-2 rounded-lg border border-zinc-200 text-zinc-700" title="Open"><ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
            <p className="text-[11px] text-zinc-500">
              {listed === 1 ? '1 item is' : `${listed} items are`} on the card. Hide an item by editing it and unticking "Show on rate card".
            </p>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase">
              Introduction (optional)
              <textarea
                defaultValue={business.rateCardIntro || ''}
                key={business.id}
                onBlur={e => { if (e.target.value.trim() !== (business.rateCardIntro || '')) update({ rateCardIntro: e.target.value.trim() }); }}
                rows={2} maxLength={1000}
                placeholder="A line or two about what you do and how you work."
                className={`${input} normal-case font-normal`}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={createLink} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 text-[11px] font-bold cursor-pointer flex items-center gap-1 disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" /> New link
              </button>
              <button type="button" disabled={busy} onClick={turnOff} className="px-3 py-1.5 rounded-lg text-rose-600 text-[11px] font-bold cursor-pointer disabled:opacity-50">
                Turn off
              </button>
            </div>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={createLink} className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
            {busy ? 'Creating…' : 'Create rate card link'}
          </button>
        )}
        {notice && <p className={`text-[11px] ${notice.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{notice.text}</p>}
      </section>

      <form onSubmit={saveTerms} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-zinc-700" />
          <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Terms for {business.name || 'this business'}</h3>
        </div>
        <p className="text-xs text-zinc-600">Filled in on every new quote and invoice. You can still change them on each document.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase">
            Invoices due after (days)
            <input type="number" min={0} max={365} value={terms.paymentTermsDays} onChange={e => setTerms({ ...terms, paymentTermsDays: Number(e.target.value) })} className={input} />
          </label>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase">
            Quotes valid for (days)
            <input type="number" min={1} max={365} value={terms.quoteValidDays} onChange={e => setTerms({ ...terms, quoteValidDays: Number(e.target.value) })} className={input} />
          </label>
        </div>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase">
          Invoice terms and notes
          <textarea value={terms.invoiceTerms} onChange={e => setTerms({ ...terms, invoiceTerms: e.target.value })} rows={3} maxLength={3000} placeholder={DEFAULT_INVOICE_TERMS} className={`${input} normal-case font-normal`} />
        </label>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase">
          Quote terms and conditions
          <textarea value={terms.quoteTerms} onChange={e => setTerms({ ...terms, quoteTerms: e.target.value })} rows={3} maxLength={3000} placeholder={DEFAULT_QUOTE_TERMS(terms.quoteValidDays || 30)} className={`${input} normal-case font-normal`} />
        </label>
        <p className="text-[11px] text-zinc-500">Quote terms are also shown on your rate card.</p>
        <button type="submit" className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer">Save terms</button>
      </form>
    </div>
  );
}

function termsOf(b?: Business) {
  return {
    paymentTermsDays: b?.paymentTermsDays ?? 14,
    quoteValidDays: b?.quoteValidDays ?? 30,
    invoiceTerms: b?.invoiceTerms || '',
    quoteTerms: b?.quoteTerms || ''
  };
}

function clampDays(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? Math.min(365, Math.round(value)) : fallback;
}
