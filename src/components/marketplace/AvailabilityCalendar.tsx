import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays } from '../../lib/marketplaceRental';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * A month calendar of a rental's availability. `available` lists only the days with fewer than `quantity`
 * units free. Renters pick a range (first tap the start, then the end); booked-out days can't be in it.
 */
export default function AvailabilityCalendar({ today, quantity, available, from, to, onSelect, need = 1, dark = false }: {
  today: string;
  quantity: number;
  available: Record<string, number>;
  from: string;
  to: string;
  onSelect?: (from: string, to: string) => void;
  /** How many units the renter needs: days with fewer free count as booked out. */
  need?: number;
  dark?: boolean;
}) {
  const [month, setMonth] = useState(() => (from || today).slice(0, 7));
  const [problem, setProblem] = useState('');
  const free = (d: string) => available[d] ?? quantity;
  const out = (d: string) => free(d) < need;

  const days = useMemo(() => {
    const first = `${month}-01`;
    const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
    return cells;
  }, [month]);
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(dt.toISOString().slice(0, 7));
  };
  const canGoBack = month > today.slice(0, 7);
  const title = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const pick = (d: string) => {
    if (!onSelect || d < today) return;
    setProblem('');
    if (out(d)) { setProblem('That day is booked out.'); return; }
    // A new range starts when nothing is chosen, a range is complete, or the day is before the start.
    if (!from || (from && to && from !== to) || d < from) { onSelect(d, d); return; }
    for (let x = from; x <= d; x = addDays(x, 1)) {
      if (out(x)) { setProblem('Some days in between are booked out. Choose other dates.'); onSelect(d, d); return; }
    }
    onSelect(from, d);
  };

  const tone = dark
    ? { box: 'bg-slate-950 border-slate-800 text-slate-200', muted: 'text-slate-600', head: 'text-slate-400', btn: 'hover:bg-slate-800' }
    : { box: 'bg-white border-slate-200 text-slate-800', muted: 'text-slate-300', head: 'text-slate-500', btn: 'hover:bg-slate-100' };

  return (
    <div className={`rounded-xl border p-2.5 ${tone.box}`}>
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => shift(-1)} disabled={!canGoBack} aria-label="Previous month" className={`p-1 rounded-lg disabled:opacity-30 cursor-pointer ${tone.btn}`}><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-xs font-bold">{title}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className={`p-1 rounded-lg cursor-pointer ${tone.btn}`}><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map(w => <span key={w} className={`text-[9px] font-bold uppercase ${tone.head}`}>{w}</span>)}
        {days.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const past = d < today;
          const n = free(d);
          const full = n <= 0 || n < need;
          const partly = !full && n < quantity;
          const picked = from && d >= from && d <= (to || from);
          const edge = d === from || d === to;
          const cls = past ? `${tone.muted} cursor-default`
            : picked ? (edge ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-900')
            : full ? 'bg-rose-100 text-rose-400 line-through cursor-not-allowed'
            : partly ? 'bg-amber-50 text-amber-800 cursor-pointer hover:bg-amber-100'
            : `cursor-pointer ${dark ? 'hover:bg-slate-800' : 'hover:bg-sky-50'}`;
          return (
            <button key={d} type="button" disabled={past || !onSelect} onClick={() => pick(d)}
              aria-label={`${d}${past ? ', past' : full ? ', booked out' : partly ? `, ${n} of ${quantity} free` : ', free'}`} aria-pressed={!!picked}
              title={past ? undefined : full ? 'Booked out' : partly ? `${n} of ${quantity} free` : 'Free'}
              className={`h-8 rounded-lg text-[11px] font-semibold ${cls}`}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] ${tone.head}`}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-200" /> Booked out</span>
        {quantity > 1 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200" /> Some free</span>}
        {onSelect && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky-600" /> Your dates</span>}
      </div>
      {problem && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problem}</p>}
    </div>
  );
}
