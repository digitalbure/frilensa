import React, { useEffect, useState } from 'react';
import { useModules } from '../ModuleGuard';
import { ImagePlus, X } from 'lucide-react';
import { CONDITIONS, INDUSTRIES, RENT_UNITS, SERVICE_UNITS, categoriesFor, type ListingKind } from '../../lib/marketplaceTaxonomy';
import { addPhoto, fetchBrands, preparePhoto, removePhoto, type Brand, type MarketListing } from '../../lib/marketplace';
import { DEFAULT_RENTAL, type RentalOptions } from '../../lib/marketplaceRental';
import RentalOptionsEditor from './RentalOptionsEditor';
import PriceOptionsEditor from './PriceOptionsEditor';
import type { PriceOption } from '../../lib/rateConditions';

export interface ListingDraft {
  kind: ListingKind; title: string; description: string; industry: string; category: string; city: string;
  forRent: boolean; rentAmount: string; rentUnit: string; forSale: boolean; salePrice: string;
  condition: string; brand: string; brandId: string; model: string;
  rental: RentalOptions;
  priceAmount: string; priceUnit: string; priceFrom: boolean;
  priceOptions: PriceOption[];
  businessId: string;
  providerName: string; agentName: string; agentEmail: string; agentPhone: string; commission: string; agentNotes: string;
}

export function draftFrom(l?: MarketListing | null, kind: ListingKind = 'gear'): ListingDraft {
  return {
    kind: l?.kind || kind, title: l?.title || '', description: l?.description || '', industry: l?.industry || '', category: l?.category || '', city: l?.city || '',
    forRent: l ? !!l.forRent : true, rentAmount: l?.rent ? String(l.rent.amount) : '', rentUnit: l?.rent?.unit || 'day',
    forSale: !!l?.forSale, salePrice: l?.salePrice ? String(l.salePrice) : '',
    condition: l?.condition || 'good', brand: l?.brand || '', brandId: l?.brandId || '', model: l?.model || '',
    rental: JSON.parse(JSON.stringify(l?.rental || DEFAULT_RENTAL)),
    priceAmount: l?.price ? String(l.price.amount) : '', priceUnit: l?.price?.unit || 'job', priceFrom: !!l?.price?.from,
    priceOptions: JSON.parse(JSON.stringify(l?.priceOptions || [])),
    businessId: '',
    providerName: l?.providerName && l.managed ? l.providerName : '', agentName: l?.agent?.contactName || '', agentEmail: l?.agent?.email || '',
    agentPhone: l?.agent?.phone || '', commission: String(l?.agent?.commissionPercent ?? 10), agentNotes: l?.agent?.notes || ''
  };
}

/** The request body for the server from a draft. */
export function bodyFrom(d: ListingDraft, managed: boolean) {
  return {
    kind: d.kind, title: d.title, description: d.description, industry: d.industry, category: d.category, city: d.city,
    ...(d.kind === 'gear'
      ? { forRent: d.forRent, rent: { amount: Number(d.rentAmount), unit: d.rentUnit }, forSale: d.forSale, salePrice: Number(d.salePrice), condition: d.condition, brandId: d.brandId, brand: d.brandId ? '' : d.brand, model: d.model, rental: d.rental }
      : { price: d.priceAmount || d.priceOptions.length ? { amount: Number(d.priceAmount) || 0, unit: d.priceUnit, from: d.priceFrom } : null, priceOptions: d.priceOptions }),
    ...(d.businessId ? { businessId: d.businessId } : {}),
    ...(managed ? { providerName: d.providerName, agent: { contactName: d.agentName, email: d.agentEmail, phone: d.agentPhone, commissionPercent: Number(d.commission), notes: d.agentNotes } } : {})
  };
}

const unitLabel = (u: string) => u === 'job' ? 'per job' : u === 'session' ? 'per session' : `per ${u}`;

