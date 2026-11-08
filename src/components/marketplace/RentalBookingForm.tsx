import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Send } from 'lucide-react';
import AvailabilityCalendar from './AvailabilityCalendar';
import { fetchAvailability, fjd, sendRequest, type Availability, type MarketListing } from '../../lib/marketplace';
import { DEFAULT_RENTAL, availableFor, hireLabels, quoteRental, type RentalRequest } from '../../lib/marketplaceRental';

/** Request to rent: dates on the availability calendar, times, hire type, add-ons, pick-up and return, with the price as you go. */
export default function RentalBookingForm({ listing: l, onSent }: { listing: MarketListing; onSent: () => void }) {
  const opts = l.rental || DEFAULT_RENTAL;
  const labels = hireLabels(l.category);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [req, setReq] = useState<RentalRequest>({
    from: '', to: '', pickupTime: opts.hours.open, returnTime: opts.hours.close, quantity: 1,
    hire: opts.hire.dry ? 'dry' : 'wet', addOns: {}, pickup: opts.places[0]?.id || (opts.delivery.offered ? 'delivery' : ''), returnTo: '', deliveryAddress: ''
  });
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<RentalRequest>) => setReq(r => ({ ...r, ...patch }));
  const input = 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200';
  const label = 'block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1';

  useEffect(() => { fetchAvailability(l.id).then(setAvail).catch(err => setLoadProblem(err.message)); }, [l.id]);
  const today = avail?.today || new Date().toISOString().slice(0, 10);

  const quote = useMemo(() => req.from ? quoteRental(l, req, today) : null, [l, req, today]);
  const freeUnits = useMemo(() => {
    if (!avail || !req.from) return opts.quantity;
    const holds = Object.entries(avail.available).map(([d, n]) => ({ from: d, to: d, quantity: avail.quantity - Number(n) }));
    return availableFor(avail.quantity, holds, req.from, req.to || req.from);
  }, [avail, req.from, req.to, opts.quantity]);
  const quantity = req.quantity || 1;
  const tooMany = req.from && quantity > freeUnits;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof quote === 'string') { setProblem(quote); return; }
    if (!quote) { setProblem('Choose your dates on the calendar.'); return; }
    if (tooMany) { setProblem(freeUnits ? `Only ${freeUnits} free on those dates.` : 'Those dates are booked out.'); return; }
    setBusy(true); setProblem(null);
    try {
      await sendRequest(l.id, { mode: 'rent', ...req, message, phone });
      onSent();
    } catch (err: any) {
      setProblem(err.message);
      fetchAvailability(l.id).then(setAvail).catch(() => {});
    } finally { setBusy(false); }
  };

  const stepper = (value: number, max: number, onSet: (n: number) => void, name: string) => (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Fewer ${name}`} onClick={() => onSet(Math.max(0, value - 1))} disabled={value <= 0} className="p-1 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"><Minus className="w-3 h-3" /></button>
      <span className="w-6 text-center text-xs font-bold" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${name}`} onClick={() => onSet(Math.min(max, value + 1))} disabled={value >= max} className="p-1 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"><Plus className="w-3 h-3" /></button>
    </div>
  );

  return (
    <form onSubmit={submit} className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
      <p className="text-sm font-bold text-slate-800">Request to rent</p>

      {loadProblem ? <p className="text-xs text-rose-600">{loadProblem}</p> : !avail ? <p className="text-xs text-slate-500">Loading availability…</p> : (
        <AvailabilityCalendar today={today} quantity={avail.quantity} available={avail.available} from={req.from} to={req.to}
          need={quantity} onSelect={(from, to) => { set({ from, to }); setProblem(null); }} />
      )}
      <p className="text-[11px] text-slate-600">
        {req.from ? <>Your dates: <strong>{req.from}{req.to && req.to !== req.from ? ` to ${req.to}` : ''}</strong>. Tap another day to change.</> : 'Tap your pick-up day, then your return day.'}
        {opts.minHire > 1 ? ` Minimum hire ${opts.minHire} ${l.rent?.unit}s.` : ''}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={label}>Pick-up time</span><input type="time" min={opts.hours.open} max={opts.hours.close} className={input} value={req.pickupTime} onChange={e => set({ pickupTime: e.target.value })} /></label>
        <label className="block"><span className={label}>Return time</span><input type="time" min={opts.hours.open} max={opts.hours.close} className={input} value={req.returnTime} onChange={e => set({ returnTime: e.target.value })} /></label>
      </div>
      <p className="text-[10px] text-slate-500 -mt-1.5">Between {opts.hours.open} and {opts.hours.close}.</p>

      {opts.quantity > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">How many {req.from ? <span className="text-slate-500 font-normal">({freeUnits} free)</span> : <span className="text-slate-500 font-normal">(up to {opts.quantity})</span>}</span>
          {stepper(quantity, Math.max(1, Math.min(opts.quantity, req.from ? freeUnits : opts.quantity)), n => set({ quantity: Math.max(1, n) }), 'units')}
        </div>
      )}

      {opts.hire.dry && opts.hire.wet && (
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Hire type">
          {(['dry', 'wet'] as const).map(h => (
            <button key={h} type="button" role="radio" aria-checked={req.hire === h} onClick={() => set({ hire: h })}
              className={`py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer ${req.hire === h ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>
              {h === 'dry' ? labels.dry : labels.wet}
              {h === 'wet' && opts.hire.wetRate > 0 && <span className="block font-normal opacity-80">+{fjd(opts.hire.wetRate)}/{l.rent?.unit}</span>}
            </button>
          ))}
        </div>
      )}
      {req.hire === 'wet' && opts.hire.wetNote && <p className="text-[11px] text-slate-600">{opts.hire.wetNote}</p>}

      {opts.addOns.length > 0 && (
        <div className="space-y-1.5">
          <span className={label}>Add-ons</span>
          {opts.addOns.map(a => {
            const n = req.addOns?.[a.id] || 0;
            return (
              <div key={a.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-slate-800 truncate">{a.name}</p>
                  <p className="text-[10px] text-slate-500">{a.price > 0 ? `${fjd(a.price)}${a.per === 'period' ? ` per ${l.rent?.unit}` : ''}` : 'Free'}</p>
                </div>
                {a.max > 1 ? stepper(n, a.max, v => set({ addOns: { ...req.addOns, [a.id]: v } }), a.name)
                  : <input type="checkbox" aria-label={`Add ${a.name}`} checked={n > 0} onChange={e => set({ addOns: { ...req.addOns, [a.id]: e.target.checked ? 1 : 0 } })} />}
              </div>
            );
          })}
        </div>
      )}

      {(opts.places.length > 0 || opts.delivery.offered) && (
        <div className="space-y-2">
          <label className="block"><span className={label}>Pick-up</span>
            <select className={input} value={req.pickup} onChange={e => set({ pickup: e.target.value })}>
              {opts.places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {opts.delivery.offered && <option value="delivery">Deliver to me{opts.delivery.fee > 0 ? ` (+${fjd(opts.delivery.fee)})` : ''}</option>}
            </select>
          </label>
          {req.pickup === 'delivery' ? (
            <>
              <label className="block"><span className={label}>Delivery address</span><input className={input} maxLength={200} value={req.deliveryAddress} onChange={e => set({ deliveryAddress: e.target.value })} required placeholder="Street, town" /></label>
              {opts.delivery.note && <p className="text-[10px] text-slate-500">{opts.delivery.note}</p>}
            </>
          ) : (
            <>
              {opts.places.find(p => p.id === req.pickup)?.address && <p className="text-[10px] text-slate-500 -mt-1">{opts.places.find(p => p.id === req.pickup)?.address}</p>}
              {opts.returnElsewhere && (
                <label className="block"><span className={label}>Return to</span>
                  <select className={input} value={req.returnTo || ''} onChange={e => set({ returnTo: e.target.value })}>
                    <option value="">Same place</option>
                    {opts.places.filter(p => p.id !== req.pickup).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      )}

      {quote && typeof quote !== 'string' && (
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs space-y-1" aria-live="polite">
          {quote.lines.map((x, i) => (
            <div key={i} className="flex justify-between gap-2"><span className="text-slate-600">{x.label}</span><span className="font-mono text-slate-800 shrink-0">{x.amount ? fjd(x.amount) : 'Free'}</span></div>
          ))}
          <div className="flex justify-between gap-2 pt-1 border-t border-slate-100 font-bold"><span>Estimated total</span><span className="font-mono">{fjd(quote.total)}</span></div>
          {quote.deposit.amount > 0 && (
            <div className="flex justify-between gap-2 text-amber-800"><span>{quote.deposit.label}</span><span className="font-mono">{fjd(quote.deposit.amount)}</span></div>
          )}
        </div>
      )}
      {quote && typeof quote === 'string' && <p className="text-xs font-semibold text-amber-700">{quote}</p>}

      <label className="block"><span className={label}>Message</span><textarea rows={2} className={`${input} resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder="What it’s for, licence or ID details, questions" /></label>
      <label className="block"><span className={label}>Phone (optional)</span><input className={input} value={phone} onChange={e => setPhone(e.target.value)} /></label>
      {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
      <button type="submit" disabled={busy || !avail} className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"><Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send request'}</button>
      <p className="text-[10px] text-slate-500">{l.managed ? 'Frilensa arranges this listing for the owner and will confirm with you.' : 'The owner confirms the dates and sends a quote or invoice. Your dates are held once they confirm.'}</p>
    </form>
  );
}
