import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Eye, EyeOff, Handshake, ImagePlus, Plus, Tag, Trash2, X } from 'lucide-react';
import ListingCalendar from './ListingCalendar';
import ListingForm, { bodyFrom, draftFrom, type ListingDraft } from './ListingForm';
import { brandAdmin, fetchBrands, fjd, money, prepareLogo, priceLabel, type Brand, type MarketListing } from '../../lib/marketplace';
import { categoryName } from '../../lib/marketplaceTaxonomy';
import { quoteDetails, type RentalQuote } from '../../lib/marketplaceRental';

interface AgentRequest {
  id: string; listingId: string; listingTitle: string; providerName: string; mode: string;
  name: string; email: string; phone: string; message: string; from: string; to: string; quantity: number;
  estimate: number; offer: number | null; status: 'new' | 'contacted' | 'won' | 'lost';
  commissionPercent: number | null; commissionAmount: number | null; notes: string; createdAt: string;
  rental?: RentalQuote | null; marketplaceBookingId?: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const send = (url: string, method: string, body?: unknown) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

/** Admin panel → Marketplace: review, all listings, listings managed for providers, and their requests. */
export default function AdminMarketplaceView({ showToast }: { showToast: (msg: string) => void }) {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: ListingDraft; listing: MarketListing | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [calendarFor, setCalendarFor] = useState<MarketListing | null>(null);

  const load = () => fetch('/api/admin/marketplace').then(r => json<{ listings: MarketListing[]; requests: AgentRequest[] }>(r))
    .then(b => { setListings(b.listings); setRequests(b.requests); setProblem(null); }).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);
  const replace = (l: MarketListing) => {
    setListings(list => [l, ...list.filter(x => x.id !== l.id)]);
    setEditing(e => e && e.listing?.id === l.id ? { ...e, listing: l } : e);
  };

