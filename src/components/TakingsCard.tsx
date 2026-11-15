import React, { useMemo, useState } from 'react';
import { Coins, Plus, Trash2, X } from 'lucide-react';
import type { CRMData } from '../types';
import { TAKINGS_METHODS, takingsEntry, takingsSummary, vatIncluded } from '../lib/takings';
import AccountSelect from './AccountSelect';
import { trackAction } from '../lib/analytics';

// Home: takings, the cash, card and mobile money sales you didn't invoice (a market day, a canteen till).

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TakingsCard({ data, onUpdateData }: { data: CRMData; onUpdateData: (d: CRMData) => void }) {
  const [open, setOpen] = useState(false);
  const now = today();
  const s = useMemo(() => takingsSummary(data, now), [data, now]);
  const cur = data.userProfile?.defaultCurrency || 'FJD';
  const remove = (id: string) => {
    if (!confirm('Delete these takings?')) return;
    onUpdateData({ ...data, transactions: (data.transactions || []).filter(t => t.id !== id) });
  };
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs" data-testid="takings-card">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Coins className="w-4 h-4 text-amber-500" /> Takings</h3>
          <p className="text-[11px] text-slate-500">Cash, card and M-PAiSA sales you didn't invoice.</p>
        </div>
        <button onClick={() => setOpen(true)} className="text-xs font-bold bg-slate-900 text-white rounded-xl px-3 py-1.5 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Record takings</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['Today', s.today], ['This week', s.week], ['This month', s.month]] as const).map(([label, n]) => (
          <div key={label} className="bg-slate-50 rounded-xl p-2"><p className="text-[9px] uppercase font-bold text-slate-500">{label}</p><p className="font-mono text-xs font-black" data-testid={`takings-${label}`}>{cur} {fmt(n)}</p></div>
        ))}
      </div>
      {s.list.length > 0 && (
        <div className="divide-y divide-slate-100">
          {s.list.slice(0, 4).map(t => (
            <div key={t.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate"><span className="font-mono text-slate-500">{t.date}</span> · {t.description}</span>
              <span className="font-mono font-bold">{fmt(t.amount)}</span>
              <button onClick={() => remove(t.id)} aria-label={`Delete takings ${t.date}`} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {open && <TakingsForm data={data} onCancel={() => setOpen(false)} onSave={t => { onUpdateData({ ...data, transactions: [t, ...(data.transactions || [])] }); trackAction('takings_recorded'); setOpen(false); }} />}
    </section>
  );
}

function TakingsForm({ data, onCancel, onSave }: { data: CRMData; onCancel: () => void; onSave: (t: any) => void }) {
  const charges = data.userProfile?.enableTax !== false;
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(TAKINGS_METHODS[0]);
  const [note, setNote] = useState('');
  const [withVat, setWithVat] = useState(charges);
  const [accountId, setAccountId] = useState('');
  const [problem, setProblem] = useState('');
  const n = Number(amount) || 0;
  const input = 'w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-sm text-slate-900 focus:outline-none focus:border-slate-900';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = takingsEntry({ date, amount: n, method, note, vatIncluded: withVat, accountId, businessId: data.activeBusinessId }, data);
    if (typeof t === 'string') return setProblem(t);
    onSave(t);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-slate-950/70" role="dialog" aria-modal="true" aria-label="Record takings">
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between"><h3 className="text-sm font-black">Record takings</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="p-1 rounded-full hover:bg-slate-100"><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-[10px] font-black uppercase text-slate-500 block mb-1" htmlFor="tk-amount">How much you took</label>
            <input id="tk-amount" type="number" inputMode="decimal" min="0" step="0.01" required autoFocus className={`${input} text-lg font-mono font-bold`} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div><label className="text-[10px] font-black uppercase text-slate-500 block mb-1" htmlFor="tk-date">Day</label>
            <input id="tk-date" type="date" required className={input} value={date} onChange={e => setDate(e.target.value || today())} /></div>
          <div><label className="text-[10px] font-black uppercase text-slate-500 block mb-1" htmlFor="tk-method">Paid by</label>
            <select id="tk-method" className={input} value={method} onChange={e => setMethod(e.target.value)}>{TAKINGS_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
          <div className="col-span-2"><label className="text-[10px] font-black uppercase text-slate-500 block mb-1" htmlFor="tk-note">What for (optional)</label>
            <input id="tk-note" className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Saturday market, lunch sales" /></div>
          <div className="col-span-2"><AccountSelect data={data} businessId={data.activeBusinessId} method={method} value={accountId} onChange={setAccountId} label="Into account" id="tk-account" /></div>
        </div>
        {charges && (
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withVat} onChange={e => setWithVat(e.target.checked)} />
            Includes VAT{withVat && n > 0 ? ` (${fmt(vatIncluded(n, data))})` : ''}</label>
        )}
        {problem && <p className="text-xs text-rose-600 font-semibold">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-900 text-white">Save takings</button>
        </div>
      </form>
    </div>
  );
}
