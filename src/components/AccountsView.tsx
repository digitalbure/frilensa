import React, { useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, Pencil, Plus, Smartphone, Star, X } from 'lucide-react';
import type { CRMData } from '../types';
import { ACCOUNT_KINDS, cleanAccount, suggestedMatchWords, type AccountKind, type MoneyAccount } from '../lib/accounts';
import { accountActivity, accountBalances, assignEntryAccount } from '../lib/journal';
import { trackAction } from '../lib/analytics';

// Finance → Accounts: bank accounts, cash, cards and mobile money with their balances, worked out from
// everything recorded (lib/journal.ts). Entries Frilensa can't place can be assigned here.

const today = () => new Date().toISOString().slice(0, 10);
const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = 'w-full bg-white border border-zinc-300 rounded-xl py-2 px-3 text-xs text-zinc-900 focus:outline-none focus:border-emerald-600';
const label = 'block text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1';
const ICONS: Record<AccountKind, React.ReactNode> = {
  bank: <Landmark className="w-4 h-4" />, cash: <Banknote className="w-4 h-4" />, card: <CreditCard className="w-4 h-4" />, mobile: <Smartphone className="w-4 h-4" />
};

export default function AccountsView({ data, onUpdateData }: { data: CRMData; onUpdateData: (d: CRMData) => void }) {
  const businessId = data.activeBusinessId || data.businesses[0]?.id || '';
  const [asOf, setAsOf] = useState(today());
  const [editing, setEditing] = useState<Partial<MoneyAccount> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { accounts, unassigned, journal } = useMemo(() => accountBalances(data, businessId, asOf), [data, businessId, asOf]);
  const live = accounts.filter(a => !a.account.archived);
  const total = live.reduce((s, a) => s + a.balance, 0) + unassigned;
  const code = selected === 'unassigned' ? 'cash:unassigned' : selected ? `cash:${selected}` : null;
  const activity = useMemo(() => code ? accountActivity(journal, code).slice(0, 200) : [], [journal, code]);

  const save = (a: MoneyAccount) => {
    let list = data.bankAccounts || [];
    if (a.isDefault) list = list.map(x => x.businessId === a.businessId ? { ...x, isDefault: false } : x);
    onUpdateData({ ...data, bankAccounts: list.some(x => x.id === a.id) ? list.map(x => x.id === a.id ? a : x) : [...list, a] });
    setEditing(null);
    trackAction('money_account_saved');
  };
  const assign = (entryId: string, accountId: string) => {
    const entry = journal.entries.find(e => e.id === entryId);
    if (!entry || !accountId) return;
    const next = assignEntryAccount(data, entry, accountId);
    if (next) { onUpdateData(next); trackAction('money_entry_assigned'); }
    else alert('This payment follows its payment method. Add the method\'s name (for example "M-PAiSA") to the account\'s payment methods instead.');
  };

  return (
    <div className="space-y-4" data-testid="accounts-view">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2"><Landmark className="w-4 h-4 text-emerald-600" /> Bank, cash and cards</h3>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xl">Balances worked out from everything you record: payments in, expenses, bills, pay runs and tax payments. Each goes to the account it was paid through, matched by its payment method, or to your main account.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-zinc-500" htmlFor="acct-asof">Balances on</label>
            <input id="acct-asof" type="date" className="bg-white border border-zinc-300 rounded-xl py-1 px-2 text-xs font-mono" value={asOf} onChange={e => setAsOf(e.target.value || today())} />
            <button onClick={() => setEditing({ businessId, kind: 'bank', openingBalance: 0, openingDate: `${today().slice(0, 4)}-01-01`, matchWords: [], isDefault: !(data.bankAccounts || []).some(a => a.businessId === businessId) })}
              className="bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add account</button>
          </div>
        </div>
        {live.length === 0 ? (
          <p className="text-xs text-zinc-500">Add your bank accounts, cash, cards and M-PAiSA with their balance on a date, and Frilensa keeps them up to date from what you record.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {live.map(({ account: a, balance }) => (
              <div key={a.id} data-testid={`acct-${a.name}`} className={`relative rounded-xl border p-3 transition ${selected === a.id ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'}`}>
                <button onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`} className="absolute top-2 right-2 p-1 rounded-lg text-zinc-500 hover:bg-zinc-100"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setSelected(selected === a.id ? null : a.id)} className="text-left w-full" aria-expanded={selected === a.id}>
                <div className="flex items-center gap-2 pr-6">
                  <span className="text-xs font-bold flex items-center gap-1.5">{ICONS[a.kind]} {a.name}{a.isDefault && <Star className="w-3 h-3 text-amber-500" aria-label="Main account" />}</span>
                </div>
                <p className="text-[10px] text-zinc-500">{ACCOUNT_KINDS[a.kind]}{a.institution ? ` · ${a.institution}` : ''}{a.number ? ` ···· ${a.number}` : ''}</p>
                <p className={`font-mono font-black text-sm mt-1 ${balance < 0 ? 'text-rose-700' : ''}`} data-testid="acct-balance">
                  {a.kind === 'card' && balance <= 0 ? `You owe ${fjd(-balance)}` : fjd(balance)}
                </p>
                </button>
              </div>
            ))}
            {Math.abs(unassigned) > 0.004 && (
              <button onClick={() => setSelected(selected === 'unassigned' ? null : 'unassigned')} className={`text-left rounded-xl border border-dashed p-3 ${selected === 'unassigned' ? 'border-amber-600 bg-amber-50' : 'border-amber-300'}`} data-testid="acct-unassigned">
                <span className="text-xs font-bold text-amber-800">Not assigned to an account</span>
                <p className="text-[10px] text-amber-800">Choose where these went, or add the account they belong to.</p>
                <p className="font-mono font-black text-sm mt-1">{fjd(unassigned)}</p>
              </button>
            )}
          </div>
        )}
        {live.length > 0 && <p className="text-xs">Total money: <strong className="font-mono">{fjd(total)}</strong></p>}
      </div>

      {code && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700">{selected === 'unassigned' ? 'Not assigned' : live.find(a => a.account.id === selected)?.account.name} · activity</h4>
          {activity.length === 0 ? <p className="text-xs text-zinc-500">Nothing yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="acct-activity">
                <thead><tr className="text-[10px] uppercase text-zinc-500 text-left"><th className="py-1">Date</th><th>What</th><th className="text-right">In / out</th><th className="text-right">Balance</th>{live.length > 0 && <th className="text-right">Account</th>}</tr></thead>
                <tbody className="divide-y divide-zinc-100">
                  {activity.map(r => (
                    <tr key={r.entry.id}>
                      <td className="py-1.5 font-mono whitespace-nowrap">{r.entry.date}</td>
                      <td className="pr-2">{r.entry.description}</td>
                      <td className={`text-right font-mono whitespace-nowrap ${r.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.amount.toFixed(2)}</td>
                      <td className="text-right font-mono whitespace-nowrap pl-2">{r.balance.toFixed(2)}</td>
                      {live.length > 0 && r.entry.source.kind !== 'opening' && (
                        <td className="text-right pl-2">
                          <select aria-label={`Account for ${r.entry.description}`} className="bg-white border border-zinc-200 rounded-lg py-0.5 px-1 text-[11px]" value=""
                            onChange={e => assign(r.entry.id, e.target.value)}>
                            <option value="">Move to…</option>
                            {live.filter(a => `cash:${a.account.id}` !== code).map(a => <option key={a.account.id} value={a.account.id}>{a.account.name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && <AccountForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function AccountForm({ initial, onCancel, onSave }: { initial: Partial<MoneyAccount>; onCancel: () => void; onSave: (a: MoneyAccount) => void }) {
  const [a, setA] = useState<Partial<MoneyAccount>>(initial);
  const [words, setWords] = useState((initial.matchWords || []).join(', '));
  const [wordsTouched, setWordsTouched] = useState(!!initial.id);
  const [problem, setProblem] = useState('');
  const isCard = a.kind === 'card';
  const set = <K extends keyof MoneyAccount>(k: K, v: MoneyAccount[K]) => setA(prev => {
    const next = { ...prev, [k]: v };
    if (!wordsTouched && (k === 'kind' || k === 'institution')) setWords(suggestedMatchWords(next.kind || 'bank', next.institution || '').join(', '));
    return next;
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanAccount({ ...a, matchWords: words.split(',').map(w => w.trim()).filter(Boolean) });
    if (typeof c === 'string') return setProblem(c);
    onSave(c);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-zinc-950/70 overflow-y-auto" role="dialog" aria-modal="true" aria-label={initial.id ? 'Edit account' : 'Add account'}>
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-auto p-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-black">{initial.id ? 'Edit account' : 'Add account'}</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="p-1 rounded-full hover:bg-zinc-100"><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label} htmlFor="acct-name">Name *</label><input id="acct-name" required className={input} value={a.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. ANZ business cheque" /></div>
          <div><label className={label} htmlFor="acct-kind">Type</label>
            <select id="acct-kind" className={input} value={a.kind} onChange={e => set('kind', e.target.value as AccountKind)}>
              {(Object.keys(ACCOUNT_KINDS) as AccountKind[]).map(k => <option key={k} value={k}>{ACCOUNT_KINDS[k]}</option>)}
            </select></div>
          <div><label className={label} htmlFor="acct-inst">Bank or provider</label><input id="acct-inst" className={input} value={a.institution || ''} onChange={e => set('institution', e.target.value)} placeholder="e.g. BSP, Vodafone" /></div>
          <div><label className={label} htmlFor="acct-num">Last digits</label><input id="acct-num" className={input} value={a.number || ''} onChange={e => set('number', e.target.value)} /></div>
          <div><label className={label} htmlFor="acct-date">Balance on</label><input id="acct-date" type="date" required className={input} value={a.openingDate || ''} onChange={e => set('openingDate', e.target.value)} /></div>
          <div className="col-span-2"><label className={label} htmlFor="acct-open">{isCard ? 'Amount owed on that date (FJD)' : 'Balance on that date (FJD)'}</label>
            <input id="acct-open" type="number" step="0.01" className={input} value={isCard ? -(a.openingBalance || 0) || '' : a.openingBalance ?? ''}
              onChange={e => set('openingBalance', (Number(e.target.value) || 0) * (isCard ? -1 : 1))} />
            <p className="text-[10px] text-zinc-500 mt-1">From your statement, at the start of that day. Everything you record from then on keeps the balance up to date.</p></div>
          <div className="col-span-2"><label className={label} htmlFor="acct-words">Payment methods that mean this account</label>
            <input id="acct-words" className={input} value={words} onChange={e => { setWords(e.target.value); setWordsTouched(true); }} placeholder="e.g. BSP, Bank Transfer" />
            <p className="text-[10px] text-zinc-500 mt-1">Separate with commas. A payment whose method contains one of these goes to this account.</p></div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!a.isDefault} onChange={e => set('isDefault', e.target.checked)} /> Main account (anything that doesn't match another account goes here)</label>
        {initial.id && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!a.archived} onChange={e => set('archived', e.target.checked)} /> Closed (hide it; its history stays)</label>}
        {problem && <p className="text-xs text-rose-600 font-semibold">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save account</button>
        </div>
      </form>
    </div>
  );
}
