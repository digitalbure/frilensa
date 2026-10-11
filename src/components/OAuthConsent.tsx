import { useEffect, useMemo, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { getOAuthClient, approveOAuth } from '../lib/api';

interface Props {
  email?: string | null;
  onSignOut: () => void;
}

/**
 * Consent page for connecting an app (e.g. Claude) to Frilensa: /oauth/authorize?client_id=…
 * The server checks the client and redirect address before anything is shown or sent.
 */
export default function OAuthConsent({ email, onSignOut }: Props) {
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(window.location.search)), []);
  const [client, setClient] = useState<{ clientName: string; redirectHost: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wantsDrafts = !params.scope || params.scope.split(/\s+/).includes('draft');
  const [access, setAccess] = useState<'draft' | 'read'>(wantsDrafts ? 'draft' : 'read');

  useEffect(() => {
    if (!params.client_id || !params.redirect_uri) {
      setError("This connection request is incomplete. Start again from the app you're connecting.");
      return;
    }
    getOAuthClient(params.client_id, params.redirect_uri).then(setClient).catch(err => setError(err.message));
  }, [params]);

  const decide = async (decision: 'allow' | 'deny') => {
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = await approveOAuth({ ...params, decision, access });
      window.location.href = redirectTo;
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Connect to Frilensa</h1>
            <p className="text-[11px] text-slate-500">Signed in as {email || 'you'}</p>
          </div>
        </div>

        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}

        {!client && !error && <p className="text-xs text-slate-500">Checking the request…</p>}

        {client && (
          <>
            <p className="text-sm text-slate-700">
              <span className="font-bold">{client.clientName}</span> wants to use your Frilensa workspace.
              You'll go back to <span className="font-mono text-xs">{client.redirectHost}</span> afterwards.
            </p>

            <fieldset className="space-y-2">
              <legend className="text-[11px] font-semibold text-slate-500 mb-1">Allow it to</legend>
              {wantsDrafts && (
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="radio" name="access" checked={access === 'draft'} onChange={() => setAccess('draft')} className="mt-0.5" />
                  <span><span className="font-semibold">Read and create drafts.</span> See your clients, quotes, invoices, expenses and summaries; add clients, draft quotes and invoices, and expenses.</span>
                </label>
              )}
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="radio" name="access" checked={access === 'read'} onChange={() => setAccess('read')} className="mt-0.5" />
                <span><span className="font-semibold">Read only.</span> See your records without changing anything.</span>
              </label>
            </fieldset>

            <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-emerald-600" />
              It can't send anything to your clients or mark anything paid. You can disconnect it any time in Settings → API keys and AI assistants.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" disabled={busy} onClick={() => decide('deny')} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-60">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => decide('allow')} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer disabled:opacity-60">
                {busy ? 'Connecting…' : 'Allow'}
              </button>
            </div>
          </>
        )}

        <button type="button" onClick={onSignOut} className="text-[11px] text-slate-500 underline cursor-pointer">
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