/** Create or edit a listing. Photos can be added once the listing exists. */
export default function ListingForm({ draft, onChange, listing, onListingChange, managed = false, admin = false, businesses = [], dark = false }: {
  draft: ListingDraft;
  onChange: (d: ListingDraft) => void;
  listing?: MarketListing | null;
  onListingChange?: (l: MarketListing) => void;
  managed?: boolean;
  admin?: boolean;
  businesses?: { id: string; name: string }[];
  dark?: boolean;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const maxPhotos = useModules().marketplace.maxPhotos;
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => { fetchBrands().then(setBrands).catch(() => {}); }, []);
  // A listing whose brand isn't in the list (or was typed in before brands existed) shows as "Other".
  const otherBrand = !draft.brandId;
  const set = (patch: Partial<ListingDraft>) => onChange({ ...draft, ...patch });
  const cats = categoriesFor(draft.kind, draft.industry || undefined);
  const input = dark
    ? 'w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500'
    : 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200';
  const label = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`;
  const check = `flex items-center gap-1.5 text-xs font-semibold ${dark ? 'text-slate-200' : 'text-slate-700'}`;

  const upload = async (files: FileList | null) => {
    if (!files || !listing) return;
    setPhotoBusy(true); setPhotoProblem(null);
    try {
      let current = listing;
      for (const f of Array.from(files).slice(0, maxPhotos - listing.photos.length)) {
        current = (await addPhoto(current.id, await preparePhoto(f), admin)).listing;
        onListingChange?.(current);
      }
    } catch (err: any) { setPhotoProblem(err.message); } finally { setPhotoBusy(false); }
  };

  return (
    <div className="space-y-3">
      {!listing && (
        <div className="flex gap-2" role="radiogroup" aria-label="What are you listing?">
          {(['gear', 'service'] as const).map(k => (
            <button key={k} type="button" role="radio" aria-checked={draft.kind === k} onClick={() => set({ kind: k, category: '' })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${draft.kind === k ? 'bg-sky-600 text-white border-sky-600' : dark ? 'bg-slate-950 text-slate-300 border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
              {k === 'gear' ? 'Gear to rent or sell' : 'A service'}
            </button>
          ))}
        </div>
      )}

      {managed && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border ${dark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-200 bg-amber-50'}`}>
          <label className="block sm:col-span-2"><span className={label}>Provider (shown on the listing)</span><input className={input} value={draft.providerName} onChange={e => set({ providerName: e.target.value })} placeholder="e.g. Mere Vakaloloma" /></label>
          <label className="block"><span className={label}>Contact person</span><input className={input} value={draft.agentName} onChange={e => set({ agentName: e.target.value })} /></label>
          <label className="block"><span className={label}>Commission %</span><input type="number" min={0} max={100} step="any" className={input} value={draft.commission} onChange={e => set({ commission: e.target.value })} /></label>
          <label className="block"><span className={label}>Provider email</span><input type="email" className={input} value={draft.agentEmail} onChange={e => set({ agentEmail: e.target.value })} /></label>
          <label className="block"><span className={label}>Provider phone</span><input className={input} value={draft.agentPhone} onChange={e => set({ agentPhone: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className={label}>Notes (admins only)</span><input className={input} value={draft.agentNotes} onChange={e => set({ agentNotes: e.target.value })} placeholder="Agreement, availability, how they like to be contacted" /></label>
        </div>
      )}

      {!managed && !listing && businesses.length > 1 && (
        <label className="block"><span className={label}>Listed by</span>
          <select className={input} value={draft.businessId} onChange={e => set({ businessId: e.target.value })}>
            <option value="">Your active business</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}

      <label className="block"><span className={label}>Title</span>
        <input className={input} maxLength={100} value={draft.title} onChange={e => set({ title: e.target.value })} placeholder={draft.kind === 'gear' ? 'e.g. Sony FX3 cinema camera kit' : 'e.g. Wedding videography, full day'} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <label className="block"><span className={label}>Industry</span>
          <select className={input} value={draft.industry} onChange={e => set({ industry: e.target.value, category: '' })}>
            <option value="">Choose…</option>
            {INDUSTRIES.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Category</span>
          <select className={input} value={draft.category} onChange={e => set({ category: e.target.value })} disabled={!draft.industry}>
            <option value="">{draft.industry ? 'Choose…' : 'Choose an industry first'}</option>
            {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Town or city</span>
          <input className={input} maxLength={60} value={draft.city} onChange={e => set({ city: e.target.value })} placeholder="e.g. Suva" />
        </label>
      </div>

      {draft.kind === 'gear' ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className={`p-3 rounded-xl border ${dark ? 'border-slate-800' : 'border-slate-200'} space-y-2`}>
              <label className={check}><input type="checkbox" checked={draft.forRent} onChange={e => set({ forRent: e.target.checked })} /> For rent</label>
              {draft.forRent && (
                <div className="flex gap-2">
                  <input type="number" min={0} step="0.01" inputMode="decimal" aria-label="Rental price" className={input} value={draft.rentAmount} onChange={e => set({ rentAmount: e.target.value })} placeholder="FJD" />
                  <select aria-label="Rental period" className={input} value={draft.rentUnit} onChange={e => set({ rentUnit: e.target.value })}>
                    {RENT_UNITS.map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className={`p-3 rounded-xl border ${dark ? 'border-slate-800' : 'border-slate-200'} space-y-2`}>
              <label className={check}><input type="checkbox" checked={draft.forSale} onChange={e => set({ forSale: e.target.checked })} /> For sale</label>
              {draft.forSale && <input type="number" min={0} step="0.01" inputMode="decimal" aria-label="Sale price" className={input} value={draft.salePrice} onChange={e => set({ salePrice: e.target.value })} placeholder="Price in FJD" />}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="block"><span className={label}>Condition</span>
              <select className={input} value={draft.condition} onChange={e => set({ condition: e.target.value })}>{CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <div className="block space-y-1.5"><span className={label}>Brand</span>
              <select aria-label="Brand" className={input} value={draft.brandId || ''} onChange={e => { const b = brands.find(x => x.id === e.target.value); set({ brandId: e.target.value, brand: b ? b.name : '' }); }}>
                <option value="">{brands.length ? 'Other or no brand' : 'No brands listed yet'}</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {otherBrand && <input aria-label="Brand name" className={input} maxLength={60} value={draft.brand} onChange={e => set({ brand: e.target.value })} placeholder="Type the brand (optional)" />}
            </div>
            <label className="block"><span className={label}>Model</span><input className={input} maxLength={60} value={draft.model} onChange={e => set({ model: e.target.value })} /></label>
          </div>
          {draft.forRent && <RentalOptionsEditor value={draft.rental} onChange={rental => set({ rental })} category={draft.category} unit={draft.rentUnit} dark={dark} />}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
          <label className="block"><span className={label}>Price (optional)</span><input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={draft.priceAmount} onChange={e => set({ priceAmount: e.target.value })} placeholder="FJD, or leave empty to quote" /></label>
          <label className="block"><span className={label}>Per</span>
            <select className={input} value={draft.priceUnit} onChange={e => set({ priceUnit: e.target.value })}>{SERVICE_UNITS.map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}</select>
          </label>
          <label className={`${check} pb-2`}><input type="checkbox" checked={draft.priceFrom} onChange={e => set({ priceFrom: e.target.checked })} /> Starting price ("from")</label>
          <div className="sm:col-span-3">
            <PriceOptionsEditor value={draft.priceOptions} onChange={priceOptions => set({ priceOptions })} unit={draft.priceUnit} dark={dark} />
          </div>
        </div>
      )}

      <label className="block"><span className={label}>Description</span>
        <textarea rows={4} maxLength={3000} className={`${input} resize-y`} value={draft.description} onChange={e => set({ description: e.target.value })}
          placeholder={draft.kind === 'gear' ? "What's included, accessories, pick-up and delivery, bond or ID needed" : 'What you offer, experience, what the price includes, areas you cover'} />
      </label>

      {listing ? (
        <div className="space-y-2">
          <span className={label}>Photos ({listing.photos.length}/{maxPhotos})</span>
          <div className="flex flex-wrap gap-2">
            {listing.photos.map(p => (
              <div key={p.id} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                {!admin && (
                  <button type="button" aria-label="Remove photo" onClick={async () => { try { onListingChange?.((await removePhoto(listing.id, p.id)).listing); } catch (err: any) { setPhotoProblem(err.message); } }}
                    className="absolute top-1 right-1 p-0.5 rounded bg-white/90 text-rose-600 cursor-pointer"><X className="w-3 h-3" /></button>
                )}
              </div>
            ))}
            {listing.photos.length < maxPhotos && (
              <label className={`w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-[10px] font-bold cursor-pointer ${dark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`}>
                <ImagePlus className="w-5 h-5" />{photoBusy ? 'Uploading…' : 'Add'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={photoBusy} onChange={e => { upload(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
          {photoProblem && <p className="text-[11px] text-rose-600">{photoProblem}</p>}
        </div>
      ) : (
        <p className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-500'}`}>You can add up to {maxPhotos} photos after saving.</p>
      )}
    </div>
  );
}

