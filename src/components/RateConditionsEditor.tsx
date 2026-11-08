import React, { useState } from 'react';
import { Layers, Plus, Sparkles, Split, Trash2, X } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '../lib/currencies';
import { CONDITION_TEMPLATES, MAX_CONDITIONS, MAX_PARTS, newConditionId, type ConditionRate, type RateCondition } from '../lib/rateConditions';

const input = 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200';
const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1';

function CurrencySelect({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  const codes = SUPPORTED_CURRENCIES.map(c => c.code);
  return (
    <select aria-label={ariaLabel} className={input} value={value} onChange={e => onChange(e.target.value)}>
      {[...new Set([value, ...codes])].map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

/**
 * A business's rate conditions: the situations it charges differently for (local or international
 * production, type of client, where the work is). Each has its own currency and can be VAT-free.
 */
export function RateConditionsManager({ conditions, onSave, onClose, baseCurrency, businessName }: {
  conditions: RateCondition[];
  onSave: (next: RateCondition[]) => void;
  onClose: () => void;
  baseCurrency: string;
  businessName: string;
}) {
  const [list, setList] = useState<RateCondition[]>(conditions.map(c => ({ ...c })));
  const [problem, setProblem] = useState<string | null>(null);
  const update = (i: number, patch: Partial<RateCondition>) => setList(l => l.map((c, j) => j === i ? { ...c, ...patch } : c));
  const add = (c?: Omit<RateCondition, 'id'>) => {
    if (list.length >= MAX_CONDITIONS) return;
    setList(l => [...l, { id: newConditionId(), name: '', description: '', currency: baseCurrency, ...(c || {}) }]);
  };
  const addTemplate = (id: string) => {
    const t = CONDITION_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    const have = new Set(list.map(c => c.name.trim().toLowerCase()));
    const fresh = t.conditions(baseCurrency).filter(c => !have.has(c.name.toLowerCase()));
    setList(l => [...l, ...fresh.map(c => ({ ...c, id: newConditionId() }))].slice(0, MAX_CONDITIONS));
  };
  const save = () => {
    const cleaned = list.map(c => ({ ...c, name: c.name.trim(), description: c.description.trim() }));
    if (cleaned.some(c => !c.name)) { setProblem('Give every condition a name, or remove it.'); return; }
    const names = cleaned.map(c => c.name.toLowerCase());
    if (new Set(names).size !== names.length) { setProblem('Two conditions have the same name.'); return; }
    onSave(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Rate conditions" onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div>
            <h3 className="text-sm font-black flex items-center gap-2"><Layers className="w-4 h-4 text-sky-300" /> Rate conditions</h3>
            <p className="text-[11px] text-slate-300 mt-0.5">Situations {businessName || 'your business'} charges differently for. Set each service's rate for them when you edit it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-300 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3 text-[11px] text-sky-900 space-y-1">
            <p className="font-bold">For example</p>
            <p>Local production: FJD 600/day · International production in Fiji: FJD 900/day · Overseas work: AUD 1,000/day (AUD 400 gear + AUD 600 labour), no Fiji VAT.</p>
          </div>

          {list.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">Start from a common set, or add your own.</p>
              <div className="flex flex-wrap gap-2">
                {CONDITION_TEMPLATES.map(t => (
                  <button key={t.id} type="button" onClick={() => addTemplate(t.id)} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {list.map((c, i) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 items-end">
                <label className="block col-span-12 sm:col-span-6"><span className={label}>Condition</span>
                  <input className={input} maxLength={60} value={c.name} onChange={e => update(i, { name: e.target.value })} placeholder="e.g. International production in Fiji" />
                </label>
                <label className="block col-span-5 sm:col-span-2"><span className={label}>Currency</span>
                  <CurrencySelect ariaLabel={`Currency for ${c.name || 'condition'}`} value={c.currency} onChange={v => update(i, { currency: v })} />
                </label>
                <label className="col-span-6 sm:col-span-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 pb-2">
                  <input type="checkbox" checked={!!c.noVat} onChange={e => update(i, { noVat: e.target.checked })} /> No VAT
                </label>
                <button type="button" onClick={() => setList(l => l.filter((_, j) => j !== i))} aria-label={`Remove ${c.name || 'condition'}`} className="col-span-1 p-2 mb-0.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer justify-self-end"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <label className="block"><span className={label}>When it applies (shown to clients)</span>
                <input className={input} maxLength={200} value={c.description} onChange={e => update(i, { description: e.target.value })} placeholder="e.g. An overseas production hiring locally in Fiji" />
              </label>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {list.length < MAX_CONDITIONS && <button type="button" onClick={() => add()} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add a condition</button>}
            {list.length > 0 && list.length < MAX_CONDITIONS && (
              <select aria-label="Add a set of conditions" value="" onChange={e => addTemplate(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer">
                <option value="">Add a common set…</option>
                {CONDITION_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <p className="text-[10px] text-slate-500">"No VAT" is for work that isn't charged Fiji VAT, such as services done overseas. Check with your accountant if you're not sure. Removing a condition also removes the rates you set for it.</p>
          {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer">Cancel</button>
            <button type="button" onClick={save} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">Save conditions</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A service's rate under each of the business's conditions, optionally split into parts (e.g. gear and labour). */
export function ConditionRatesEditor({ conditions, value, onChange, unit, baseCurrency, onManage }: {
  conditions: RateCondition[];
  value: ConditionRate[];
  onChange: (v: ConditionRate[]) => void;
  unit: string;
  baseCurrency: string;
  onManage: () => void;
}) {
  const get = (id: string) => value.find(r => r.conditionId === id);
  const put = (id: string, next: ConditionRate | null) => {
    const rest = value.filter(r => r.conditionId !== id);
    onChange(next ? [...rest, next] : rest);
  };
  const per = unit ? `per ${unit.toLowerCase()}` : '';

  return (
    <div className="p-4 rounded-2xl bg-white border border-sky-200 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-sky-600" /> Rates by condition</span>
          <span className="text-[11px] text-slate-500">e.g. local or international production, or overseas work. Leave blank to use the standard rate ({baseCurrency}).</span>
        </div>
        <button type="button" onClick={onManage} className="text-[11px] font-bold text-sky-700 hover:underline shrink-0 cursor-pointer">{conditions.length ? 'Edit conditions' : 'Set up conditions'}</button>
      </div>
      {conditions.length === 0 ? (
        <button type="button" onClick={onManage} className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer">+ Add conditions, e.g. Local / International / Overseas</button>
      ) : conditions.map(c => {
        const r = get(c.id);
        const parts = r?.parts || [];
        const split = parts.length > 0;
        const setParts = (next: { label: string; rate: number }[]) => put(c.id, { conditionId: c.id, rate: Math.round(next.reduce((s, p) => s + (Number(p.rate) || 0), 0) * 100) / 100, parts: next });
        return (
          <div key={c.id} className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800">{c.name} <span className="font-mono text-[10px] text-slate-500">{c.currency}{c.noVat ? ' · no VAT' : ''}</span></p>
                {c.description && <p className="text-[10px] text-slate-500 truncate">{c.description}</p>}
              </div>
              {!split && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-500">{c.currency}</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Rate for ${c.name}`} placeholder={c.currency === baseCurrency ? 'Standard' : 'Not offered'}
                    value={r ? r.rate : ''} onChange={e => put(c.id, e.target.value === '' ? null : { conditionId: c.id, rate: Number(e.target.value) })}
                    className="w-28 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-200" />
                  <span className="text-[10px] text-slate-500">{per}</span>
                </div>
              )}
              <button type="button" onClick={() => split ? put(c.id, r && r.rate ? { conditionId: c.id, rate: r.rate } : null) : setParts([{ label: 'Gear', rate: 0 }, { label: 'Labour', rate: r?.rate || 0 }])}
                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                <Split className="w-3 h-3" /> {split ? 'One rate' : 'Split into parts'}
              </button>
            </div>
            {split && (
              <div className="space-y-1.5 pl-2 border-l-2 border-sky-200">
                {parts.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input aria-label={`Part ${i + 1} of ${c.name}`} maxLength={40} value={p.label} onChange={e => setParts(parts.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="e.g. Gear" />
                    <span className="text-[10px] font-mono text-slate-500">{c.currency}</span>
                    <input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Rate for ${p.label || `part ${i + 1}`} of ${c.name}`} value={p.rate || ''} onChange={e => setParts(parts.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x))}
                      className="w-24 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-200" />
                    <button type="button" aria-label={`Remove ${p.label || 'part'}`} onClick={() => { const next = parts.filter((_, j) => j !== i); next.length ? setParts(next) : put(c.id, null); }} className="p-1 text-rose-500 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  {parts.length < MAX_PARTS ? <button type="button" onClick={() => setParts([...parts, { label: '', rate: 0 }])} className="text-[10px] font-bold text-sky-700 cursor-pointer">+ Add a part</button> : <span />}
                  <span className="text-[11px] font-bold text-slate-800 font-mono">Total {c.currency} {(r?.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {per}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