  const review = async (l: MarketListing, status: 'live' | 'hidden' | 'rejected') => {
    let rejectReason = '';
    if (status === 'rejected') {
      const reason = prompt('Why isn’t it approved? The seller sees this.', 'Please add clear photos and a price.');
      if (reason === null) return;
      rejectReason = reason;
    }
    try {
      replace((await json<{ listing: MarketListing }>(await send(`/api/admin/marketplace/listings/${l.id}`, 'PATCH', { status, rejectReason }))).listing);
      showToast(status === 'live' ? `"${l.title}" is live.` : status === 'hidden' ? 'Listing hidden.' : 'Listing not approved.');
    } catch (err: any) { showToast(err.message); }
  };
  const remove = async (l: MarketListing) => {
    if (!confirm(`Delete "${l.title}" for good?`)) return;
    try { await json(await send(`/api/admin/marketplace/listings/${l.id}`, 'DELETE')); setListings(list => list.filter(x => x.id !== l.id)); } catch (err: any) { showToast(err.message); }
  };
  const saveManaged = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = bodyFrom(editing.draft, true);
      const { listing } = editing.listing
        ? await json<{ listing: MarketListing }>(await send(`/api/admin/marketplace/listings/${editing.listing.id}`, 'PATCH', body))
        : await json<{ listing: MarketListing }>(await send('/api/admin/marketplace/listings', 'POST', body));
      replace(listing);
      setEditing({ draft: draftFrom(listing), listing });
      showToast('Saved. Add photos below.');
    } catch (err: any) { showToast(err.message); } finally { setBusy(false); }
  };
  const updateRequest = async (r: AgentRequest, patch: Partial<AgentRequest>) => {
    try {
      const { request } = await json<{ request: AgentRequest }>(await send(`/api/admin/marketplace/requests/${r.id}`, 'PATCH', patch));
      setRequests(list => list.map(x => x.id === r.id ? request : x));
    } catch (err: any) { showToast(err.message); }
  };

  const pending = listings.filter(l => l.status === 'pending');
  const needle = filter.trim().toLowerCase();
  const shown = listings.filter(l => !needle || `${l.title} ${l.providerName} ${l.city}`.toLowerCase().includes(needle));
  const earned = requests.reduce((s, r) => s + (r.status === 'won' ? r.commissionAmount || 0 : 0), 0);
  const card = 'bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3';
  const badge = (s?: string) => s === 'live' ? 'bg-emerald-500/15 text-emerald-300' : s === 'pending' ? 'bg-amber-500/15 text-amber-300' : s === 'rejected' ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-700 text-slate-300';

  if (calendarFor) return <ListingCalendar listing={calendarFor} admin dark onClose={() => setCalendarFor(null)} />;

  if (editing) {
    return (
      <div className={card}>
        <h3 className="text-sm font-bold text-slate-100">{editing.listing ? 'Edit listing for a provider' : 'List for a provider (Frilensa as agent)'}</h3>
        <p className="text-[11px] text-slate-400">The listing shows "Listed by Frilensa". Requests come to the admins, not the provider. Commission terms are only visible to admins.</p>
        <ListingForm draft={editing.draft} onChange={draft => setEditing({ ...editing, draft })} listing={editing.listing} onListingChange={replace} managed admin dark />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer">{editing.listing ? 'Done' : 'Cancel'}</button>
          <button type="button" onClick={saveManaged} disabled={busy} className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {problem && <p className="text-xs text-rose-300">{problem}</p>}

      <section className={card}>
        <h3 className="text-sm font-bold text-slate-100">Waiting for review ({pending.length})</h3>
        <p className="text-[11px] text-slate-400">A user's first listing waits here. Approving it also lets their next listings go live straight away.</p>
        {pending.length === 0 ? <p className="text-xs text-slate-500">Nothing to review.</p> : pending.map(l => (
          <div key={l.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            {l.photos[0] && <img src={l.photos[0].url} alt="" className="w-16 h-16 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-bold text-slate-100">{l.title}</p>
              <p className="text-slate-400">{l.providerName} · {categoryName(l.kind, l.category)} · {l.city || 'No town'} · {l.photos.length} photo{l.photos.length === 1 ? '' : 's'}</p>
              {l.description && <p className="text-slate-500 line-clamp-2 mt-0.5">{l.description}</p>}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button type="button" onClick={() => review(l, 'live')} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"><Check className="w-3.5 h-3.5" /> Approve</button>
              <button type="button" onClick={() => review(l, 'rejected')} className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"><X className="w-3.5 h-3.5" /> Reject</button>
            </div>
          </div>
        ))}
      </section>

      <section className={card}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Handshake className="w-4 h-4 text-amber-400" /> Agent requests</h3>
          <span className="text-[11px] text-slate-400">Commission earned: <strong className="text-emerald-300">{fjd(earned)}</strong></span>
        </div>
        {requests.length === 0 ? <p className="text-xs text-slate-500">No requests for agent listings yet.</p> : requests.map(r => (
          <div key={r.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-100">{r.listingTitle} <span className="text-slate-500 font-normal">for {r.providerName}</span></p>
                <p className="text-slate-400">{r.name} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ''} · {new Date(r.createdAt).toLocaleDateString()}</p>
                {r.rental
                  ? <div className="text-slate-400">{quoteDetails(r.rental, listings.find(l => l.id === r.listingId)?.category || '').map(d => <p key={d.label}>{d.label}: {d.value}</p>)}<p>Estimate {fjd(r.estimate)}{r.marketplaceBookingId ? ' · dates confirmed' : ' · open the listing calendar to confirm dates'}</p></div>
                  : <p className="text-slate-400">{r.from ? `${r.from}${r.to ? ` to ${r.to}` : ''} · ` : ''}{r.quantity} × · estimate {money((r as any).currency || 'FJD', r.estimate)}{(r as any).option ? ` · ${(r as any).option.label}` : ''}</p>}
                {r.message && <p className="text-slate-300 mt-1">"{r.message}"</p>}
              </div>
              <select aria-label="Status" value={r.status} onChange={e => updateRequest(r, { status: e.target.value as AgentRequest['status'] })} className="bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-[11px] text-slate-200 h-fit">
                <option value="new">New</option><option value="contacted">Contacted</option><option value="won">Won</option><option value="lost">Lost</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-slate-400 flex items-center gap-1.5">Commission (FJD)
                <input type="number" min={0} step="0.01" defaultValue={r.commissionAmount ?? ''} placeholder={r.commissionPercent != null ? `${r.commissionPercent}% ≈ ${fjd(r.estimate * r.commissionPercent / 100)}` : ''}
                  onBlur={e => { const v = e.target.value; if (String(r.commissionAmount ?? '') !== v) updateRequest(r, { commissionAmount: v === '' ? null : Number(v) }); }}
                  className="w-36 bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-[11px] text-slate-100" />
              </label>
              <input defaultValue={r.notes} placeholder="Notes" onBlur={e => { if (e.target.value !== r.notes) updateRequest(r, { notes: e.target.value }); }}
                className="flex-1 min-w-[10rem] bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-[11px] text-slate-100" />
            </div>
          </div>
        ))}
      </section>

      <BrandsManager showToast={showToast} />

      <section className={card}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-100">All listings ({listings.length})</h3>
          <div className="flex gap-2">
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search" className="bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100" />
            <button type="button" onClick={() => setEditing({ draft: draftFrom(null), listing: null })} className="px-3 py-1.5 rounded-xl bg-sky-500 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"><Plus className="w-3.5 h-3.5" /> List for a provider</button>
          </div>
        </div>
        {shown.map(l => (
          <div key={l.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-100 truncate">{l.title} <span className={`ml-1 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${badge(l.status)}`}>{l.status}</span>{l.managed && <span className="ml-1 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Agent{l.agent ? ` ${l.agent.commissionPercent}%` : ''}</span>}</p>
              <p className="text-slate-400 truncate">{l.providerName} · {categoryName(l.kind, l.category)} · {l.kind === 'gear' ? [l.forRent && priceLabel(l, 'rent'), l.forSale && priceLabel(l, 'buy')].filter(Boolean).join(' / ') : priceLabel(l, 'service')}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {l.managed && l.kind === 'gear' && l.forRent && <button type="button" onClick={() => setCalendarFor(l)} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer" aria-label="Calendar" title="Calendar and bookings"><CalendarDays className="w-3.5 h-3.5" /></button>}
              {l.managed && <button type="button" onClick={() => setEditing({ draft: draftFrom(l), listing: l })} className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-bold cursor-pointer">Edit</button>}
              {l.status === 'live'
                ? <button type="button" onClick={() => review(l, 'hidden')} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer" aria-label="Hide"><EyeOff className="w-3.5 h-3.5" /></button>
                : <button type="button" onClick={() => review(l, 'live')} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer" aria-label="Make live"><Eye className="w-3.5 h-3.5" /></button>}
              <button type="button" onClick={() => remove(l)} className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/10 cursor-pointer" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Brands with their logos, for listers to choose from. */
function BrandsManager({ showToast }: { showToast: (msg: string) => void }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const load = () => fetchBrands(true).then(setBrands).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);
  const pickLogo = async (file: File | undefined, then: (dataUrl: string) => void) => {
    if (!file) return;
    try { then(await prepareLogo(file)); } catch (err: any) { showToast(err.message); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try { await brandAdmin.create(name, logo || undefined); setName(''); setLogo(''); await load(); showToast('Brand added.'); }
    catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };
  const update = async (b: Brand, patch: Parameters<typeof brandAdmin.update>[1]) => {
    try { await brandAdmin.update(b.id, patch); await load(); showToast('Brand updated.'); } catch (err: any) { showToast(err.message); }
  };
  const remove = async (b: Brand) => {
    if (!confirm(`Remove ${b.name} from the list? Listings that use it keep the name as plain text.`)) return;
    try { await brandAdmin.remove(b.id); await load(); showToast('Brand removed.'); } catch (err: any) { showToast(err.message); }
  };
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Tag className="w-4 h-4 text-sky-400" /> Brands ({brands.length})</h3>
        <p className="text-[11px] text-slate-400">Listers pick a brand from this list (or type one under Other). The logo shows on listings and renters can filter by brand.</p>
      </div>
      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Brand name, e.g. Sony" aria-label="Brand name" className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100" />
        <label className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
          {logo ? <img src={logo} alt="" className="h-4 max-w-[3rem] object-contain bg-white rounded" /> : <ImagePlus className="w-3.5 h-3.5" />} {logo ? 'Change logo' : 'Logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => { pickLogo(e.target.files?.[0], setLogo); e.target.value = ''; }} />
        </label>
        <button type="submit" disabled={busy || !name.trim()} className="px-3 py-1.5 rounded-xl bg-sky-500 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add brand</button>
      </form>
      {problem && <p className="text-xs text-rose-300">{problem}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {brands.map(b => (
          <div key={b.id} className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex items-center gap-2">
            <div className="w-14 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
              {b.logoUrl ? <img src={b.logoUrl} alt="" className="max-h-8 max-w-[3.25rem] object-contain" /> : <span className="text-[9px] text-slate-400">No logo</span>}
            </div>
            <input defaultValue={b.name} aria-label={`Name of ${b.name}`} maxLength={60} onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.name) update(b, { name: v }); }}
              className="flex-1 min-w-0 bg-transparent text-xs font-bold text-slate-100 focus:outline-none focus:bg-slate-900 rounded px-1" />
            <label className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer" title="Upload logo" aria-label={`Upload logo for ${b.name}`}>
              <ImagePlus className="w-3.5 h-3.5" />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => { pickLogo(e.target.files?.[0], dataUrl => update(b, { logoDataUrl: dataUrl })); e.target.value = ''; }} />
            </label>
            {b.logoUrl && <button type="button" onClick={() => update(b, { removeLogo: true })} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer" title="Remove logo" aria-label={`Remove logo for ${b.name}`}><X className="w-3.5 h-3.5" /></button>}
            <button type="button" onClick={() => remove(b)} className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/10 cursor-pointer" aria-label={`Remove ${b.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
