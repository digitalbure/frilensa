import React from 'react';
import { Layers, Plus, Split, Sparkles, Trash2, X } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '../../lib/currencies';
import { MAX_PARTS, MAX_PRICE_OPTIONS, type PriceOption } from '../../lib/rateConditions';

const uid = () => `o${Math.random().toString(36).slice(2, 8)}`;
const EXAMPLE: PriceOption[] = [
  { id: uid(), label: 'Local production', description: 'A Fiji-based crew or production', amount: 600, currency: 'FJD' },
  { id: uid(), label: 'International production in Fiji', description: 'An overseas production hiring locally', amount: 900, currency: 'FJD' },
  { id: uid(), label: 'Overseas work (travel)', description: 'Outside Fiji; flights and accommodation extra', amount: 1000, currency: 'AUD', parts: [{ label: 'Gear', rate: 400 }, { label: 'Labour', rate: 600 }] }
];

/** Rate options for a service listing: different rates (and currencies) for different kinds of job. */
export default function PriceOptionsEditor({ value, onChange, unit, dark = false }: { value: PriceOption[]; onChange: (v: PriceOption[]) => void; unit: string; dark?: boolean }) {
  const input = dark
    ? 'w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500'
    : 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200';
  const label = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`;
  const box = `p-3 rounded-xl border space-y-2.5 ${dark ? 'border-slate-800' : 'border-slate-200'}`;
  const muted = `text-[10px] ${dark ? 'text-slate-500' : 'text-slate-500'}`;
  const update = (i: number, patch: Partial<PriceOption>) => onChange(value.map((o, j) => j === i ? { ...o, ...patch } : o));
  const per = unit === 'job' ? 'per job' : unit === 'session' ? 'per session' : `per ${unit}`;

  return (
    <div className={box}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${dark ? 'text-slate-300' : 'text-slate-700'}`}><Layers className="w-3.5 h-3.5 text-sky-500" /> Rates for different jobs (optional)</p>
          <p className={muted}>e.g. local or international production, or overseas work in another currency. Requesters choose the one that fits; the first is your headline price.</p>
        </div>
        {value.length === 0 && (
          <button type="button" onClick={() => onChange(EXAMPLE.map(o => ({ ...o, id: uid() })))} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Start from an example
          </button>
        )}
      </div>
      {value.map((o, i) => {
        const parts = o.parts || [];
        const setParts = (next: { label: string; rate: number }[]) => update(i, { parts: next, amount: Math.round(next.reduce((s, p) => s + (Number(p.rate) || 0), 0) * 100) / 100 });
        return (
          <div key={o.id} className={`rounded-xl p-2.5 space-y-2 ${dark ? 'bg-slate-950 border border-slate-800' : 'bg-slate-50 border border-slate-200'}`}>
            <div className="grid grid-cols-12 gap-2 items-end">
              <label className="block col-span-12 sm:col-span-5"><span className={label}>Rate for</span><input className={input} maxLength={60} value={o.label} onChange={e => update(i, { label: e.target.value })} placeholder="e.g. International production" /></label>
              <label className="block col-span-4 sm:col-span-2"><span className={label}>Currency</span>
                <select className={input} value={o.currency} onChange={e => update(i, { currency: e.target.value })}>
                  {[...new Set([o.currency, ...SUPPORTED_CURRENCIES.map(c => c.code)])].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block col-span-6 sm:col-span-3"><span className={label}>Amount {per}</span>
                <input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={o.amount || ''} disabled={parts.length > 0} onChange={e => update(i, { amount: Number(e.target.value) })} />
              </label>
              <div className="col-span-2 flex gap-1 justify-end pb-1">
                <button type="button" title={parts.length ? 'One amount' : 'Split into parts, e.g. gear and labour'} aria-label={parts.length ? `One amount for ${o.label}` : `Split ${o.label || 'this rate'} into parts`}
                  onClick={() => parts.length ? update(i, { parts: undefined }) : setParts([{ label: 'Gear', rate: 0 }, { label: 'Labour', rate: o.amount || 0 }])}
                  className={`p-1.5 rounded-lg cursor-pointer ${parts.length ? 'text-sky-500' : dark ? 'text-slate-400' : 'text-slate-500'}`}><Split className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label={`Remove ${o.label || 'rate'}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-rose-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <input className={input} maxLength={160} value={o.description} onChange={e => update(i, { description: e.target.value })} placeholder="When it applies, e.g. An overseas crew hiring locally in Fiji" aria-label={`When ${o.label || 'this rate'} applies`} />
            {parts.length > 0 && (
              <div className="space-y-1.5 pl-2 border-l-2 border-sky-300">
                {parts.map((p, j) => (
                  <div key={j} className="flex items-center gap-1.5">
                    <input className={input} maxLength={40} value={p.label} aria-label={`Part ${j + 1}`} onChange={e => setParts(parts.map((x, k) => k === j ? { ...x, label: e.target.value } : x))} />
                    <input type="number" min={0} step="0.01" inputMode="decimal" className={`${input} max-w-[7rem]`} aria-label={`${p.label || 'Part'} amount`} value={p.rate || ''} onChange={e => setParts(parts.map((x, k) => k === j ? { ...x, rate: Number(e.target.value) } : x))} />
                    <button type="button" aria-label={`Remove ${p.label || 'part'}`} onClick={() => { const next = parts.filter((_, k) => k !== j); next.length ? setParts(next) : update(i, { parts: undefined }); }} className="p-1 text-rose-500 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  {parts.length < MAX_PARTS ? <button type="button" onClick={() => setParts([...parts, { label: '', rate: 0 }])} className="text-[10px] font-bold text-sky-600 cursor-pointer">+ Add a part</button> : <span />}
                  <span className={`text-[11px] font-mono font-bold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>Total {o.currency} {(o.amount || 0).toLocaleString()} {per}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {value.length > 0 && value.length < MAX_PRICE_OPTIONS && (
        <button type="button" onClick={() => onChange([...value, { id: uid(), label: '', description: '', amount: 0, currency: value[value.length - 1]?.currency || 'FJD' }])}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}><Plus className="w-3.5 h-3.5" /> Add a rate</button>
      )}
    </div>
  );
}
