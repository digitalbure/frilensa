import React, { useEffect, useState } from 'react';
import { Ban, Copy, KeyRound, Lock, Trash2, Unlock, UserPlus } from 'lucide-react';

type Mode = 'open' | 'invite_only' | 'disabled';
interface Invite {
  code: string; email?: string; plan: string; notes?: string; maxUses: number; uses: number;
  usedBy: { email: string; at: string }[]; createdAt: string; expiresAt?: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const MODES: { id: Mode; label: string; icon: React.ElementType; help: string }[] = [
  { id: 'open', label: 'Open', icon: Unlock, help: 'Anyone can sign up.' },
  { id: 'invite_only', label: 'Invite only', icon: KeyRound, help: 'New accounts need an invite code. People who already have an account are unaffected.' },
  { id: 'disabled', label: 'Closed', icon: Ban, help: 'No new accounts. People who already have an account can still sign in.' }
];

const when = (iso?: string) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Admin panel → Access: who can sign up, and invite codes. Stored and checked by the server (server/access.ts). */
export default function AdminAccessView({ showToast }: { showToast: (msg: string) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', email: '', plan: 'free', maxUses: '1', expiresInDays: '30', notes: '' });
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/admin/access').then(r => json<{ mode: Mode; invites: Invite[] }>(r))
    .then(b => { setMode(b.mode); setInvites(b.invites); setProblem(null); }).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);

  const changeMode = async (m: Mode) => {
    try {
      await json(await fetch('/api/admin/access/mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: m }) }));
      setMode(m);
      showToast(m === 'open' ? 'Sign-ups are open.' : m === 'invite_only' ? 'Sign-ups need an invite code.' : 'Sign-ups are closed.');
    } catch (err: any) { showToast(err.message); }
  };
  const link = (code: string) => `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
  const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => showToast(msg)).catch(() => {});

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { invite } = await json<{ invite: Invite }>(await fetch('/api/admin/access/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }));
      setInvites(list => [invite, ...list]);
      setForm(f => ({ ...f, code: '', email: '', notes: '' }));
      copy(link(invite.code), `Invite ${invite.code} created. The sign-up link is copied.`);
    } catch (err: any) { showToast(err.message); } finally { setBusy(false); }
  };
  const remove = async (inv: Invite) => {
    if (!confirm(`Delete invite ${inv.code}? It stops working; accounts already made with it are unaffected.`)) return;
    try {
      await json(await fetch(`/api/admin/access/invites/${encodeURIComponent(inv.code)}`, { method: 'DELETE' }));
      setInvites(list => list.filter(x => x.code !== inv.code));
    } catch (err: any) { showToast(err.message); }
  };

  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500';
  const label = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';

  return (
    <div className="space-y-5">
      {problem && <p className="text-xs text-rose-300">{problem}</p>}

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Lock className="w-4 h-4 text-sky-400" /> Who can sign up</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Sign-up mode">
          {MODES.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} disabled={mode === null} onClick={() => changeMode(m.id)}
              className={`text-left p-3 rounded-xl border cursor-pointer ${mode === m.id ? 'bg-sky-500/15 border-sky-400' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-100"><m.icon className="w-3.5 h-3.5" /> {m.label}</span>
              <span className="block text-[11px] text-slate-400 mt-1">{m.help}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">Checked by the server and the database rules, so it can't be bypassed from the browser. Platform admins can always sign up.</p>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><UserPlus className="w-4 h-4 text-amber-400" /> Invite codes</h3>
        <form onSubmit={create} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <label className="block"><span className={label}>Code (optional)</span><input className={`${input} font-mono uppercase`} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Made for you" /></label>
          <label className="block"><span className={label}>For email (optional)</span><input type="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Anyone with the code" /></label>
          <label className="block"><span className={label}>Plan</span>
            <select className={input} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="premium">Premium</option></select>
          </label>
          <label className="block"><span className={label}>Uses</span><input type="number" min={1} max={1000} className={input} value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} /></label>
          <label className="block"><span className={label}>Expires after (days)</span><input type="number" min={0} className={input} value={form.expiresInDays} onChange={e => setForm({ ...form, expiresInDays: e.target.value })} placeholder="0 = never" /></label>
          <label className="block"><span className={label}>Note</span><input className={input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Suva workshop" /></label>
          <div className="col-span-2 sm:col-span-3 flex justify-end">
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-50">{busy ? 'Creating…' : 'Create invite'}</button>
          </div>
        </form>

        {invites.length === 0 ? <p className="text-xs text-slate-500">No invites yet.</p> : (
          <ul className="space-y-2">
            {invites.map(inv => {
              const expired = !!inv.expiresAt && inv.expiresAt < new Date().toISOString();
              const usedUp = inv.uses >= inv.maxUses;
              return (
                <li key={inv.code} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-amber-200">{inv.code}</span>
                      <span className="text-[9px] uppercase font-bold bg-slate-800 text-sky-300 px-1.5 py-0.5 rounded">{inv.plan}</span>
                      {(expired || usedUp) && <span className="text-[9px] uppercase font-bold bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded">{usedUp ? 'Used up' : 'Expired'}</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {inv.uses} of {inv.maxUses} used{inv.email ? ` · for ${inv.email}` : ''}{inv.expiresAt ? ` · expires ${when(inv.expiresAt)}` : ''}{inv.notes ? ` · ${inv.notes}` : ''}
                    </p>
                    {inv.usedBy?.length > 0 && <p className="text-[10px] text-slate-500 mt-0.5 break-all">Used by {inv.usedBy.map(u => u.email).join(', ')}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button type="button" onClick={() => copy(link(inv.code), 'Sign-up link copied.')} className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"><Copy className="w-3 h-3" /> Link</button>
                    <button type="button" onClick={() => remove(inv)} className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/10 cursor-pointer" aria-label={`Delete ${inv.code}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
