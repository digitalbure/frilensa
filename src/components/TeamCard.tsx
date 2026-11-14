import React, { useEffect, useState } from 'react';
import { BookOpen, Copy, LogOut, Trash2, UserPlus, Users } from 'lucide-react';
import { sharedWorkspace } from '../lib/db';
import {
  ROLE_NAMES, cancelInvite, changeRole, inviteToTeam, leaveBooks, loadTeam, openBooks, removeMember,
  type TeamRole, type TeamState
} from '../lib/team';
import { trackAction } from '../lib/analytics';

// Settings → Team and accountant: invite your accountant or a bookkeeper to your books, and open books
// others have shared with you.

const input = 'w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-sky-600';

export default function TeamCard() {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [problem, setProblem] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('viewer');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const shared = sharedWorkspace();

  const load = () => loadTeam().then(setTeam).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setProblem(''); setBusy(true);
    try { await fn(); await load(); } catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };
  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await inviteToTeam(email.trim(), role);
      setLink(`${window.location.origin}${r.link}`);
      setEmail('');
      trackAction(`team_invite_${role}`);
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4" data-testid="team-card">
      <div>
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-sky-600" /> Team and accountant</h3>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xl">Share your books with your accountant or a bookkeeper. They sign in with their own free account; you choose whether they can only look or also make changes, and you can remove them at any time.</p>
      </div>

      {shared ? (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs space-y-2">
          <p>You're in <strong>{shared.ownerName}</strong>'s books as {ROLE_NAMES[shared.role].name.toLowerCase()}.</p>
          <button onClick={() => openBooks(null)} className="text-xs font-bold bg-slate-900 text-white rounded-xl px-3 py-1.5">Back to my books</button>
        </div>
      ) : (
        <>
          <form onSubmit={invite} className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div><label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1" htmlFor="team-email">Invite by email</label>
              <input id="team-email" type="email" required className={input} value={email} onChange={e => setEmail(e.target.value)} placeholder="accountant@example.com" /></div>
            <select aria-label="What they can do" className={input} value={role} onChange={e => setRole(e.target.value as TeamRole)}>
              {(Object.keys(ROLE_NAMES) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_NAMES[r].name}</option>)}
            </select>
            <button type="submit" disabled={busy} className="text-xs font-bold bg-slate-900 text-white rounded-xl px-3 py-2 flex items-center gap-1 justify-center disabled:opacity-50"><UserPlus className="w-3.5 h-3.5" /> Invite</button>
          </form>
          <p className="text-[10px] text-slate-500">{ROLE_NAMES[role].can} They won't see your AI assistant chats, and sending to clients, online payments and the marketplace stay with you.</p>
          {link && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] space-y-1.5" role="status">
              <p>Invitation sent by email. You can also send them this link (it works once, for their email address, for 14 days):</p>
              <div className="flex gap-2"><input readOnly aria-label="Invitation link" className={`${input} font-mono`} value={link} onFocus={e => e.target.select()} />
                <button type="button" onClick={() => navigator.clipboard?.writeText(link)} className="text-[11px] font-bold border border-emerald-300 rounded-lg px-2 flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button></div>
            </div>
          )}

          {team && (team.members.length > 0 || team.invites.length > 0) && (
            <div className="divide-y divide-slate-100" data-testid="team-members">
              {team.members.map(m => (
                <div key={m.memberUid} className="py-2 flex items-center gap-2 flex-wrap text-xs">
                  <span className="flex-1 min-w-[160px]"><strong>{m.name || m.email}</strong>{m.name && <span className="text-slate-500"> · {m.email}</span>}</span>
                  <select aria-label={`Access for ${m.email}`} className="bg-white border border-slate-300 rounded-lg py-1 px-1.5 text-[11px]" value={m.role} onChange={e => run(() => changeRole(m.memberUid, e.target.value as TeamRole))}>
                    {(Object.keys(ROLE_NAMES) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_NAMES[r].name}</option>)}
                  </select>
                  <button onClick={() => confirm(`Remove ${m.email}'s access to your books?`) && run(() => removeMember(m.memberUid))} aria-label={`Remove ${m.email}`} className="p-1.5 rounded-lg border border-slate-200 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {team.invites.map(i => (
                <div key={i.id} className="py-2 flex items-center gap-2 flex-wrap text-xs text-slate-600">
                  <span className="flex-1 min-w-[160px]">{i.email} · <em>invited</em>, {ROLE_NAMES[i.role].name.toLowerCase()} · until {i.expiresAt.slice(0, 10)}</span>
                  <button onClick={() => run(() => cancelInvite(i.id))} className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1">Cancel invite</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {team && team.sharedWithMe.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Books shared with you</h4>
          {team.sharedWithMe.map(s => (
            <div key={s.ownerUid} className="flex items-center gap-2 flex-wrap text-xs">
              <span className="flex-1 min-w-[160px]"><strong>{s.ownerName}</strong> · {ROLE_NAMES[s.role].name.toLowerCase()}</span>
              {shared?.ownerUid !== s.ownerUid && <button onClick={() => { trackAction('team_open_books'); openBooks(s.ownerUid); }} className="text-[11px] font-bold bg-sky-600 text-white rounded-lg px-2.5 py-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Open</button>}
              <button onClick={() => confirm(`Leave ${s.ownerName}'s books? You'll need a new invitation to open them again.`) && run(async () => { await leaveBooks(s.ownerUid); if (shared?.ownerUid === s.ownerUid) openBooks(null); })} className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1 flex items-center gap-1"><LogOut className="w-3 h-3" /> Leave</button>
            </div>
          ))}
        </div>
      )}
      {problem && <p className="text-xs text-rose-600 font-semibold">{problem}</p>}
    </section>
  );
}
