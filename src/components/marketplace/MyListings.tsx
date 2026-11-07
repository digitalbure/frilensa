import React, { useEffect, useState } from 'react';
import { Camera, Eye, EyeOff, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import ListingForm, { bodyFrom, draftFrom, type ListingDraft } from './ListingForm';
import { createListing, deleteListing, myMarketplace, priceLabel, updateListing, fjd, type MarketListing, type SentRequest } from '../../lib/marketplace';
import { categoryName } from '../../lib/marketplaceTaxonomy';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Waiting for review', cls: 'bg-amber-100 text-amber-800' },
  live: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800' },
  hidden: { label: 'Hidden', cls: 'bg-slate-200 text-slate-700' },
  rejected: { label: 'Not approved', cls: 'bg-rose-100 text-rose-800' }
};

/** Marketplace → My listings: your listings (create, edit, photos, hide, delete) and the requests you sent. */
export default function MyListings({ businesses }: { businesses: { id: string; name: string }[] }) {
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [sent, setSent] = useState<SentRequest[]>([]);
  const [trusted, setTrusted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: ListingDraft; listing: MarketListing | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => myMarketplace().then(r => { setListings(r.listings); setSent(r.sent); setTrusted(r.trusted); }).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);
  const replace = (l: MarketListing) => {
    setListings(list => [l, ...(list || []).filter(x => x.id !== l.id)]);
    setEditing(e => e && e.listing?.id === l.id ? { ...e, listing: l } : e);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true); setProblem(null);
    try {
      const body = bodyFrom(editing.draft, false);
      const { listing } = editing.listing ? await updateListing(editing.listing.id, body) : await createListing(body as any);
      replace(listing);
      // New listings stay open so photos can be added.
      setEditing({ draft: draftFrom(listing), listing });
    } catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };
  const setVisible = async (l: MarketListing, visible: boolean) => {
    try { replace((await updateListing(l.id, { status: visible ? 'live' : 'hidden' })).listing); } catch (err: any) { setProblem(err.message); }
  };
  const resubmit = async (l: MarketListing) => {
    try { replace((await updateListing(l.id, { resubmit: true })).listing); } catch (err: any) { setProblem(err.message); }
  };
  const remove = async (l: MarketListing) => {
    if (!confirm(`Delete "${l.title}"? Requests you already received stay in your inbox.`)) return;
    try { await deleteListing(l.id); setListings(list => (list || []).filter(x => x.id !== l.id)); if (editing?.listing?.id === l.id) setEditing(null); } catch (err: any) { setProblem(err.message); }
  };

  if (editing) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">{editing.listing ? 'Edit listing' : 'New listing'}</h3>
          {editing.listing?.status && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[editing.listing.status].cls}`}>{STATUS[editing.listing.status].label}</span>}
        </div>
        {!editing.listing && !trusted && <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-2.5">Your first listing is checked by Frilensa before it goes live, usually within a day. After that, your listings go live straight away.</p>}
        <ListingForm draft={editing.draft} onChange={draft => setEditing({ ...editing, draft })} listing={editing.listing} onListingChange={replace} businesses={businesses} />
        {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setEditing(null); setProblem(null); }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer">{editing.listing ? 'Done' : 'Cancel'}</button>
          <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{busy ? 'Saving…' : editing.listing ? 'Save changes' : 'Save and add photos'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {problem && <p className="text-xs text-rose-600">{problem}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Requests for your listings arrive in your inbox on Home, where you can turn them into a quote.</p>
        <button type="button" onClick={() => setEditing({ draft: draftFrom(null), listing: null })} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"><Plus className="w-3.5 h-3.5" /> New listing</button>
      </div>

      {listings && listings.length === 0 && <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl p-5 text-center">You haven't listed anything yet.</p>}
      <div className="space-y-2">
        {(listings || []).map(l => (
          <div key={l.id} className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
              {l.photos[0] ? <img src={l.photos[0].url} alt="" className="w-full h-full object-cover" /> : l.kind === 'gear' ? <Camera className="w-6 h-6 text-slate-300" /> : <Wrench className="w-6 h-6 text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900 truncate">{l.title}</span>
                {l.status && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>}
              </div>
              <p className="text-[11px] text-slate-500">{categoryName(l.kind, l.category)} · {l.kind === 'gear' ? [l.forRent && priceLabel(l, 'rent'), l.forSale && `${priceLabel(l, 'buy')} to buy`].filter(Boolean).join(' · ') : priceLabel(l, 'service')}</p>
              {l.status === 'rejected' && <p className="text-[11px] text-rose-700">{l.rejectReason || 'Not approved.'} Edit it, then <button type="button" onClick={() => resubmit(l)} className="underline font-bold cursor-pointer">send for review again</button>.</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              {(l.status === 'live' || l.status === 'hidden') && (
                <button type="button" onClick={() => setVisible(l, l.status === 'hidden')} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label={l.status === 'hidden' ? 'Show listing' : 'Hide listing'} title={l.status === 'hidden' ? 'Show' : 'Hide'}>
                  {l.status === 'hidden' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              )}
              <button type="button" onClick={() => setEditing({ draft: draftFrom(l), listing: l })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label={`Edit ${l.title}`}><Pencil className="w-4 h-4" /></button>
              <button type="button" onClick={() => remove(l)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer" aria-label={`Delete ${l.title}`}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Requests I sent</h3>
        {sent.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : sent.map(r => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">{r.title}</p>
              <p className="text-[11px] text-slate-500">{r.mode === 'buy' ? 'Offer' : r.mode === 'rent' ? 'Rental' : 'Booking'} · {r.providerName} · {new Date(r.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono font-bold text-slate-800">{fjd(r.estimate || 0)}</p>
              <p className="text-[10px] text-slate-500 capitalize">{String(r.status || 'new').replace(/_/g, ' ')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
