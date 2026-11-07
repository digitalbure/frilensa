import React, { useState } from 'react';
import { BadgePercent, Scale, X } from 'lucide-react';
import type { DiscountTiming, DiscountType, RoundingRule } from '../lib/documentAdjustments';

export interface DiscountDraft { type: DiscountType; value: string; timing: DiscountTiming; label: string }
export type { RoundingRule };

const STEPS: { label: string; step: number; direction: 'nearest' | 'down' | 'up' }[] = [
  { label: 'Nearest $1', step: 1, direction: 'nearest' },
  { label: 'Nearest $10', step: 10, direction: 'nearest' },
  { label: 'Down to $10', step: 10, direction: 'down' },
  { label: 'Down to $100', step: 100, direction: 'down' }
];

export function describeRounding(r: RoundingRule | null, currency: string) {
  if (!r) return '';
  if (r.mode === 'target') return `Total set to ${currency} $${r.target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return STEPS.find(s => s.step === r.step && s.direction === r.direction)?.label || `Rounded to $${r.step}`;
}

/** Quote/invoice editor: a discount (percent or amount, before or after tax) and rounding of the total. */
export default function DiscountRoundingCard({ currency, discount, onDiscount, discountAmount, rounding, onRounding, roundingAdjustment, totalBeforeRounding, isTaxInvoice }: {
  currency: string;
  discount: DiscountDraft;
  onDiscount: (d: DiscountDraft) => void;
  discountAmount: number;
  rounding: RoundingRule | null;
  onRounding: (r: RoundingRule | null) => void;
  roundingAdjustment: number;
  totalBeforeRounding: number;
  isTaxInvoice: boolean;
}) {
  const [target, setTarget] = useState('');
  const money = (n: number) => `${currency} $${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const set = (patch: Partial<DiscountDraft>) => onDiscount({ ...discount, ...patch });
  const hasDiscount = Number(discount.value) > 0;
  const bigRounding = Math.abs(roundingAdjustment) > Math.max(5, totalBeforeRounding * 0.01);
  const input = 'w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-200';
  const seg = (on: boolean) => `flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold cursor-pointer ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`;

  const applyTarget = () => {
    const t = Number(target);
    if (Number.isFinite(t) && t > 0) { onRounding({ mode: 'target', target: Math.round(t * 100) / 100 }); setTarget(''); }
  };

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3.5">
      {/* Discount */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-800 uppercase tracking-wider"><BadgePercent className="w-3.5 h-3.5 text-violet-600" /> Discount</span>
          {hasDiscount && <button type="button" onClick={() => set({ value: '' })} className="text-[10.5px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-0.5 cursor-pointer"><X className="w-3 h-3" /> Remove</button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex bg-slate-200/70 p-0.5 rounded-lg" role="radiogroup" aria-label="Discount type">
            <button type="button" role="radio" aria-checked={discount.type === 'percent'} className={seg(discount.type === 'percent')} onClick={() => set({ type: 'percent' })}>%</button>
            <button type="button" role="radio" aria-checked={discount.type === 'amount'} className={seg(discount.type === 'amount')} onClick={() => set({ type: 'amount' })}>{currency} $</button>
          </div>
          <input type="number" min={0} step={discount.type === 'percent' ? 'any' : '0.01'} inputMode="decimal" aria-label="Discount value"
            className={input} placeholder={discount.type === 'percent' ? 'e.g. 10' : 'e.g. 250'} value={discount.value} onChange={e => set({ value: e.target.value })} />
        </div>
        <div className="flex bg-slate-200/70 p-0.5 rounded-lg" role="radiogroup" aria-label="When the discount applies">
          <button type="button" role="radio" aria-checked={discount.timing === 'before_tax'} className={seg(discount.timing === 'before_tax')} onClick={() => set({ timing: 'before_tax' })}>Before tax</button>
          <button type="button" role="radio" aria-checked={discount.timing === 'after_tax'} className={seg(discount.timing === 'after_tax')} onClick={() => set({ timing: 'after_tax' })}>After tax</button>
        </div>
        <input className={input} maxLength={60} placeholder="Label on the document (optional), e.g. Returning client discount" value={discount.label} onChange={e => set({ label: e.target.value })} aria-label="Discount label" />
        <p className="text-[10px] text-slate-500">
          {discount.timing === 'before_tax'
            ? 'Taken off the line items before VAT and other taxes, so taxes are charged on the lower amount.'
            : 'Taken off the total after taxes. The taxes stay as charged on the full amount.'}
          {hasDiscount && discountAmount > 0 && <> Discount: <strong className="text-violet-700">−{money(discountAmount)}</strong>.</>}
        </p>
        {hasDiscount && discount.timing === 'after_tax' && isTaxInvoice && (
          <p className="text-[10px] text-amber-700">On a tax invoice, a discount before tax usually gives the right VAT. Check with your accountant if unsure.</p>
        )}
      </div>

      {/* Rounding */}
      <div className="space-y-2 pt-3 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-800 uppercase tracking-wider"><Scale className="w-3.5 h-3.5 text-teal-600" /> Round the total</span>
          {rounding && <button type="button" onClick={() => onRounding(null)} className="text-[10.5px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-0.5 cursor-pointer"><X className="w-3 h-3" /> Remove</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STEPS.map(s => {
            const on = rounding?.mode === 'step' && rounding.step === s.step && rounding.direction === s.direction;
            return (
              <button key={s.label} type="button" onClick={() => onRounding({ mode: 'step', step: s.step, direction: s.direction })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'}`}>{s.label}</button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input type="number" min={0} step="0.01" inputMode="decimal" className={input} placeholder="Set the total to, e.g. 5000" value={target}
            onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyTarget(); } }} aria-label="Exact total" />
          <button type="button" onClick={applyTarget} disabled={!(Number(target) > 0)} className="px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-40 shrink-0">Set total</button>
        </div>
        {rounding ? (
          <p className="text-[10px] text-slate-600">
            {describeRounding(rounding, currency)}: {money(totalBeforeRounding)} → <strong>{money(totalBeforeRounding + roundingAdjustment)}</strong> (rounding {roundingAdjustment >= 0 ? '+' : '−'}{money(Math.abs(roundingAdjustment))}). It stays on this figure if you change the lines.
          </p>
        ) : (
          <p className="text-[10px] text-slate-500">Adds a small "Rounding" line so the total lands on a round figure.</p>
        )}
        {rounding && bigRounding && (
          <p className="text-[10px] text-amber-700">That's a large adjustment. To take a bigger amount off, a discount is clearer for your client.</p>
        )}
      </div>
    </div>
  );
}
