import React from 'react';
import type { CRMData } from '../types';
import { resolveAccount } from '../lib/accounts';

// Which bank, cash, card or mobile money account a payment went through. Shown only once the business has
// accounts (Finance → Accounts). Left empty, the money goes where its payment method points.

export default function AccountSelect({ data, businessId, method, value, onChange, label = 'Account', className = '', id = 'account-select' }: {
  data: CRMData; businessId?: string; method?: string; value: string; onChange: (accountId: string) => void;
  label?: string; className?: string; id?: string;
}) {
  const accounts = (data.bankAccounts || []).filter(a => !a.archived && (!businessId || !a.businessId || a.businessId === businessId));
  if (!accounts.length) return null;
  const auto = resolveAccount(accounts, { method, businessId });
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[9px] font-black uppercase text-slate-500 block">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className={className || 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900'}>
        <option value="">{auto ? `Match by payment method (${auto.name})` : 'Match by payment method'}</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}
