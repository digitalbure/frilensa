import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, RefreshCw, Trash2 } from 'lucide-react';

interface ClientError {
  id: string; email: string; message: string; stack: string; componentStack: string; screen: string;
  appVersion: string; userAgent: string; count: number; firstSeen: string; lastSeen: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const when = (iso: string) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/** Admin panel → App errors: crashes users hit ("This screen couldn't be shown"), newest first. */
export default function AdminErrorsView({ showToast }: { showToast: (msg: string) => void }) {
  const [errors, setErrors] = useState<ClientError[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => fetch('/api/admin/errors').then(r => json<{ errors: ClientError[] }>(r))
    .then(b => { setErrors(b.errors); setProblem(null); }).catch(err => setProblem(err.message));
  useEffect(() => { load(); }, []);

  const remove = async (e: ClientError) => {
    try { await json(await fetch(`/api/admin/errors/${e.id}`, { method: 'DELETE' })); setErrors(list => (list || []).filter(x => x.id !== e.id)); }
    catch (err: any) { showToast(err.message); }
  };
  const clearAll = async () => {
    if (!confirm('Clear every error report?')) return;
    try { await json(await fetch('/api/admin/errors', { method: 'DELETE' })); setErrors([]); showToast('Error reports cleared.'); }
    catch (err: any) { showToast(err.message); }
  };
  const copy = (e: ClientError) => {
    const text = [`${e.message}`, `Screen: ${e.screen} · Version: ${e.appVersion} · ${e.count}× · last ${e.lastSeen}`, '', e.stack, '', e.componentStack].join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Copied. Paste it to whoever is fixing it.')).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> App errors</h3>
          <p className="text-xs text-slate-400 mt-1">When a screen shows "This screen couldn't be shown", the details arrive here. Repeats from the same person are counted on one row. Copy a report and paste it into a chat to get it fixed.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={load} className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          {!!errors?.length && <button type="button" onClick={clearAll} className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 text-xs font-bold cursor-pointer">Clear all</button>}
        </div>
      </div>

      {problem && <p className="text-xs text-rose-300">{problem}</p>}
      {errors && errors.length === 0 && <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl p-5">No errors reported. 🎉</p>}

      {errors && errors.length > 0 && (
        <ul className="space-y-2">
          {errors.map(e => (
            <li key={e.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-amber-200 break-words">{e.message}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {e.screen || 'unknown screen'} · v{e.appVersion || '?'} · {e.email || 'unknown user'} · {e.count}× · last {when(e.lastSeen)}{e.count > 1 ? `, first ${when(e.firstSeen)}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-bold cursor-pointer">{open === e.id ? 'Hide details' : 'Details'}</button>
                  <button type="button" onClick={() => copy(e)} className="p-1.5 rounded-lg bg-slate-800 text-slate-200 cursor-pointer" aria-label="Copy report"><Copy className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => remove(e)} className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/10 cursor-pointer" aria-label="Delete report"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {open === e.id && (
                <pre className="text-[10px] leading-relaxed bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words text-slate-400">{e.stack}{e.componentStack ? `\n\nScreen components:${e.componentStack}` : ''}{`\n\n${e.userAgent}`}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
