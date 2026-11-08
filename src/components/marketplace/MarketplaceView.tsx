import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Camera, Check, ChevronLeft, ChevronRight, MapPin, Plus, Search, Send, ShieldCheck, Store, Truck, Wrench, X } from 'lucide-react';
import { INDUSTRIES, categoriesFor, categoryName, industryName, CONDITIONS } from '../../lib/marketplaceTaxonomy';
import { browseListings, fetchBrands, fjd, money, priceLabel, sendRequest, type Brand, type MarketListing } from '../../lib/marketplace';
import { hireLabels } from '../../lib/marketplaceRental';
import { partsLabel } from '../../lib/rateConditions';
import RentalBookingForm from './RentalBookingForm';
import MyListings from './MyListings';

type Tab = 'gear' | 'service' | 'mine';

/**
 * The marketplace: gear to rent or buy, and services. Public at /marketplace (browse; requests need an
 * account) and a tab in the app (browse, request, and manage your own listings).
 */
export default function MarketplaceView({ signedIn, businesses = [], onSignIn, onOpenDirectory }: {
  signedIn: boolean;
  businesses?: { id: string; name: string }[];
  onSignIn?: () => void;
  onOpenDirectory?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('gear');
  const [mode, setMode] = useState<'rent' | 'buy'>('rent');
  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [brand, setBrand] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => { fetchBrands().then(setBrands).catch(() => {}); }, []);
  const brandById = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands]);
  const [sort, setSort] = useState('newest');
  const [result, setResult] = useState<{ listings: MarketListing[]; total: number; cities: string[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<MarketListing | null>(null);
  const kind = tab === 'service' ? 'service' : 'gear';
  const viewMode = kind === 'gear' ? mode : 'service';

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (tab === 'mine') return;
    const t = setTimeout(() => {
      browseListings({ kind, mode: kind === 'gear' ? mode : '', q, industry, category, city, sort, brand: kind === 'gear' ? brand : '' })
        .then(r => { setResult(r); setProblem(null); }).catch(err => setProblem(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [tab, kind, mode, q, industry, category, city, sort, brand]);

  const cats = useMemo(() => categoriesFor(kind, industry || undefined), [kind, industry]);
  const select = 'bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200';
  const tabBtn = (t: Tab, label: string, Icon: React.ElementType) => (
    <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setCategory(''); }}
      className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200" role="tablist">
          {tabBtn('gear', 'Gear', Camera)}
          {tabBtn('service', 'Services', Wrench)}
          {signedIn && tabBtn('mine', 'My listings', Store)}
        </div>
        {tab === 'gear' && (
          <div className="flex bg-slate-900 p-1 rounded-xl self-start sm:self-auto" role="radiogroup" aria-label="Rent or buy">
            {(['rent', 'buy'] as const).map(m => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={`px-5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                {m === 'rent' ? 'Rent' : 'Buy'}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'mine' ? <MyListings businesses={businesses} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className={`relative ${kind === 'gear' && brands.length > 0 ? 'sm:col-span-2' : 'sm:col-span-4'}`}>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'gear' ? 'Search cameras, PA, drones…' : 'Search videographers, MCs, plumbers…'} aria-label="Search"
                className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200" />
            </div>
            <select aria-label="Industry" className={`${select} sm:col-span-3`} value={industry} onChange={e => { setIndustry(e.target.value); setCategory(''); }}>
              <option value="">All industries</option>
              {INDUSTRIES.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select aria-label="Category" className={`${select} sm:col-span-2`} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {cats.map(c => <option key={`${c.industryId}-${c.id}`} value={c.id}>{c.name}</option>)}
            </select>
            {kind === 'gear' && brands.length > 0 && (
              <select aria-label="Brand" className={`${select} sm:col-span-2`} value={brand} onChange={e => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <select aria-label="Location" className={`${select} sm:col-span-2`} value={city} onChange={e => setCity(e.target.value)}>
              <option value="">Anywhere</option>
              {(result?.cities || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Sort" className={`${select} sm:col-span-1`} value={sort} onChange={e => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
            </select>
          </div>

          {problem && <p className="text-xs text-rose-600">{problem}</p>}
          {tab === 'service' && onOpenDirectory && (
            <p className="text-[11px] text-slate-500">Looking for a business rather than a single service? <button type="button" onClick={onOpenDirectory} className="underline font-semibold cursor-pointer">Open the business directory</button>.</p>
          )}
          {result && (
            <p className="text-[11px] text-slate-500">
              {result.total} {kind === 'gear' ? (mode === 'rent' ? (result.total === 1 ? 'item to rent' : 'items to rent') : (result.total === 1 ? 'item for sale' : 'items for sale')) : (result.total === 1 ? 'service' : 'services')}
              {industry ? ` in ${industryName(industry)}` : ''}{category ? ` · ${categoryName(kind, category)}` : ''}{city ? ` · ${city}` : ''}
            </p>
          )}

          {result && result.listings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-bold text-slate-800">Nothing here yet</p>
              <p className="text-xs text-slate-500">{signedIn ? 'Be the first: list your gear or services under My listings.' : 'Check back soon, or sign up to list your own.'}</p>
              {signedIn && <button type="button" onClick={() => setTab('mine')} className="mt-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" /> List something</button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {(result?.listings || []).map(l => (
                <button key={l.id} type="button" onClick={() => setOpen(l)} className="text-left bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col">
                  <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center">
                    {l.photos[0] ? <img src={l.photos[0].url} alt="" loading="lazy" className="w-full h-full object-cover" /> : (l.kind === 'gear' ? <Camera className="w-8 h-8 text-slate-300" /> : <Wrench className="w-8 h-8 text-slate-300" />)}
                  </div>
                  <div className="p-3 space-y-1 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wide truncate">{categoryName(l.kind, l.category)}</p>
                      {l.brandId && brandById.get(l.brandId)?.logoUrl && <img src={brandById.get(l.brandId)!.logoUrl} alt={l.brand || ''} className="h-4 max-w-[3.5rem] object-contain shrink-0" />}
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{l.title}</p>
                    <p className="text-sm font-black text-slate-900 mt-auto pt-1">{priceLabel(l, viewMode)}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                      {l.city && <><MapPin className="w-3 h-3 shrink-0" />{l.city} · </>}
                      <span className="truncate">{l.providerName}</span>
                      {l.managed && <BadgeCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-label="Listed by Frilensa" />}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {open && <ListingDetail listing={open} mode={viewMode} signedIn={signedIn} onSignIn={onSignIn} onClose={() => setOpen(null)} brand={open.brandId ? brandById.get(open.brandId) : undefined} />}
    </div>
  );
}

function ListingDetail({ listing: l, mode, signedIn, onSignIn, onClose, brand }: {
  listing: MarketListing; mode: 'rent' | 'buy' | 'service'; signedIn: boolean; onSignIn?: () => void; onClose: () => void; brand?: Brand;
}) {
  const [photo, setPhoto] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [offer, setOffer] = useState(l.salePrice ? String(l.salePrice) : '');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [optionId, setOptionId] = useState(l.priceOptions?.[0]?.id || '');
  const option = l.priceOptions?.find(o => o.id === optionId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const input = 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200';
  const label = 'block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1';
  const unit = mode === 'rent' ? l.rent?.unit : l.price?.unit;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try {
      await sendRequest(l.id, { mode, from, to, quantity: Number(quantity), offer: Number(offer), message, phone, ...(option ? { optionId: option.id } : {}) });
      setSent(true);
    } catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={l.title} onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <div className="relative aspect-[16/9] bg-slate-100">
          {l.photos.length > 0 ? <img src={l.photos[photo].url} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center">{l.kind === 'gear' ? <Camera className="w-12 h-12 text-slate-300" /> : <Wrench className="w-12 h-12 text-slate-300" />}</div>}
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
          {l.photos.length > 1 && (
            <>
              <button type="button" aria-label="Previous photo" onClick={() => setPhoto((photo + l.photos.length - 1) % l.photos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" aria-label="Next photo" onClick={() => setPhoto((photo + 1) % l.photos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
            </>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-5">
          <div className="md:col-span-3 space-y-3">
            <p className="text-[11px] font-bold text-sky-700 uppercase tracking-wide">{industryName(l.industry)} · {categoryName(l.kind, l.category)}</p>
            <h2 className="text-xl font-black text-slate-900 leading-tight">{l.title}</h2>
            <p className="text-lg font-black text-slate-900">{priceLabel(l, mode)}</p>
            {l.kind === 'gear' && (
              <p className="text-xs text-slate-600">
                {[CONDITIONS.find(c => c.id === l.condition)?.name, l.brand, l.model].filter(Boolean).join(' · ')}
                {l.forRent && l.forSale ? ' · Also ' + (mode === 'rent' ? `for sale (${priceLabel(l, 'buy')})` : `for rent (${priceLabel(l, 'rent')})`) : ''}
              </p>
            )}
            <p className="text-xs text-slate-600 flex items-center gap-1">
              {l.city && <><MapPin className="w-3.5 h-3.5" /> {l.city} · </>}{l.providerName}
              {l.managed && <span className="inline-flex items-center gap-0.5 text-sky-700 font-bold"><BadgeCheck className="w-3.5 h-3.5" /> Listed by Frilensa</span>}
            </p>
            {brand?.logoUrl && <img src={brand.logoUrl} alt={brand.name} className="h-7 max-w-[8rem] object-contain" />}
            {l.description && <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{l.description}</p>}
            {mode === 'rent' && l.rental && <RentalFacts listing={l} />}
            {mode === 'service' && (l.priceOptions?.length || 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rates</p>
                {l.priceOptions!.map(o => (
                  <div key={o.id} className="flex justify-between gap-3 text-xs border-b border-slate-100 pb-1.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{o.label}</p>
                      {o.description && <p className="text-[11px] text-slate-500">{o.description}</p>}
                      {o.parts?.length ? <p className="text-[11px] text-slate-500">{partsLabel(o.parts, o.currency)}</p> : null}
                    </div>
                    <p className="font-bold text-slate-900 shrink-0">{money(o.currency, o.amount)}<span className="font-normal text-slate-500"> {l.price?.unit === 'job' ? 'per job' : l.price?.unit === 'session' ? 'per session' : `/${l.price?.unit}`}</span></p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            {sent ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 space-y-1">
                <p className="font-bold">Request sent</p>
                <p className="text-xs">{l.managed ? 'Frilensa will be in touch with you about it.' : `${l.providerName} will reply with a quote.`} You can see it under My listings → Requests I sent.</p>
              </div>
            ) : !signedIn ? (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-center">
                <p className="text-sm font-bold text-slate-800">{mode === 'rent' ? 'Want to rent this?' : mode === 'buy' ? 'Want to buy this?' : 'Want to book this?'}</p>
                <p className="text-xs text-slate-500">Sign in or create a free account to send a request.</p>
                {onSignIn
                  ? <button type="button" onClick={onSignIn} className="w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">Sign in or sign up</button>
                  : <a href="/?signup=1" className="block w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Sign in or sign up</a>}
              </div>
            ) : mode === 'rent' ? (
              <RentalBookingForm listing={l} onSent={() => setSent(true)} />
            ) : (
              <form onSubmit={submit} className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2.5">
                <p className="text-sm font-bold text-slate-800">{mode === 'buy' ? 'Make an offer' : 'Request a quote'}</p>
                {mode !== 'buy' && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className={label}>Date</span><input type="date" min={today} className={input} value={from} onChange={e => setFrom(e.target.value)} /></label>
                    <label className="block"><span className={label}>Until</span><input type="date" min={from || today} className={input} value={to} onChange={e => setTo(e.target.value)} /></label>
                  </div>
                )}
                {mode === 'service' && (l.priceOptions?.length || 0) > 0 && (
                  <div className="space-y-1" role="radiogroup" aria-label="Which rate fits your project?">
                    <span className={label}>Which fits your project?</span>
                    {l.priceOptions!.map(o => (
                      <label key={o.id} className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer text-xs ${optionId === o.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}>
                        <input type="radio" name="rate-option" checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="mt-0.5" />
                        <span className="min-w-0 flex-1"><span className="font-semibold text-slate-800">{o.label}</span>{o.description && <span className="block text-[10px] text-slate-500">{o.description}</span>}</span>
                        <span className="font-mono font-bold text-slate-800 shrink-0">{money(o.currency, o.amount)}</span>
                      </label>
                    ))}
                  </div>
                )}
                {mode === 'buy' ? (
                  <label className="block"><span className={label}>Your offer (FJD)</span><input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={offer} onChange={e => setOffer(e.target.value)} /></label>
                ) : (
                  <label className="block"><span className={label}>How many {unit === 'job' ? 'jobs' : unit ? `${unit}s` : 'units'}</span><input type="number" min={1} step={1} className={input} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
                )}
                <label className="block"><span className={label}>Message</span><textarea rows={3} className={`${input} resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder={mode === 'buy' ? 'Questions, collection' : 'What you need, where, your budget'} /></label>
                <label className="block"><span className={label}>Phone (optional)</span><input className={input} value={phone} onChange={e => setPhone(e.target.value)} /></label>
                {option && Number(quantity) > 0 && <p className="text-xs text-slate-700">Estimate: <strong>{money(option.currency, option.amount * Number(quantity))}</strong></p>}
                {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
                <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"><Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send request'}</button>
                <p className="text-[10px] text-slate-500">{l.managed ? 'Frilensa arranges this listing for the provider and will contact you.' : 'The owner replies with a quote. Payment is agreed between you.'}</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/** What a renter should know before booking: what's included, the deposit, hire type, pick-up and delivery. */
function RentalFacts({ listing: l }: { listing: MarketListing }) {
  const r = l.rental!;
  const labels = hireLabels(l.category);
  const unit = l.rent?.unit || 'day';
  return (
    <div className="space-y-2.5 text-xs text-slate-700">
      {r.included.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Included</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">{r.included.map((x, i) => <li key={i} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />{x}</li>)}</ul>
        </div>
      )}
      {r.addOns.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Add-ons</p>
          <ul className="space-y-0.5">{r.addOns.map(a => <li key={a.id} className="flex justify-between gap-2"><span>{a.name}</span><span className="font-semibold">{a.price > 0 ? `${fjd(a.price)}${a.per === 'period' ? `/${unit}` : ''}` : 'Free'}</span></li>)}</ul>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">{[r.hire.dry && labels.dry, r.hire.wet && labels.wet].filter(Boolean).join(' or ')}</span>
        {r.minHire > 1 && <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">Minimum {r.minHire} {unit}s</span>}
        {r.quantity > 1 && <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">{r.quantity} available</span>}
        <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">Pick-up {r.hours.open}–{r.hours.close}</span>
      </div>
      {r.deposit.kind !== 'none' && (
        <p className="flex items-start gap-1.5"><ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          {r.deposit.kind === 'bond' ? 'Refundable bond' : 'Deposit to confirm'}: <strong>{r.deposit.type === 'percent' ? `${r.deposit.amount}% of the booking` : fjd(r.deposit.amount)}</strong>
        </p>
      )}
      {(r.places.length > 0 || r.delivery.offered) && (
        <div className="space-y-0.5">
          {r.places.map(p => <p key={p.id} className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" /><span><strong>{p.name}</strong>{p.address ? ` · ${p.address}` : ''}</span></p>)}
          {r.delivery.offered && <p className="flex items-start gap-1.5"><Truck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" /><span>Delivery available{r.delivery.fee > 0 ? ` (${fjd(r.delivery.fee)})` : ''}{r.delivery.note ? ` · ${r.delivery.note}` : ''}</span></p>}
        </div>
      )}
    </div>
  );
}
