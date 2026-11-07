import React, { useState } from 'react';
import type { DocumentItem } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Edits one line of a quote, invoice or retainer in place: name, details, quantity and rate.
 * Reimbursable expense lines keep their amount (it comes from the expense), so only the wording changes.
 */
export default function LineItemEditForm({ item, currency, amountLocked = false, onSave, onCancel }: {
  key?: string;
  item: DocumentItem;
  currency: string;
  amountLocked?: boolean;
  onSave: (item: DocumentItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name || '');
  const [description, setDescription] = useState(item.description || '');
  const [quantity, setQuantity] = useState(String(item.quantity ?? 1));
  const [rate, setRate] = useState(String(item.rate ?? 0));

  const qty = Number(quantity), rt = Number(rate);
  const valid = name.trim() !== '' && (amountLocked || (Number.isFinite(qty) && qty > 0 && Number.isFinite(rt) && rt >= 0));
  const total = amountLocked ? item.total : round2(qty * rt);

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    const next: DocumentItem = { ...item, name: name.trim(), description: description.trim() || undefined };
    if (!amountLocked) Object.assign(next, { quantity: qty, rate: rt, total: round2(qty * rt) });
    onSave(next);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') { e.preventDefault(); save(); }
  };
  const input = 'w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[11px] mt-0.5 focus:outline-none focus:ring-2 focus:ring-sky-200';

  return (
    // A div, not a form: this sits inside the document's own form.
    <div onKeyDown={keys} className="bg-sky-50/60 p-2.5 rounded-xl border border-sky-200 space-y-2 text-[11px]" role="group" aria-label={`Edit ${item.name}`}>
      <label className="block">
        <span className="block text-[9px] font-bold text-slate-500 uppercase">Item</span>
        <input autoFocus className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Service description" />
      </label>
      <label className="block">
        <span className="block text-[9px] font-bold text-slate-500 uppercase">Details (optional)</span>
        <textarea rows={2} className={`${input} resize-y`} value={description} onChange={e => setDescription(e.target.value)} placeholder="Shown under the item on the quote or invoice" />
      </label>
      {amountLocked ? (
        <p className="text-[10px] text-slate-500">The amount comes from the expense ({currency} ${item.total.toFixed(2)}), so it can't be changed here.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 items-end">
          <label className="block">
            <span className="block text-[9px] font-bold text-slate-500 uppercase">Qty / hours</span>
            <input type="number" min={0} step="any" inputMode="decimal" className={input} value={quantity} onChange={e => setQuantity(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[9px] font-bold text-slate-500 uppercase">Rate ({currency})</span>
            <input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={rate} onChange={e => setRate(e.target.value)} />
          </label>
          <div className="text-right pb-1.5">
            <span className="block text-[9px] font-bold text-slate-500 uppercase">Line total</span>
            <span className="font-mono font-bold text-slate-800">{currency} ${Number.isFinite(total) ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
          </div>
        </div>
      )}
      {!valid && <p className="text-[10px] text-rose-600">{name.trim() === '' ? 'Give the item a name.' : 'Enter a quantity above 0 and a rate of 0 or more.'}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold cursor-pointer">Cancel</button>
        <button type="button" onClick={() => save()} disabled={!valid} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer disabled:opacity-50">Save line</button>
      </div>
    </div>
  );
}
