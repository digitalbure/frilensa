import React, { useEffect, useState } from 'react';
import { Copy, Webhook } from 'lucide-react';

interface Hook { id: string; url: string; events: string[]; createdAt: string; active: boolean }
interface Delivery { id: string; event: string; status: 'pending' | 'delivered' | 'failed'; attempts: number; lastStatus: number | null; lastError: string; createdAt: string; test: boolean }

const EVENT_LABEL: Record<string, string> = {
  'booking_request.created': 'New booking request',
  'booking_request.stage_changed': 'Booking moved stage (quoted, accepted, invoiced, paid…)'
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

/** Settings → API → Webhooks: endpoints that receive booking events as they happen. */
export default function WebhooksCard() {
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(Object.keys(EVENT_LABEL));
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => fetch('/api/webhooks').then(r => json<{ configured: boolean; webhooks: Hook[] }>(r))
    .then(b => { setHooks(b.webhooks); setConfigured(b.configured); }).catch(() => setHooks([]));
  useEffect(() => { load(); }, []);
  const flash = (text: string, ok = true) => { setNotice({ text, ok }); setTimeout(() => setNotice(null), 6000); };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await json<{ webhook: Hook; secret: string }>(await fetch('/api/webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, events }) }));
      setSecret({ id: r.webhook.id, value: r.secret });
      setUrl('');
      await load();
    } catch (err: any) {
      flash(err.message, false);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (h: Hook) => {
    if (!confirm(`Stop sending events to ${h.url}?`)) return;
    try { await json(await fetch(`/api/webhooks/${h.id}`, { method: 'DELETE' })); await load(); } catch (err: any) { flash(err.message, false); }
  };
  const showDeliveries = async (h: Hook) => {
    try { const r = await json<{ deliveries: Delivery[] }>(await fetch(`/api/webhooks/${h.id}/deliveries`)); setDeliveries(d => ({ ...d, [h.id]: r.deliveries })); } catch (err: any) { flash(err.message, false); }
  };
  const test = async (h: Hook) => {
    try {
      const r = await json<{ delivery: { status: string; lastStatus: number | null; lastError: string } }>(await fetch(`/api/webhooks/${h.id}/test`, { method: 'POST' }));
      flash(r.delivery.status === 'delivered' ? `Test delivered (HTTP ${r.delivery.lastStatus}).` : `Test failed: ${r.delivery.lastError || 'no response'}.`, r.delivery.status === 'delivered');
      await showDeliveries(h);
    } catch (err: any) { flash(err.message, false); }
  };

  return (
    <section className="bg-white rounded-xl p-5 border border-zinc-200 shadow-xs space-y-3">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2"><Webhook className="w-4 h-4 text-sky-600" /> Webhooks</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Tell your website or app the moment a booking arrives or moves on (quoted, accepted, invoiced, paid). Each delivery is signed with your endpoint's secret and retried for up to 24 hours. Apps can also keep checking the bookings API.
        </p>
      </div>
      {!configured && <p className="text-[11px] text-amber-700">Webhooks aren't set up on this server yet.</p>}

      {secret && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-1.5">
          <p className="font-semibold text-amber-900">Copy this signing secret now. It won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all font-mono text-[11px] bg-white border border-amber-200 rounded px-2 py-1">{secret.value}</code>
            <button type="button" onClick={() => navigator.clipboard.writeText(secret.value).catch(() => {})} className="p-1.5 text-amber-900 cursor-pointer" aria-label="Copy secret"><Copy className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-[11px] text-amber-900">Check the <code>Frilensa-Signature</code> header (t=timestamp, v1=HMAC-SHA256 of "timestamp.body") with it. See docs/API.md.</p>
          <button type="button" onClick={() => setSecret(null)} className="text-[11px] font-bold text-amber-900 underline cursor-pointer">I've saved it</button>
        </div>
      )}

      {hooks && hooks.length > 0 && (
        <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-lg">
          {hooks.map(h => (
            <li key={h.id} className="px-3 py-2 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-zinc-800 break-all">{h.url}</p>
                  <p className="text-[11px] text-zinc-500">{h.events.map(e => EVENT_LABEL[e] || e).join(' · ')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => test(h)} className="px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-700 text-[11px] font-bold cursor-pointer">Send test</button>
                  <button type="button" onClick={() => deliveries[h.id] ? setDeliveries(d => { const n = { ...d }; delete n[h.id]; return n; }) : showDeliveries(h)} className="px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-700 text-[11px] font-bold cursor-pointer">{deliveries[h.id] ? 'Hide' : 'Recent deliveries'}</button>
                  <button type="button" onClick={() => remove(h)} className="px-2 py-1 text-rose-600 text-[11px] font-bold cursor-pointer">Delete</button>
                </div>
              </div>
              {deliveries[h.id] && (
                deliveries[h.id].length === 0 ? <p className="text-[11px] text-zinc-400">Nothing sent yet.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-zinc-400 text-left"><th className="py-1 pr-2 font-semibold">When</th><th className="py-1 pr-2 font-semibold">Event</th><th className="py-1 pr-2 font-semibold">Result</th></tr></thead>
                      <tbody>
                        {deliveries[h.id].map(d => (
                          <tr key={d.id} className="border-t border-zinc-100">
                            <td className="py-1 pr-2 whitespace-nowrap">{new Date(d.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                            <td className="py-1 pr-2">{d.test ? 'Test' : (EVENT_LABEL[d.event] || d.event)}</td>
                            <td className={`py-1 pr-2 ${d.status === 'delivered' ? 'text-emerald-700' : d.status === 'failed' ? 'text-rose-600' : 'text-amber-700'}`}>
                              {d.status === 'delivered' ? `Delivered (${d.lastStatus})` : d.status === 'failed' ? `Failed: ${d.lastError}` : `Retrying (${d.attempts} tries${d.lastError ? `, ${d.lastError}` : ''})`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {configured && (hooks?.length || 0) < 10 && (
        <form onSubmit={add} className="space-y-2">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase">Endpoint URL
            <input required type="url" placeholder="https://example.com/frilensa-webhook" value={url} onChange={e => setUrl(e.target.value)} className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-800 mt-1 normal-case font-normal" />
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-700">
            {Object.entries(EVENT_LABEL).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5"><input type="checkbox" checked={events.includes(id)} onChange={e => setEvents(e.target.checked ? [...events, id] : events.filter(x => x !== id))} /> {label}</label>
            ))}
          </div>
          <button type="submit" disabled={busy || !events.length} className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{busy ? 'Adding…' : 'Add webhook'}</button>
        </form>
      )}
      {notice && <p className={`text-[11px] ${notice.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{notice.text}</p>}
    </section>
  );
}
