import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MAX_ADDONS, MAX_INCLUDED, MAX_PLACES, hireLabels, type RentalOptions } from '../../lib/marketplaceRental';

const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

/** The rental side of a gear listing: units, minimum hire, deposit, included items, add-ons, hire type, pick-up and return. */
export default function RentalOptionsEditor({ value, onChange, category, unit, dark = false }: {
  value: RentalOptions;
  onChange: (v: RentalOptions) => void;
  category: string;
  unit: string;
  dark?: boolean;
}) {
  const v = value;
  const set = (patch: Partial<RentalOptions>) => onChange({ ...v, ...patch });
  const [newIncluded, setNewIncluded] = useState('');
  const labels = hireLabels(category);
  const input = dark
    ? 'w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500'
    : 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200';
  const label = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`;
  const check = `flex items-center gap-1.5 text-xs font-semibold ${dark ? 'text-slate-200' : 'text-slate-700'}`;
  const box = `p-3 rounded-xl border space-y-2.5 ${dark ? 'border-slate-800' : 'border-slate-200'}`;
  const hint = `text-[10px] ${dark ? 'text-slate-500' : 'text-slate-500'}`;
  const head = `text-[11px] font-black uppercase tracking-wider ${dark ? 'text-slate-300' : 'text-slate-700'}`;
  const iconBtn = `p-1.5 rounded-lg cursor-pointer ${dark ? 'text-rose-300 hover:bg-rose-500/10' : 'text-rose-500 hover:bg-rose-50'}`;
  const addBtn = `px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`;
  const num = (s: string) => s === '' ? 0 : Number(s);

  const addIncluded = () => {
    const t = newIncluded.trim();
    if (!t || v.included.length >= MAX_INCLUDED) return;
    set({ included: [...v.included, t] });
    setNewIncluded('');
  };

  return (
    <div className="space-y-2.5">
      <div className={box}>
        <p className={head}>Rental terms</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <label className="block"><span className={label}>How many you have</span>
            <input type="number" min={1} max={100} className={input} value={v.quantity} onChange={e => set({ quantity: num(e.target.value) })} />
          </label>
          <label className="block"><span className={label}>Minimum hire ({unit}s)</span>
            <input type="number" min={1} max={365} className={input} value={v.minHire} onChange={e => set({ minHire: num(e.target.value) })} />
          </label>
          <label className="block"><span className={label}>Pick-up from</span>
            <input type="time" className={input} value={v.hours.open} onChange={e => set({ hours: { ...v.hours, open: e.target.value } })} />
          </label>
          <label className="block"><span className={label}>Return by</span>
            <input type="time" className={input} value={v.hours.close} onChange={e => set({ hours: { ...v.hours, close: e.target.value } })} />
          </label>
        </div>
        <p className={hint}>With more than one, renters can book several at once and the calendar counts how many are free each day.</p>
      </div>

      <div className={box}>
        <p className={head}>Hire type</p>
        <div className="flex flex-wrap gap-4">
          <label className={check}><input type="checkbox" checked={v.hire.dry} onChange={e => set({ hire: { ...v.hire, dry: e.target.checked } })} /> {labels.dry}</label>
          <label className={check}><input type="checkbox" checked={v.hire.wet} onChange={e => set({ hire: { ...v.hire, wet: e.target.checked } })} /> {labels.wet}</label>
        </div>
        {v.hire.wet && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="block"><span className={label}>Extra for {labels.operator} (FJD per {unit})</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={v.hire.wetRate} onChange={e => set({ hire: { ...v.hire, wetRate: num(e.target.value) } })} />
            </label>
            <label className="block sm:col-span-2"><span className={label}>What's included</span>
              <input className={input} maxLength={200} value={v.hire.wetNote} onChange={e => set({ hire: { ...v.hire, wetNote: e.target.value } })} placeholder={labels.operator === 'driver' ? 'e.g. Licensed driver, fuel within Suva' : 'e.g. Certified operator, fuel and transport to site'} />
            </label>
          </div>
        )}
      </div>

      <div className={box}>
        <p className={head}>Deposit</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label className="block"><span className={label}>Ask for</span>
            <select className={input} value={v.deposit.kind} onChange={e => set({ deposit: { ...v.deposit, kind: e.target.value as RentalOptions['deposit']['kind'] } })}>
              <option value="none">No deposit</option>
              <option value="bond">A refundable bond</option>
              <option value="upfront">A deposit up front (part of the price)</option>
            </select>
          </label>
          {v.deposit.kind !== 'none' && (
            <>
              <label className="block"><span className={label}>Amount</span>
                <input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={v.deposit.amount} onChange={e => set({ deposit: { ...v.deposit, amount: num(e.target.value) } })} />
              </label>
              <label className="block"><span className={label}>As</span>
                <select className={input} value={v.deposit.type} onChange={e => set({ deposit: { ...v.deposit, type: e.target.value as 'fixed' | 'percent' } })}>
                  <option value="fixed">FJD (fixed)</option>
                  <option value="percent">% of the booking</option>
                </select>
              </label>
            </>
          )}
        </div>
        <p className={hint}>Renters see it before they request. You collect it when you confirm, with your quote or invoice.</p>
      </div>

      <div className={box}>
        <p className={head}>Included at no charge</p>
        <div className="flex flex-wrap gap-1.5">
          {v.included.map((x, i) => (
            <span key={`${x}-${i}`} className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 ${dark ? 'bg-slate-800 text-slate-200' : 'bg-emerald-50 text-emerald-800'}`}>
              {x}
              <button type="button" aria-label={`Remove ${x}`} onClick={() => set({ included: v.included.filter((_, j) => j !== i) })} className="cursor-pointer opacity-60 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={input} maxLength={80} value={newIncluded} onChange={e => setNewIncluded(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIncluded(); } }} placeholder="e.g. 28-70mm kit lens, 2 batteries, charger" />
          <button type="button" onClick={addIncluded} className={addBtn}><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
      </div>

      <div className={box}>
        <p className={head}>Add-ons renters can choose</p>
        {v.addOns.map((a, i) => {
          const upd = (patch: Partial<typeof a>) => set({ addOns: v.addOns.map((x, j) => j === i ? { ...x, ...patch } : x) });
          return (
            <div key={a.id} className="grid grid-cols-12 gap-1.5 items-end">
              <label className="block col-span-12 sm:col-span-5"><span className={label}>Add-on</span><input className={input} maxLength={80} value={a.name} onChange={e => upd({ name: e.target.value })} placeholder="e.g. 128GB SD card" /></label>
              <label className="block col-span-4 sm:col-span-2"><span className={label}>FJD (0 = free)</span><input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={a.price} onChange={e => upd({ price: num(e.target.value) })} /></label>
              <label className="block col-span-4 sm:col-span-2"><span className={label}>Charged</span>
                <select className={input} value={a.per} onChange={e => upd({ per: e.target.value as 'booking' | 'period' })}>
                  <option value="booking">Once</option>
                  <option value="period">Per {unit}</option>
                </select>
              </label>
              <label className="block col-span-3 sm:col-span-2"><span className={label}>Up to</span><input type="number" min={1} max={100} className={input} value={a.max} onChange={e => upd({ max: num(e.target.value) })} /></label>
              <button type="button" aria-label={`Remove ${a.name || 'add-on'}`} onClick={() => set({ addOns: v.addOns.filter((_, j) => j !== i) })} className={`${iconBtn} col-span-1 mb-1`}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
        {v.addOns.length < MAX_ADDONS && (
          <button type="button" onClick={() => set({ addOns: [...v.addOns, { id: uid('a'), name: '', price: 0, per: 'booking', max: 1 }] })} className={addBtn}><Plus className="w-3.5 h-3.5" /> Add an add-on</button>
        )}
        <p className={hint}>Extra items or services: another lens, SD cards, a second battery, child seat, extra rental day. Set the price to 0 for free extras.</p>
      </div>

      <div className={box}>
        <p className={head}>Pick-up and return</p>
        {v.places.map((p, i) => {
          const upd = (patch: Partial<typeof p>) => set({ places: v.places.map((x, j) => j === i ? { ...x, ...patch } : x) });
          return (
            <div key={p.id} className="grid grid-cols-12 gap-1.5 items-end">
              <label className="block col-span-12 sm:col-span-4"><span className={label}>Location</span><input className={input} maxLength={80} value={p.name} onChange={e => upd({ name: e.target.value })} placeholder="e.g. Nadi Airport depot" /></label>
              <label className="block col-span-11 sm:col-span-7"><span className={label}>Address or directions</span><input className={input} maxLength={200} value={p.address} onChange={e => upd({ address: e.target.value })} placeholder="e.g. Queens Rd, opposite the terminal" /></label>
              <button type="button" aria-label={`Remove ${p.name || 'location'}`} onClick={() => set({ places: v.places.filter((_, j) => j !== i) })} className={`${iconBtn} col-span-1 mb-1`}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
        {v.places.length < MAX_PLACES && (
          <button type="button" onClick={() => set({ places: [...v.places, { id: uid('p'), name: '', address: '' }] })} className={addBtn}><Plus className="w-3.5 h-3.5" /> Add a location</button>
        )}
        {v.places.length === 0 && <p className={hint}>No locations: renters arrange pick-up with you.</p>}
        {v.places.length > 1 && <label className={check}><input type="checkbox" checked={v.returnElsewhere} onChange={e => set({ returnElsewhere: e.target.checked })} /> Can be returned to a different location</label>}
        <label className={check}><input type="checkbox" checked={v.delivery.offered} onChange={e => set({ delivery: { ...v.delivery, offered: e.target.checked } })} /> Delivery and collection available</label>
        {v.delivery.offered && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="block"><span className={label}>Delivery fee (FJD)</span><input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={v.delivery.fee} onChange={e => set({ delivery: { ...v.delivery, fee: num(e.target.value) } })} /></label>
            <label className="block sm:col-span-2"><span className={label}>Areas or notes</span><input className={input} maxLength={200} value={v.delivery.note} onChange={e => set({ delivery: { ...v.delivery, note: e.target.value } })} placeholder="e.g. Suva to Nausori; further on request" /></label>
          </div>
        )}
      </div>
    </div>
  );
}
