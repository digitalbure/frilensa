import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Pencil, Plus, Receipt, Trash2, Truck, Wallet, X } from 'lucide-react';
import type { CRMData, ExpenseRecord } from '../types';
import {
  AGE_BUCKETS, agedPayables, billOwing, billPaid, billStatus, cleanSupplier, dueDateFor, isBill, ledgerFor, payBill,
  type BillDetails, type BillStatus, type Supplier
} from '../lib/bills';
import { trackAction } from '../lib/analytics';

// Finance → Bills: bills from suppliers that you pay later (in full or in parts), and the supplier list.

interface Props {
  data: CRMData;
  onUpdateData: (d: CRMData) => void;
}

type Bill = ExpenseRecord & { bill: BillDetails };

export const EXPENSE_CATEGORIES = ['Office Supplies', 'Internet & Utilities', 'Software SaaS', 'Travel & Transport', 'Meals & Entertainment', 'Electricity & Utilities',
  'Hardware & Equipment', 'Tax & Licensing', 'Subcontractors', 'Wages & Salaries', 'Marketing & Ads', 'Rent', 'Materials', 'Other Expense'];
const METHODS = ['Bank Transfer', 'BSP Fiji', 'ANZ Fiji', 'Westpac Fiji', 'HFC Bank', 'M-Paisa', 'MyCash', 'Cash', 'Cheque', 'Credit Card'];

const today = () => new Date().toISOString().slice(0, 10);
const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const input = 'w-full bg-white border border-zinc-300 rounded-xl py-2 px-3 text-xs text-zinc-900 focus:outline-none focus:border-emerald-600';
const label = 'block text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1';
const STATUS: Record<BillStatus, { text: string; cls: string }> = {
  unpaid: { text: 'Unpaid', cls: 'bg-amber-50 text-amber-800' },
  part: { text: 'Part paid', cls: 'bg-sky-50 text-sky-800' },
  overdue: { text: 'Overdue', cls: 'bg-rose-50 text-rose-700' },
  paid: { text: 'Paid', cls: 'bg-emerald-50 text-emerald-700' },
  void: { text: 'Void', cls: 'bg-zinc-100 text-zinc-500' }
};

