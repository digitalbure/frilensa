import React, { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import BrandMark from './BrandMark';
import { useBranding } from '../lib/branding';
import { registerAccount, AccessDenied } from '../lib/api';

/** Shown to a new account the server hasn't approved: an invite code box, or "sign-ups are closed". */
export default function AccessGate({ message, needsInvite, onApproved, onSignOut }: {
  message: string;
  needsInvite: boolean;
  onApproved: () => void;
  onSignOut: () => void;
}) {
  const brand = useBranding();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try {
      await registerAccount(code.trim().toUpperCase());
      onApproved();
    } catch (err: any) {
      setProblem(err instanceof AccessDenied || err?.message ? err.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4 text-center shadow-2xl">
        <div className="flex justify-center"><BrandMark size={52} rounded="rounded-2xl" /></div>
        <h1 className="text-lg font-black text-slate-900">{needsInvite ? `${brand.name} is invite-only` : 'Sign-ups are closed'}</h1>
        <p className="text-sm text-slate-600">{message}</p>
        {needsInvite && (
          <form onSubmit={submit} className="space-y-2 text-left">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invite code
              <div className="relative mt-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoFocus placeholder="e.g. FRILENSA-1A2B3C"
                  className="w-full border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-sky-200" />
              </div>
            </label>
            {problem && <p className="text-xs font-semibold text-rose-600">{problem}</p>}
            <button type="submit" disabled={busy || !code.trim()} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold cursor-pointer disabled:opacity-50">
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}
        {(brand.supportEmail) && <p className="text-xs text-slate-500">Need an invite? Email <a className="underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>}
        <button type="button" onClick={onSignOut} className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
      </div>
    </div>
  );
}
