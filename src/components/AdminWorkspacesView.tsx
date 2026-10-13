import React, { useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';

export interface AdminWorkspace {
  uid: string; name: string; email: string; plan: 'free' | 'pro' | 'premium' | string; businesses: string[];
  clients: number; documents: number; projects: number; updatedAt: string; signedUpAt: string; lastSignInAt: string; disabled: boolean;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const when = (iso: string) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Admin panel → Workspaces: every real Frilensa account, with its plan and what's in it. */
export default function AdminWorkspacesView({ workspaces, error, onReload, onChangePlan }: {
  workspaces: AdminWorkspace[] | null;
  error: string | null;
  onReload: () => void;
  onChangePlan: (w: AdminWorkspace, plan: string) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = (workspaces || []).filter(w => !needle || [w.name, w.email, ...w.businesses].some(x => (x || '').toLowerCase().includes(needle)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or business"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-200 focus:outline-none focus:border-sky-500" />
        </div>
        <button type="button" onClick={onReload} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}
      {!workspaces && !error && <p className="text-xs text-slate-400">Loading workspaces…</p>}
      {workspaces && shown.length === 0 && <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl p-5">{workspaces.length ? 'No workspaces match.' : 'No workspaces yet.'}</p>}

      <div className="space-y-2">
        {shown.map(w => (
          <div key={w.uid} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-100">{w.name || w.email || 'Unnamed workspace'}</span>
                {w.disabled && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-rose-950 text-rose-300">Account disabled</span>}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 break-all">{w.email}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {w.businesses.length ? w.businesses.slice(0, 3).join(', ') + (w.businesses.length > 3 ? ` and ${w.businesses.length - 3} more` : '') : 'No business yet'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {n(w.clients, 'client', 'clients')} · {n(w.documents, 'document', 'documents')} · {n(w.projects, 'project', 'projects')} · Joined {when(w.signedUpAt)} · Last signed in {when(w.lastSignInAt)} · Last saved {when(w.updatedAt)}
              </p>
            </div>
            <label className="flex items-center gap-2 self-end sm:self-center text-[10px] text-slate-400 shrink-0">
              Plan
              <select value={w.plan} onChange={e => onChangePlan(w, e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-[11px] text-slate-200">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
