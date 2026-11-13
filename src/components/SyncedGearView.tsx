import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, PackageCheck, RefreshCw, Store, Trash2, Wrench } from 'lucide-react';
import type { CRMData } from '../types';
import { changedSinceLinked, gearTitle, listingStartFromGear, serviceFromGear, type SyncedGear } from '../lib/gearSync';
import { useModules } from './ModuleGuard';
import ListingForm, { draftFrom, bodyFrom, type ListingDraft } from './marketplace/ListingForm';
import { createListing, type MarketListing } from '../lib/marketplace';
import { trackAction } from '../lib/analytics';

// Services → Synced gear: gear another app (such as Packer Tools) keeps in sync through the API. Turn items
// into services for quotes, invoices and rate cards, or into marketplace listings, and update them when
// the gear changes in the other app.

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const listGear = () => fetch('/api/gear').then(r => json<{ gear: SyncedGear[] }>(r)).then(r => r.gear);
const linkGear = (id: string, links: { serviceId?: string; listingId?: string }) =>
  fetch(`/api/gear/${encodeURIComponent(id)}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(links) }).then(r => json<{ gear: SyncedGear }>(r)).then(r => r.gear);
const removeGear = (id: string) => fetch(`/api/gear/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => json(r));

const money = (n: number, cur: string) => `${cur} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<SyncedGear['status'], { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'bg-emerald-50 text-emerald-700' },
  checked_out: { label: 'Checked out', cls: 'bg-sky-50 text-sky-700' },
  maintenance: { label: 'In maintenance', cls: 'bg-amber-50 text-amber-800' },
  missing: { label: 'Missing', cls: 'bg-rose-50 text-rose-700' },
  retired: { label: 'Retired', cls: 'bg-zinc-100 text-zinc-600' }
};

export default function SyncedGearView({ data, onUpdateData }: { data: CRMData; onUpdateData: (d: CRMData) => void }) {
  const modules = useModules();
  const [gear, setGear] = useState<SyncedGear[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [listing, setListing] = useState<{ gear: SyncedGear; draft: ListingDraft; created: MarketListing | null } | null>(null);
  const [search, setSearch] = useState('');

  const load = () => listGear().then(setGear).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);
  const replace = (g: SyncedGear) => setGear(list => (list || []).map(x => x.id === g.id ? g : x));

  const services = data.services || [];
  const serviceOf = (g: SyncedGear) => g.links.serviceId ? services.find(s => s.id === g.links.serviceId) : undefined;
  const businessId = data.activeBusinessId || data.businesses[0]?.id;

  const shown = useMemo(() => (gear || []).filter(g => !search.trim() || `${g.name} ${g.brand} ${g.model} ${g.category}`.toLowerCase().includes(search.trim().toLowerCase())), [gear, search]);
  const unlinked = shown.filter(g => !g.removed && !serviceOf(g));

  /** Adds or updates services for these items in one save, then records the links. */
  const toServices = async (items: SyncedGear[]) => {
    setBusy('services'); setProblem(null);
    try {
      let list = [...services];
      const made: { g: SyncedGear; serviceId: string }[] = [];
      items.forEach((g, i) => {
        const existing = serviceOf(g);
        const svc = serviceFromGear(g, businessId, existing);
        if (!existing) svc.id = `svc-gear-${Date.now()}-${i}`;
        list = existing ? list.map(s => s.id === existing.id ? svc : s) : [svc, ...list];
        made.push({ g, serviceId: svc.id });
      });
      onUpdateData({ ...data, services: list });
      for (const m of made) replace(await linkGear(m.g.id, { serviceId: m.serviceId }));
      trackAction(items.length > 1 ? 'gear_to_services_bulk' : 'gear_to_service');
    } catch (err: any) { setProblem(err.message); } finally { setBusy(null); }
  };

  const startListing = (g: SyncedGear) => {
    const start = listingStartFromGear(g);
    const draft = { ...draftFrom(null, 'gear'), ...start, businessId: businessId || '' };
    setListing({ gear: g, draft, created: null });
  };
  const saveListing = async () => {
    if (!listing) return;
    setBusy('listing'); setProblem(null);
    try {
      const { listing: created } = await createListing(bodyFrom(listing.draft, false) as any);
      replace(await linkGear(listing.gear.id, { listingId: created.id }));
      trackAction('gear_to_listing');
      setListing({ ...listing, created, draft: draftFrom(created) });
    } catch (err: any) { setProblem(err.message); } finally { setBusy(null); }
  };

  const remove = async (g: SyncedGear) => {
    if (!confirm(`Remove "${g.name}" from Frilensa? Services and listings you made from it stay. If ${g.sourceName} still has it, it comes back on the next sync.`)) return;
    try { await removeGear(g.id); setGear(list => (list || []).filter(x => x.id !== g.id)); } catch (err: any) { setProblem(err.message); }
  };

  if (listing) {
    return (
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900">{listing.created ? 'Listing created' : `List "${gearTitle(listing.gear)}" on the marketplace`}</h3>
        </div>
        <p className="text-[11px] text-zinc-500 bg-zinc-50 rounded-xl p-2.5">
          {listing.created ? 'Add photos below. You can change anything later in Marketplace → My listings.' : `Filled in from ${listing.gear.sourceName}: the kit is listed as included items. Check the price, deposit and pick-up details.`}
        </p>
        <ListingForm draft={listing.draft} onChange={draft => setListing({ ...listing, draft })} listing={listing.created}
          onListingChange={l => setListing({ ...listing, created: l })} businesses={data.businesses.map(b => ({ id: b.id, name: b.name }))} />
        {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setListing(null); setProblem(null); }} className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-bold">{listing.created ? 'Done' : 'Cancel'}</button>
          {!listing.created && <button type="button" onClick={saveListing} disabled={busy === 'listing'} className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50">{busy === 'listing' ? 'Saving…' : 'Save and add photos'}</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="synced-gear">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2"><PackageCheck className="w-4 h-4 text-emerald-600" /> Synced gear</h3>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xl leading-relaxed">
              Gear kept in another app, such as Packer Tools, appears here. Turn it into services for quotes, invoices and your rate card, or list it on the marketplace. Your gear app stays in charge of the gear; Frilensa never changes it.
            </p>
          </div>
          <button onClick={() => { setGear(null); load(); }} className="text-xs font-bold border border-zinc-300 rounded-xl px-2.5 py-1 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        </div>
        {gear && gear.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <input aria-label="Search gear" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search gear" className="flex-1 min-w-[160px] bg-white border border-zinc-300 rounded-xl py-1.5 px-3 text-xs" />
            {unlinked.length > 1 && <button disabled={busy === 'services'} onClick={() => toServices(unlinked)} className="text-xs font-bold bg-zinc-900 text-white rounded-xl px-3 py-1.5 disabled:opacity-50">Add all {unlinked.length} as services</button>}
          </div>
        )}
        {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
      </div>

      {gear === null ? <p className="text-xs text-zinc-500 px-1">Loading…</p> : gear.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 text-xs text-zinc-600 space-y-1.5">
          <p className="font-bold text-zinc-900">Nothing synced yet</p>
          <p>In your gear app, connect Frilensa: sign in with Frilensa, or create an API key with draft access in Settings → API keys and paste it there. Your gear then appears here and stays up to date.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {shown.map(g => {
            const svc = serviceOf(g);
            const changed = changedSinceLinked(g);
            return (
              <div key={g.id} className={`bg-white border rounded-2xl p-3 space-y-2 ${g.removed ? 'border-zinc-200 opacity-70' : 'border-zinc-200'}`} data-testid={`gear-${g.externalId}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-xs font-bold text-zinc-900">{gearTitle(g)}{g.quantity > 1 ? <span className="text-zinc-400 font-normal"> × {g.quantity}</span> : ''}</p>
                    <p className="text-[10px] text-zinc-500">{[g.model, g.category, g.serialNumber && `S/N ${g.serialNumber}`].filter(Boolean).join(' · ')}</p>
                    <p className="text-[10px] text-zinc-500">{g.dayRate ? `${money(g.dayRate, g.currency)} a day` : 'No day rate'}{g.weekRate ? ` · ${money(g.weekRate, g.currency)} a week` : ''} · from {g.sourceName}</p>
                    {g.kit.length > 0 && <p className="text-[10px] text-zinc-500">Kit: {g.kit.map(k => k.quantity > 1 ? `${k.quantity} × ${k.name}` : k.name).join(', ')}</p>}
                    {g.unavailable.length > 0 && <p className="text-[10px] text-zinc-500">Booked: {g.unavailable.slice(0, 3).map(u => u.from === u.to ? u.from : `${u.from} to ${u.to}`).join(', ')}{g.unavailable.length > 3 ? ` and ${g.unavailable.length - 3} more` : ''}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {g.removed ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Removed in {g.sourceName}</span>
                      : <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>}
                    {changed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Changed in {g.sourceName}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!g.removed && (svc
                    ? <button disabled={busy === 'services'} onClick={() => toServices([g])} className={`text-[11px] font-bold rounded-lg px-2.5 py-1 flex items-center gap-1 ${changed ? 'bg-amber-600 text-white' : 'border border-zinc-300'}`}><Wrench className="w-3 h-3" /> Update service "{svc.name}"</button>
                    : <button disabled={busy === 'services'} onClick={() => toServices([g])} className="text-[11px] font-bold bg-zinc-900 text-white rounded-lg px-2.5 py-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> Add as service</button>)}
                  {!g.removed && modules.marketplace.enabled && (g.links.listingId
                    ? <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1"><Store className="w-3 h-3" /> Listed on the marketplace</span>
                    : <button onClick={() => startListing(g)} className="text-[11px] font-bold border border-zinc-300 rounded-lg px-2.5 py-1 flex items-center gap-1"><Store className="w-3 h-3" /> List on marketplace</button>)}
                  {g.externalUrl && <a href={g.externalUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-sky-700 flex items-center gap-1 px-1"><ExternalLink className="w-3 h-3" /> Open in {g.sourceName}</a>}
                  <button onClick={() => remove(g)} aria-label={`Remove ${g.name} from Frilensa`} className="ml-auto p-1.5 rounded-lg border border-zinc-200 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
