import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, Lock, X } from 'lucide-react';
import AvailabilityCalendar from './AvailabilityCalendar';
import { calendarApi, fjd, type CalendarRequest, type Hold, type MarketListing } from '../../lib/marketplace';
import { availableFor, hireLabels, usedByDay } from '../../lib/marketplaceRental';

const fijiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Fiji', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const range = (from: string, to: string) => from === to ? from : `${from} to ${to}`;

/**
 * A rental listing's calendar for its owner (or for admins, on agent listings): requests to confirm,
 * confirmed bookings, and dates blocked off. Confirming a request holds its dates.
 */
export default function ListingCalendar({ listing, admin = false, dark = false, onClose }: { listing: MarketListing; admin?: boolean; dark?: boolean; onClose: () => void }) {
  const api = useMemo(() => calendarApi(admin), [admin]);
  const [data, setData] = useState<{ quantity: number; holds: Hold[]; requests: CalendarRequest[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sel, setSel] = useState({ from: '', to: '' });
  const [blockQty, setBlockQty] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const today = fijiToday();

  const load = () => api.load(listing.id).then(d => { setData(d); setProblem(null); }).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, [listing.id]);

  const quantity = data?.quantity || 1;
  const available = useMemo(() => {
    const used = usedByDay(data?.holds || []);
    return Object.fromEntries(Object.entries(used).map(([d, n]) => [d, Math.max(0, quantity - n)]));
  }, [data, quantity]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await fn(); await load(); } catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };
  const block = () => run(async () => {
    await api.block(listing.id, sel.from, sel.to || sel.from, blockQty || quantity, note);
    setSel({ from: '', to: '' }); setNote(''); setBlockQty(0);
  });
  const confirm = (r: CalendarRequest) => run(() => api.confirm(listing.id, r.id));
  const release = (h: Hold) => {
    if (!window.confirm(h.kind === 'block' ? 'Unblock these dates?' : `Cancel ${h.name || 'this'} booking and free the dates? Let the renter know.`)) return;
    run(() => api.release(listing.id, h.id));
  };

  const t = dark
    ? { card: 'bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4', row: 'bg-slate-950 border border-slate-800', text: 'text-slate-100', muted: 'text-slate-400', input: 'bg-slate-950 border border-slate-800 text-slate-100', btn: 'bg-slate-800 text-slate-200' }
    : { card: 'bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 max-w-4xl', row: 'bg-slate-50 border border-slate-200', text: 'text-slate-900', muted: 'text-slate-500', input: 'bg-white border border-slate-200 text-slate-800', btn: 'bg-slate-100 text-slate-700' };
  const labels = hireLabels(listing.category);
  const open = (data?.requests || []).filter(r => !r.bookingId && r.rental.to >= today);
  const holds = (data?.holds || []).filter(h => h.to >= today);

  return (
    <div className={t.card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-black ${t.text}`}>Calendar: {listing.title}</h3>
          <p className={`text-[11px] ${t.muted}`}>{quantity > 1 ? `${quantity} units. ` : ''}Dates are held when you confirm a request or block them. Requests don't hold dates on their own.</p>
        </div>
        <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${t.btn}`}>Done</button>
      </div>
      {problem && <p className="text-xs font-semibold text-rose-500">{problem}</p>}
      {!data ? <p className={`text-xs ${t.muted}`}>Loading…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <AvailabilityCalendar today={today} quantity={quantity} available={available} from={sel.from} to={sel.to} onSelect={(from, to) => setSel({ from, to })} dark={dark} />
            {sel.from && (
              <div className={`rounded-xl p-2.5 space-y-2 ${t.row}`}>
                <p className={`text-xs font-bold ${t.text}`}>Block {range(sel.from, sel.to || sel.from)}</p>
                <div className="flex gap-2">
                  {quantity > 1 && (
                    <label className={`text-[11px] ${t.muted} flex items-center gap-1`}>Units
                      <input type="number" min={1} max={availableFor(quantity, data.holds, sel.from, sel.to || sel.from)} value={blockQty || availableFor(quantity, data.holds, sel.from, sel.to || sel.from)} onChange={e => setBlockQty(Number(e.target.value))} className={`w-14 rounded-lg py-1 px-2 text-xs ${t.input}`} />
                    </label>
                  )}
                  <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Note (only you see it), e.g. In for service" className={`flex-1 rounded-lg py-1 px-2 text-xs ${t.input}`} />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setSel({ from: '', to: '' })} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${t.btn}`}>Clear</button>
                  <button type="button" disabled={busy} onClick={block} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"><Lock className="w-3 h-3" /> Block dates</button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <section className="space-y-1.5">
              <h4 className={`text-[11px] font-black uppercase tracking-wider ${t.muted}`}>Requests to confirm ({open.length})</h4>
              {open.length === 0 ? <p className={`text-xs ${t.muted}`}>None waiting.</p> : open.map(r => {
                const free = availableFor(quantity, data.holds, r.rental.from, r.rental.to);
                return (
                  <div key={r.id} className={`rounded-xl p-2.5 text-xs space-y-1 ${t.row}`}>
                    <div className="flex justify-between gap-2">
                      <p className={`font-bold ${t.text}`}>{r.name}</p>
                      <p className={`font-mono font-bold ${t.text}`}>{fjd(r.estimate)}</p>
                    </div>
                    <p className={t.muted}>{range(r.rental.from, r.rental.to)}{r.rental.pickupTime ? ` · ${r.rental.pickupTime}–${r.rental.returnTime}` : ''} · {r.rental.quantity > 1 ? `${r.rental.quantity} units · ` : ''}{r.rental.hire === 'wet' ? labels.wet : labels.dry}</p>
                    <p className={t.muted}>{r.rental.pickup.name}{r.rental.pickup.kind === 'delivery' ? `: ${r.rental.pickup.address}` : ''}{r.rental.addOns.length ? ` · ${r.rental.addOns.map(a => `${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`).join(', ')}` : ''}</p>
                    {r.rental.deposit.amount > 0 && <p className="text-amber-600">{r.rental.deposit.label}: {fjd(r.rental.deposit.amount)}</p>}
                    {r.message && <p className={t.text}>"{r.message}"</p>}
                    <p className={t.muted}><a className="underline" href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ''}</p>
                    <div className="flex justify-end">
                      {free >= r.rental.quantity
                        ? <button type="button" disabled={busy} onClick={() => confirm(r)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"><Check className="w-3 h-3" /> Confirm and hold dates</button>
                        : <span className="text-[11px] font-semibold text-rose-500">Those dates are taken. Reply with other dates.</span>}
                    </div>
                  </div>
                );
              })}
              {!admin && <p className={`text-[10px] ${t.muted}`}>Requests also arrive in your inbox on Home, where you turn them into a quote or invoice.</p>}
            </section>

            <section className="space-y-1.5">
              <h4 className={`text-[11px] font-black uppercase tracking-wider ${t.muted}`}>Booked and blocked ({holds.length})</h4>
              {holds.length === 0 ? <p className={`text-xs ${t.muted}`}>Nothing coming up.</p> : holds.map(h => (
                <div key={h.id} className={`rounded-xl p-2.5 text-xs flex items-center justify-between gap-2 ${t.row}`}>
                  <div className="min-w-0">
                    <p className={`font-bold flex items-center gap-1 ${t.text}`}>{h.kind === 'booking' ? <CalendarCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}{range(h.from, h.to)}</p>
                    <p className={`truncate ${t.muted}`}>{h.kind === 'booking' ? `Booked by ${h.name || 'a renter'}` : h.note || 'Blocked'}{quantity > 1 ? ` · ${h.quantity} unit${h.quantity === 1 ? '' : 's'}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => release(h)} aria-label={h.kind === 'block' ? 'Unblock' : 'Cancel booking'} title={h.kind === 'block' ? 'Unblock' : 'Cancel booking'} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