export default function BillsView({ data, onUpdateData }: Props) {
  const [tab, setTab] = useState<'bills' | 'suppliers'>('bills');
  const [filter, setFilter] = useState<'owing' | 'overdue' | 'paid' | 'void' | 'all'>('owing');
  const [editingBill, setEditingBill] = useState<Bill | 'new' | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
  const businessId = data.activeBusinessId || data.businesses[0]?.id || '';
  const now = today();

  const suppliers = (data.suppliers || []).filter(s => !s.businessId || s.businessId === businessId).sort((a, b) => a.name.localeCompare(b.name));
  const bills = (data.expenses || []).filter(isBill).filter(e => !e.businessId || e.businessId === businessId).sort((a, b) => b.date.localeCompare(a.date)) as Bill[];
  const shown = bills.filter(b => {
    const st = billStatus(b, now);
    return filter === 'all' || (filter === 'owing' ? ['unpaid', 'part', 'overdue'].includes(st) : st === filter);
  });
  const aged = useMemo(() => agedPayables(data, now, businessId), [data, now, businessId]);
  const owingTotal = round2(aged.reduce((s, r) => s + r.total, 0));
  const overdueTotal = round2(aged.reduce((s, r) => s + r.total - r.current, 0));
  const supplierName = (b: Bill) => (b.bill.supplierId && suppliers.find(s => s.id === b.bill.supplierId)?.name) || b.vendor;

  /** Saves a bill (and a new supplier with it) in one update, with its payments in the ledger. */
  const saveBill = (e: ExpenseRecord, newSupplier?: Supplier) => {
    const list = data.expenses || [];
    const expenses = list.some(x => x.id === e.id) ? list.map(x => x.id === e.id ? e : x) : [e, ...list];
    const transactions = ledgerFor(data.transactions || [], e, { id: e.id } as any);
    onUpdateData({ ...data, expenses, transactions, ...(newSupplier ? { suppliers: [newSupplier, ...(data.suppliers || [])] } : {}) });
  };
  const onSaveExpense = (e: ExpenseRecord) => saveBill(e);

  const saveSupplier = (s: Supplier) => {
    const list = data.suppliers || [];
    onUpdateData({ ...data, suppliers: list.some(x => x.id === s.id) ? list.map(x => x.id === s.id ? s : x) : [s, ...list] });
    setEditingSupplier(null);
    trackAction('supplier_saved');
  };
  const removeSupplier = (s: Supplier) => {
    if (!confirm(`Remove ${s.name}? Their bills stay, under the name "${s.name}".`)) return;
    onUpdateData({ ...data, suppliers: (data.suppliers || []).filter(x => x.id !== s.id) });
  };
  const voidBill = (b: Bill) => {
    if (billPaid(b) > 0) { alert('This bill has payments. A paid or part-paid bill can\'t be voided; ask the supplier for a credit instead.'); return; }
    const reason = prompt('Why is this bill void? (For example: entered twice, or cancelled by the supplier)');
    if (!reason?.trim()) return;
    onSaveExpense({ ...b, bill: { ...b.bill, voided: { date: now, reason: reason.trim().slice(0, 200) } } });
  };
  const deleteBill = (b: Bill) => {
    if (billPaid(b) > 0) { alert('This bill has payments recorded. Void it instead, or delete the payments first.'); return; }
    if (!confirm('Delete this bill?')) return;
    onUpdateData({ ...data, expenses: (data.expenses || []).filter(e => e.id !== b.id), transactions: (data.transactions || []).filter(t => t.id !== b.id && t.expenseId !== b.id) });
  };

  return (
    <div className="space-y-4" data-testid="bills-view">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2"><Receipt className="w-4 h-4 text-emerald-600" /> Bills and suppliers</h3>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-xl">Bills you pay later. A bill counts as a cost (and its VAT as input VAT) on its date; the money leaves your bank when you pay it, in full or in parts. Things you pay for on the spot are expenses.</p>
          </div>
          <button onClick={() => setEditingBill('new')} className="bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add bill</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-50 rounded-xl p-3"><p className="text-[10px] uppercase font-bold text-zinc-500">You owe</p><p className="font-mono font-black text-sm" data-testid="bills-owing">{fjd(owingTotal)}</p></div>
          <div className={`rounded-xl p-3 ${overdueTotal > 0 ? 'bg-rose-50' : 'bg-zinc-50'}`}><p className="text-[10px] uppercase font-bold text-zinc-500">Overdue</p><p className={`font-mono font-black text-sm ${overdueTotal > 0 ? 'text-rose-700' : ''}`}>{fjd(overdueTotal)}</p></div>
        </div>
        {aged.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" data-testid="aged-payables">
              <thead><tr className="text-[9px] uppercase text-zinc-500 text-left"><th className="py-1">Supplier</th>{AGE_BUCKETS.map(b => <th key={b.key} className="text-right">{b.label}</th>)}<th className="text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {aged.map(r => <tr key={r.id}><td className="py-1 font-bold">{r.name}</td>{AGE_BUCKETS.map(b => <td key={b.key} className={`text-right font-mono pl-3 ${b.key !== 'current' && r[b.key] > 0 ? 'text-rose-700' : ''}`}>{r[b.key] ? r[b.key].toFixed(2) : '—'}</td>)}<td className="text-right font-mono font-bold pl-3">{r.total.toFixed(2)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 text-xs font-bold" role="tablist">
        {(['bills', 'suppliers'] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 py-1.5 rounded-lg ${tab === t ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>
            {t === 'bills' ? `Bills (${bills.length})` : `Suppliers (${suppliers.length})`}
          </button>
        ))}
      </div>

      {tab === 'bills' ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {([['owing', 'To pay'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void'], ['all', 'All']] as const).map(([f, text]) => (
              <button key={f} onClick={() => setFilter(f)} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${filter === f ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600'}`}>{text}</button>
            ))}
          </div>
          {shown.length === 0 ? <p className="text-xs text-zinc-500">{bills.length === 0 ? 'No bills yet. Add one when a supplier gives you an invoice to pay later.' : 'Nothing here.'}</p> : (
            <div className="divide-y divide-zinc-100">
              {shown.map(b => {
                const st = billStatus(b, now);
                return (
                  <div key={b.id} className="py-2.5 flex items-center gap-3 flex-wrap text-xs" data-testid={`bill-${b.bill.number || b.id}`}>
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-bold">{supplierName(b)}{b.bill.number ? <span className="font-normal text-zinc-500"> · {b.bill.number}</span> : ''}</p>
                      <p className="text-[10px] text-zinc-500">{b.description} · dated {b.date} · due {b.bill.dueDate}{b.bill.voided ? ` · void: ${b.bill.voided.reason}` : ''}</p>
                      {b.bill.payments.length > 0 && <p className="text-[10px] text-zinc-500">Paid {b.bill.payments.map(p => `${fjd(p.amount)} on ${p.date}`).join(', ')}</p>}
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <p>{fjd(b.amount)}</p>
                      {st !== 'paid' && st !== 'void' && <p className="text-amber-700">owing {fjd(billOwing(b))}</p>}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[st].cls}`}>{STATUS[st].text}</span>
                    <div className="flex items-center gap-1">
                      {st !== 'paid' && st !== 'void' && <button onClick={() => setPaying(b)} className="text-[11px] font-bold bg-emerald-600 text-white rounded-lg px-2.5 py-1 flex items-center gap-1"><Wallet className="w-3 h-3" /> Pay</button>}
                      {st !== 'void' && <button onClick={() => setEditingBill(b)} aria-label={`Edit bill ${b.bill.number || ''}`} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><Pencil className="w-3.5 h-3.5" /></button>}
                      {st !== 'void' && billPaid(b) === 0 && <button onClick={() => voidBill(b)} aria-label="Void bill" title="Void" className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><Ban className="w-3.5 h-3.5" /></button>}
                      {billPaid(b) === 0 && <button onClick={() => deleteBill(b)} aria-label="Delete bill" className="p-1.5 rounded-lg border border-zinc-200 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-[11px] text-zinc-500">The businesses and people you buy from.</p>
            <button onClick={() => setEditingSupplier({ businessId, paymentTermsDays: 30 })} className="bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add supplier</button>
          </div>
          {suppliers.length === 0 ? <p className="text-xs text-zinc-500">No suppliers yet.</p> : (
            <div className="divide-y divide-zinc-100">
              {suppliers.map(s => {
                const owing = aged.find(r => r.id === s.id)?.total || 0;
                return (
                  <div key={s.id} className="py-2.5 flex items-center gap-3 flex-wrap text-xs">
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-bold flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-zinc-400" /> {s.name}</p>
                      <p className="text-[10px] text-zinc-500">{[s.tin && `TIN ${s.tin}`, s.vatRegistered && 'VAT registered', s.email, s.phone, `pay in ${s.paymentTermsDays ?? 30} days`].filter(Boolean).join(' · ')}</p>
                    </div>
                    {owing > 0 && <span className="font-mono text-[11px] text-amber-700">owing {fjd(owing)}</span>}
                    <button onClick={() => setEditingSupplier(s)} aria-label={`Edit ${s.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeSupplier(s)} aria-label={`Remove ${s.name}`} className="p-1.5 rounded-lg border border-zinc-200 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editingSupplier && <SupplierForm initial={editingSupplier} onCancel={() => setEditingSupplier(null)} onSave={saveSupplier} />}
      {editingBill && <BillForm data={data} businessId={businessId} suppliers={suppliers} existing={editingBill === 'new' ? null : editingBill}
        onCancel={() => setEditingBill(null)}
        onSave={(e, s) => { saveBill(e, s); trackAction(editingBill === 'new' ? 'bill_added' : 'bill_edited'); setEditingBill(null); }} />}
      {paying && <PayForm bill={paying} accounts={(data.bankAccounts || []).filter(a => !a.archived && (!a.businessId || a.businessId === businessId))} onCancel={() => setPaying(null)} onSave={e => { onSaveExpense(e); trackAction('bill_paid'); setPaying(null); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-zinc-950/70 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <h3 className="text-sm font-black text-zinc-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-zinc-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function SupplierForm({ initial, onCancel, onSave }: { initial: Partial<Supplier>; onCancel: () => void; onSave: (s: Supplier) => void }) {
  const [s, setS] = useState<Partial<Supplier>>(initial);
  const [problem, setProblem] = useState('');
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => setS(prev => ({ ...prev, [k]: v }));
  return (
    <Modal title={initial.id ? 'Edit supplier' : 'Add supplier'} onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); const c = cleanSupplier(s); if (typeof c === 'string') setProblem(c); else onSave(c); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label} htmlFor="sup-name">Name *</label><input id="sup-name" required className={input} value={s.name || ''} onChange={e => set('name', e.target.value)} /></div>
          <div><label className={label} htmlFor="sup-tin">TIN</label><input id="sup-tin" className={input} value={s.tin || ''} onChange={e => set('tin', e.target.value)} /></div>
          <div><label className={label} htmlFor="sup-terms">Pay within (days)</label><input id="sup-terms" type="number" min="0" max="365" className={input} value={s.paymentTermsDays ?? 30} onChange={e => set('paymentTermsDays', Number(e.target.value))} /></div>
          <div><label className={label} htmlFor="sup-email">Email</label><input id="sup-email" type="email" className={input} value={s.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div><label className={label} htmlFor="sup-phone">Phone</label><input id="sup-phone" className={input} value={s.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          <div className="col-span-2"><label className={label} htmlFor="sup-address">Address</label><input id="sup-address" className={input} value={s.address || ''} onChange={e => set('address', e.target.value)} /></div>
          <div><label className={label} htmlFor="sup-cat">Usual category</label><select id="sup-cat" className={input} value={s.defaultCategory || ''} onChange={e => set('defaultCategory', e.target.value)}><option value="">None</option>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className={label} htmlFor="sup-contact">Contact person</label><input id="sup-contact" className={input} value={s.contactPerson || ''} onChange={e => set('contactPerson', e.target.value)} /></div>
          <div className="col-span-2"><label className={label} htmlFor="sup-bank">Their bank or M-PAiSA details</label><input id="sup-bank" className={input} value={s.bankDetails || ''} onChange={e => set('bankDetails', e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!s.vatRegistered} onChange={e => set('vatRegistered', e.target.checked)} /> VAT registered (their bills include VAT you can claim)</label>
        {problem && <p className="text-xs text-rose-600 font-semibold">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save supplier</button>
        </div>
      </form>
    </Modal>
  );
}

function BillForm({ data, businessId, suppliers, existing, onCancel, onSave }: {
  data: CRMData; businessId: string; suppliers: Supplier[]; existing: Bill | null;
  onCancel: () => void; onSave: (e: ExpenseRecord, newSupplier?: Supplier) => void;
}) {
  const vatRate = Number(data.userProfile?.defaultVatRate ?? 12.5) || 12.5;
  const [supplierId, setSupplierId] = useState(existing?.bill.supplierId || '');
  const [newSupplier, setNewSupplier] = useState(existing && !existing.bill.supplierId ? existing.vendor : '');
  const supplier = suppliers.find(s => s.id === supplierId);
  const [number, setNumber] = useState(existing?.bill.number || '');
  const [date, setDate] = useState(existing?.date || today());
  const [dueDate, setDueDate] = useState(existing?.bill.dueDate || dueDateFor(today(), 30));
  const [dueTouched, setDueTouched] = useState(!!existing);
  const [description, setDescription] = useState(existing?.description || '');
  const [category, setCategory] = useState(existing?.category || 'Other Expense');
  const [amount, setAmount] = useState(existing?.amount || 0);
  const [vat, setVat] = useState<number | null>(existing ? existing.vatAmount ?? 0 : null);
  const [claimable, setClaimable] = useState(existing ? !!existing.isVatClaimable : true);
  const [projectId, setProjectId] = useState(existing?.projectId || '');
  const [problem, setProblem] = useState('');
  const autoVat = round2(amount * vatRate / (100 + vatRate));
  const vatShown = vat ?? (supplier?.vatRegistered === false ? 0 : autoVat);
  const projects = (data.projects || []).filter(p => !p.businessId || p.businessId === businessId);

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find(x => x.id === id);
    if (s) {
      if (!dueTouched) setDueDate(dueDateFor(date, s.paymentTermsDays ?? 30));
      if (s.defaultCategory && !existing) setCategory(s.defaultCategory);
      if (vat === null && s.vatRegistered === false) setClaimable(false);
    }
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!supplierId && !newSupplier.trim()) return setProblem('Choose or name the supplier.');
    if (!(amount > 0)) return setProblem('Enter the bill total.');
    if (dueDate < date) return setProblem('The due date is before the bill date.');
    if (existing && amount < billPaid(existing) - 0.004) return setProblem(`More than that has been paid already (${billPaid(existing).toFixed(2)}).`);
    let sid = supplierId;
    let vendor = supplier?.name || newSupplier.trim();
    let added: Supplier | undefined;
    if (!sid) {
      const s = cleanSupplier({ name: newSupplier, businessId, paymentTermsDays: 30 });
      if (typeof s === 'string') return setProblem(s);
      added = s; sid = s.id; vendor = s.name;
    }
    const vatAmount = claimable ? Math.min(amount, Math.max(0, round2(vatShown))) : 0;
    onSave({
      ...(existing || {}),
      id: existing?.id || `exp-bill-${Date.now()}`,
      date, vendor, description: description.trim() || `Bill from ${vendor}${number ? ` (${number})` : ''}`,
      amount: round2(amount), category, paymentMethod: 'Bill', vatAmount: vatAmount || undefined, isVatClaimable: vatAmount > 0, isTaxDeductible: true,
      businessId, projectId: projectId || undefined, currency: data.userProfile?.defaultCurrency || 'FJD', supplierId: sid,
      createdAt: existing?.createdAt || new Date().toISOString(),
      bill: { ...(existing?.bill || { payments: [] }), supplierId: sid, number: number.trim() || undefined, dueDate }
    } as ExpenseRecord, added);
  };

  return (
    <Modal title={existing ? 'Edit bill' : 'Add bill'} onClose={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={label} htmlFor="bill-supplier">Supplier *</label>
            <select id="bill-supplier" className={input} value={supplierId} onChange={e => pickSupplier(e.target.value)}>
              <option value="">{suppliers.length ? 'New supplier…' : 'New supplier'}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!supplierId && <input aria-label="New supplier name" className={`${input} mt-2`} value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder="Supplier name" />}
          </div>
          <div><label className={label} htmlFor="bill-number">Their invoice no.</label><input id="bill-number" className={input} value={number} onChange={e => setNumber(e.target.value)} /></div>
          <div><label className={label} htmlFor="bill-cat">Category</label><select id="bill-cat" className={input} value={category} onChange={e => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className={label} htmlFor="bill-date">Bill date *</label><input id="bill-date" type="date" required className={input} value={date} onChange={e => { setDate(e.target.value); if (!dueTouched) setDueDate(dueDateFor(e.target.value, supplier?.paymentTermsDays ?? 30)); }} /></div>
          <div><label className={label} htmlFor="bill-due">Due *</label><input id="bill-due" type="date" required className={input} value={dueDate} onChange={e => { setDueDate(e.target.value); setDueTouched(true); }} /></div>
          <div className="col-span-2"><label className={label} htmlFor="bill-desc">What for</label><input id="bill-desc" className={input} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Lighting hire, October" /></div>
          <div><label className={label} htmlFor="bill-amount">Total incl. VAT (FJD) *</label><input id="bill-amount" type="number" min="0" step="0.01" required className={input} value={amount || ''} onChange={e => setAmount(Number(e.target.value) || 0)} /></div>
          <div><label className={label} htmlFor="bill-vat">VAT in it</label><input id="bill-vat" type="number" min="0" step="0.01" className={input} disabled={!claimable} value={claimable ? vatShown : 0} onChange={e => setVat(e.target.value === '' ? null : Number(e.target.value))} /></div>
          {projects.length > 0 && <div className="col-span-2"><label className={label} htmlFor="bill-project">Project</label><select id="bill-project" className={input} value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">None</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={claimable} onChange={e => setClaimable(e.target.checked)} /> Claim the VAT (it's a tax invoice from a VAT-registered supplier)</label>
        {problem && <p className="text-xs text-rose-600 font-semibold">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 text-white">Save bill</button>
        </div>
      </form>
    </Modal>
  );
}

function PayForm({ bill, accounts, onCancel, onSave }: { bill: Bill; accounts: import('../lib/accounts').MoneyAccount[]; onCancel: () => void; onSave: (e: ExpenseRecord) => void }) {
  const [accountId, setAccountId] = useState(accounts.find(a => a.isDefault)?.id || '');
  const owing = billOwing(bill);
  const [amount, setAmount] = useState(owing);
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [problem, setProblem] = useState('');
  return (
    <Modal title={`Pay ${bill.vendor}${bill.bill.number ? ` (${bill.bill.number})` : ''}`} onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); const r = payBill(bill, { amount, date, method, ...(accountId ? { accountId } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) }); if (typeof r === 'string') setProblem(r); else onSave(r); }} className="space-y-3">
        <p className="text-xs text-zinc-600">Owing <strong className="font-mono">{fjd(owing)}</strong> of {fjd(bill.amount)}. Pay less to record a part payment.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="pay-amount">Amount (FJD)</label><input id="pay-amount" type="number" min="0" step="0.01" required className={input} value={amount || ''} onChange={e => setAmount(Number(e.target.value) || 0)} /></div>
          <div><label className={label} htmlFor="pay-date">Paid on</label><input id="pay-date" type="date" required className={input} value={date} onChange={e => setDate(e.target.value || today())} /></div>
          <div><label className={label} htmlFor="pay-method">Paid by</label><select id="pay-method" className={input} value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label className={label} htmlFor="pay-ref">Reference</label><input id="pay-ref" className={input} value={reference} onChange={e => setReference(e.target.value)} /></div>
          {accounts.length > 0 && <div className="col-span-2"><label className={label} htmlFor="pay-account">From account</label>
            <select id="pay-account" className={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Match by payment method</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>}
        </div>
        {problem && <p className="text-xs text-rose-600 font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs font-bold px-3 py-2 rounded-xl border border-zinc-300">Cancel</button>
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white">Record payment</button>
        </div>
      </form>
    </Modal>
  );
}
