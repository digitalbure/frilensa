import React, { useEffect, useState } from 'react';
import { Building2, Calendar, Edit3, Eye, EyeOff, ShieldCheck, Trash2, X } from 'lucide-react';
import type { CRMData } from '../types';

interface Listing {
  uid: string; businessId: string; name: string; category?: string; city?: string; directoryBio?: string; brandSlogan?: string;
  email?: string; phone?: string; startingRate?: number | null; rateUnit?: string; currency?: string; colorTheme?: string;
  listed?: boolean; isFrcsVerified?: boolean; updatedAt?: string;
}
interface Booking {
  id: string; bookingRef: string; businessName: string; serviceName: string; clientName: string; clientEmail: string;
  bookingDate: string; status: string; budgetEstimate?: number | null; createdAt?: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

/** Admin panel → Directory: every listed business and every directory booking, with edit and delete. */
export default function AdminDirectoryManager({ crmData, onUpdateCrmData, showToast }: {
  crmData: CRMData;
  onUpdateCrmData: (d: CRMData) => void;
  showToast: (msg: string) => void;
}) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/admin/directory').then(r => json<{ listings: Listing[]; bookings: Booking[] }>(r))
    .then(b => { setListings(b.listings); setBookings(b.bookings); setError(null); })
    .catch(err => setError(err.message));
  useEffect(() => { load(); }, []);

