import React, { useState } from 'react';
import { AlertTriangle, Download, Trash2, UserX } from 'lucide-react';
import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { clearLocalBackup } from '../lib/db';
import { LegalLinks } from './LegalPage';

/** Settings → Your account: privacy links and "Delete my account" (server/account.ts). */
export default function DeleteAccountCard({ onDownloadBackup }: { onDownloadBackup: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const user = auth.currentUser;
  const usesPassword = !!user?.providerData.some(p => p.providerId === 'password');
  const usesGoogle = !!user?.providerData.some(p => p.providerId === 'google.com');

  const remove = async () => {
    if (!user) return;
    setBusy(true); setProblem(null);
    try {
      // A fresh sign-in, so an unattended open session can't delete the account.
      if (usesPassword) await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email || '', password));
      else if (usesGoogle) await reauthenticateWithPopup(user, new GoogleAuthProvider());
      const token = await user.getIdToken(true);
      const res = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirm: typed }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Could not delete your account (${res.status}).`);
      clearLocalBackup(user.uid);
      await signOut(auth).catch(() => {});
      window.location.href = '/?accountDeleted=1';
    } catch (err: any) {
      const code = err?.code || '';
      setProblem(code === 'auth/wrong-password' || code === 'auth/invalid-credential' ? 'That password isn’t right.'
        : code === 'auth/popup-closed-by-user' ? 'Sign in with Google to confirm.'
        : err?.message || 'Something went wrong. Nothing was deleted.');
    } finally { setBusy(false); }
  };

  const ready = typed.trim().toUpperCase() === 'DELETE' && (!usesPassword || password.length > 0);

  return (
    <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-3 text-xs text-zinc-600">
      <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
        <UserX className="w-3.5 h-3.5 text-zinc-400" /> Your account
      </span>
      <p className="text-[11px] text-zinc-500">How Frilensa uses your information: <LegalLinks className="text-[11px] text-zinc-500" /></p>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" /> Delete my account
        </button>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2.5">
          <p className="flex items-start gap-1.5 text-[11px] text-rose-900 font-semibold"><AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" /> This permanently deletes your account and everything in it. It can't be undone.</p>
          <ul className="list-disc pl-5 text-[11px] text-rose-900/90 space-y-0.5">
            <li>All your businesses, clients, quotes, invoices, receipts, projects, services, expenses and bookkeeping.</li>
            <li>Online invoice links, client portal access, booking pages, rate cards, directory and marketplace listings.</li>
            <li>Uploaded receipts and files, API keys, connected apps, webhooks and PayPal connection.</li>
            <li>Your sign-in.</li>
          </ul>
          <p className="text-[11px] text-rose-900/90">Issued tax invoices are business records you may need to keep. Download a backup first.</p>
          <button type="button" onClick={onDownloadBackup} className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer"><Download className="w-3.5 h-3.5" /> Download backup</button>
          <label className="block text-[10px] font-bold text-rose-900 uppercase">Type DELETE to confirm
            <input value={typed} onChange={e => setTyped(e.target.value)} className="w-full mt-1 bg-white border border-rose-200 rounded-lg py-1.5 px-2 text-xs font-mono" autoComplete="off" />
          </label>
          {usesPassword && (
            <label className="block text-[10px] font-bold text-rose-900 uppercase">Your password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full mt-1 bg-white border border-rose-200 rounded-lg py-1.5 px-2 text-xs" autoComplete="current-password" />
            </label>
          )}
          {!usesPassword && usesGoogle && <p className="text-[10px] text-rose-900/80">You'll be asked to sign in with Google to confirm.</p>}
          {problem && <p className="text-[11px] font-bold text-rose-700">{problem}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); setTyped(''); setPassword(''); setProblem(null); }} className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-600 font-bold text-[11px] cursor-pointer">Cancel</button>
            <button type="button" disabled={!ready || busy} onClick={remove} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer disabled:opacity-50">{busy ? 'Deleting…' : 'Delete everything'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