  const patch = async (l: Listing, body: Partial<Listing>, msg: string) => {
    try {
      const r = await json<{ listing: Listing }>(await fetch(`/api/admin/directory/listings/${encodeURIComponent(l.uid)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      setListings(ls => (ls || []).map(x => x.uid === l.uid ? r.listing : x));
      showToast(msg);
      return true;
    } catch (err: any) { showToast(err.message); return false; }
  };
  const removeListing = async (l: Listing) => {
    if (!confirm(`Delete "${l.name}" from the directory? The owner's own Frilensa account and business aren't affected.`)) return;
    try {
      await json(await fetch(`/api/admin/directory/listings/${encodeURIComponent(l.uid)}`, { method: 'DELETE' }));
      setListings(ls => (ls || []).filter(x => x.uid !== l.uid));
      showToast(`${l.name} removed from the directory.`);
    } catch (err: any) { showToast(err.message); }
  };
  const removeBooking = async (b: Booking) => {
    if (!confirm(`Delete booking ${b.bookingRef} (${b.clientName})? It's removed for both sides.`)) return;
    try {
      await json(await fetch(`/api/admin/directory/bookings/${encodeURIComponent(b.id)}`, { method: 'DELETE' }));
      setBookings(bs => (bs || []).filter(x => x.id !== b.id));
      showToast(`Booking ${b.bookingRef} deleted.`);
    } catch (err: any) { showToast(err.message); }
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const ok = await patch(editing, {
      name: editing.name, category: editing.category, city: editing.city, directoryBio: editing.directoryBio,
      brandSlogan: editing.brandSlogan, email: editing.email, phone: editing.phone, startingRate: editing.startingRate ?? null, rateUnit: editing.rateUnit
    }, `${editing.name} saved.`);
    setBusy(false);
    if (ok) setEditing(null);
  };

  const oldBiz = crmData.directoryBusinesses?.length || 0;
  const oldBookings = crmData.directoryBookings?.length || 0;
  const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 mt-1';

  return (
    <div className="space-y-5">
      {(oldBiz > 0 || oldBookings > 0) && (
        <div className="bg-amber-950/40 border border-amber-800 p-4 rounded-2xl text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p>
            Your workspace still holds {oldBiz} demo business{oldBiz === 1 ? '' : 'es'} and {oldBookings} demo booking{oldBookings === 1 ? '' : 's'} from an earlier version of Frilensa. They aren't in the real directory and nobody else sees them.
          </p>
          <button type="button" onClick={() => {
            if (!confirm('Remove the old demo businesses and bookings from your workspace?')) return;
            onUpdateCrmData({ ...crmData, directoryBusinesses: [], directoryBookings: [] });
            showToast('Old demo copies removed.');
          }} className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer">Remove demo copies</button>
        </div>
      )}

      {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl p-3">{error}</p>}

      {/* Listings */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Building2 className="w-4 h-4 text-sky-400" /> Listed businesses</h4>
            <p className="text-xs text-slate-400">Every business in the shared directory. Edit, hide, verify or delete a listing.</p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 font-mono px-3 py-1 rounded-lg border border-slate-700">{listings ? listings.length : '…'} businesses</span>
        </div>
        {listings && listings.length === 0 && <p className="text-xs text-slate-500">No businesses are listed yet.</p>}
        <div className="space-y-3">
          {(listings || []).map(l => {
            const isPublic = l.listed !== false;
            return (
              <div key={l.uid} className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.colorTheme || '#0284c7' }} />
                    <h5 className="font-bold text-slate-100 text-sm">{l.name}</h5>
                    {l.isFrcsVerified && <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] font-bold px-1.5 rounded flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verified</span>}
                    {!isPublic && <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-bold px-1.5 rounded">Hidden</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 text-[11px]">
                    {l.city && <span>{l.city}</span>}
                    {l.category && <span>Category: <strong className="text-slate-300">{l.category}</strong></span>}
                    {l.startingRate ? <span>From <strong className="font-mono text-slate-200">{l.currency || 'FJD'} ${l.startingRate}/{l.rateUnit || 'hr'}</strong></span> : null}
                    {l.email && <span>{l.email}</span>}
                  </div>
                  {l.directoryBio && <p className="text-slate-400 text-[10.5px] line-clamp-1 italic">"{l.directoryBio}"</p>}
                </div>
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button type="button" onClick={() => patch(l, { listed: !isPublic }, `${l.name} is now ${!isPublic ? 'public' : 'hidden'}.`)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border cursor-pointer ${isPublic ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                    {isPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {isPublic ? 'Public' : 'Hidden'}
                  </button>
                  <button type="button" title="Verified badge" aria-label="Toggle verified badge" onClick={() => patch(l, { isFrcsVerified: !l.isFrcsVerified }, `${l.name} ${!l.isFrcsVerified ? 'marked as verified' : 'no longer verified'}.`)}
                    className={`p-1.5 rounded-xl border cursor-pointer ${l.isFrcsVerified ? 'bg-sky-950 text-sky-300 border-sky-800' : 'bg-slate-800 text-slate-500 border-slate-700'}`}><ShieldCheck className="w-4 h-4" /></button>
                  <button type="button" title="Edit" aria-label={`Edit ${l.name}`} onClick={() => setEditing({ ...l })} className="p-1.5 rounded-xl border bg-slate-800 text-slate-300 border-slate-700 cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                  <button type="button" title="Delete" aria-label={`Delete ${l.name}`} onClick={() => removeListing(l)} className="p-1.5 rounded-xl border bg-rose-950 text-rose-300 border-rose-800 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bookings */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Calendar className="w-4 h-4 text-sky-400" /> Bookings</h4>
            <p className="text-xs text-slate-400">Every booking made through the directory.</p>
          </div>
          <span className="text-xs bg-sky-950 text-sky-300 font-mono font-bold px-2.5 py-1 rounded-lg border border-sky-800">{bookings ? bookings.length : '…'} bookings</span>
        </div>
        {bookings && bookings.length === 0 && <p className="text-xs text-slate-500">No directory bookings yet.</p>}
        <div className="space-y-2.5">
          {(bookings || []).map(b => (
            <div key={b.id} className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-950 px-1.5 rounded border border-sky-800">{b.bookingRef}</span>
                  <span className="font-bold text-slate-100">{b.serviceName}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-300 font-semibold">{b.businessName}</span>
                </div>
                <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3">
                  <span>Client: <strong className="text-slate-200">{b.clientName}</strong> ({b.clientEmail})</span>
                  <span>Date: <strong className="text-slate-200">{b.bookingDate}</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${b.status === 'accepted' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : b.status === 'declined' || b.status === 'cancelled' ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>{b.status}</span>
                <button type="button" title="Delete booking" aria-label={`Delete booking ${b.bookingRef}`} onClick={() => removeBooking(b)} className="p-1.5 rounded-xl border bg-rose-950 text-rose-300 border-rose-800 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={saveEdit} className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-3 text-xs text-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100">Edit listing</h4>
              <button type="button" onClick={() => setEditing(null)} className="p-1 text-slate-400 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <label className="block">Name<input required value={editing.name} maxLength={120} onChange={e => setEditing({ ...editing, name: e.target.value })} className={field} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">Category<input value={editing.category || ''} maxLength={80} onChange={e => setEditing({ ...editing, category: e.target.value })} className={field} /></label>
              <label className="block">City<input value={editing.city || ''} maxLength={80} onChange={e => setEditing({ ...editing, city: e.target.value })} className={field} /></label>
              <label className="block">Email<input type="email" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} className={field} /></label>
              <label className="block">Phone<input value={editing.phone || ''} maxLength={40} onChange={e => setEditing({ ...editing, phone: e.target.value })} className={field} /></label>
              <label className="block">Starting rate<input type="number" min={0} step="any" value={editing.startingRate ?? ''} onChange={e => setEditing({ ...editing, startingRate: e.target.value === '' ? null : Number(e.target.value) })} className={field} /></label>
              <label className="block">Per<input value={editing.rateUnit || ''} maxLength={30} placeholder="hr" onChange={e => setEditing({ ...editing, rateUnit: e.target.value })} className={field} /></label>
            </div>
            <label className="block">Tagline<input value={editing.brandSlogan || ''} maxLength={160} onChange={e => setEditing({ ...editing, brandSlogan: e.target.value })} className={field} /></label>
            <label className="block">About<textarea rows={4} value={editing.directoryBio || ''} maxLength={1500} onChange={e => setEditing({ ...editing, directoryBio: e.target.value })} className={field} /></label>
            <p className="text-[11px] text-slate-500">The owner can change these again from their own profile.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 rounded-xl text-slate-300 font-bold cursor-pointer">Cancel</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
