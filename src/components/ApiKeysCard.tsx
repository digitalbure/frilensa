import { useEffect, useState } from 'react';
import { KeyRound, Copy, Trash2, Check } from 'lucide-react';
import { listApiKeys, createApiKey, revokeApiKey, listOAuthConnections, removeOAuthConnection, type ApiKeyInfo, type OAuthConnection } from '../lib/api';

/** Settings card: personal API keys for the Frilensa API and MCP server (AI assistants). */
export default function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [connections, setConnections] = useState<OAuthConnection[] | null>(null);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'draft' | 'read'>('draft');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://frilensa.com';
  const mcpUrl = `${origin}/mcp`;

  const refresh = () => {
    listApiKeys().then(setKeys).catch(err => setError(err.message));
    listOAuthConnections().then(setConnections).catch(() => setConnections([]));
  };
  useEffect(() => { refresh(); }, []);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Copy failed. Select the text and copy it yourself.');
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createApiKey(name.trim() || 'API key', access);
      setNewKey(created.key);
      setName('');
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (key: ApiKeyInfo) => {
    if (!window.confirm(`Revoke "${key.name}"? Anything using this key stops working straight away.`)) return;
    try {
      await revokeApiKey(key.id);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDisconnect = async (c: OAuthConnection) => {
    if (!window.confirm(`Disconnect ${c.name}? It loses access straight away.`)) return;
    try {
      await removeOAuthConnection(c.id);
      refresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const claudeCommand = `claude mcp add --transport http frilensa ${mcpUrl} --header "Authorization: Bearer ${newKey || 'YOUR_KEY'}"`;

  return (
    <div className="p-3.5 rounded-xl border border-zinc-200/90 bg-zinc-50/70 space-y-3 text-xs text-zinc-600">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center shrink-0">
          <KeyRound className="w-3.5 h-3.5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-800">API keys and AI assistants</h3>
          <p className="text-[11px] text-zinc-500 leading-snug">
            Connect Claude or another AI assistant (MCP), or your own scripts and tools (REST API), to this workspace.
            Keys can read your clients, quotes, invoices, expenses and summaries, and with draft access add clients,
            draft quotes and invoices, and expenses. They can't send anything to clients or record payments.
          </p>
        </div>
      </div>

      {newKey && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
          <p className="text-[11px] font-semibold text-emerald-900">Copy your new key now. It won't be shown again.</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 bg-white border border-emerald-200 rounded px-2 py-1.5 font-mono text-[11px] text-zinc-800 break-all">{newKey}</code>
            <button type="button" onClick={() => copy(newKey, 'key')} className="shrink-0 px-2.5 rounded bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer">
              {copied === 'key' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied === 'key' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" onClick={() => setNewKey(null)} className="text-[11px] font-semibold text-emerald-800 underline cursor-pointer">Done</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Key name, e.g. Claude"
          maxLength={60}
          className="flex-1 bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
        />
        <select
          value={access}
          onChange={e => setAccess(e.target.value as 'draft' | 'read')}
          className="bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs text-zinc-800"
        >
          <option value="draft">Read and create drafts</option>
          <option value="read">Read only</option>
        </select>
        <button type="button" onClick={handleCreate} disabled={busy} className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-bold text-xs disabled:opacity-60 cursor-pointer">
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </div>

      {error && <p className="text-[11px] text-rose-700">{error}</p>}

      {keys && keys.length > 0 && (
        <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-lg">
          {keys.map(k => (
            <li key={k.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold text-zinc-800 truncate">{k.name}</span>
                <span className="block text-[10px] text-zinc-500">
                  <span className="font-mono">{k.prefix}…</span> · {k.scopes.includes('draft') ? 'Read and drafts' : 'Read only'} ·{' '}
                  {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Not used yet'}
                </span>
              </div>
              <button type="button" onClick={() => handleRevoke(k)} className="shrink-0 text-[11px] font-semibold text-rose-700 hover:text-rose-800 flex items-center gap-1 cursor-pointer">
                <Trash2 className="w-3 h-3" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {keys && keys.length === 0 && !newKey && <p className="text-[11px] text-zinc-400">No keys yet.</p>}

      <div className="p-3 rounded-lg bg-white border border-zinc-200 space-y-1.5">
        <p className="text-[11px] font-semibold text-zinc-800">Claude on the web, desktop or phone</p>
        <p className="text-[11px] text-zinc-600">
          In Claude, open Settings → Connectors → Add custom connector, and paste{' '}
          <code className="font-mono bg-zinc-50 px-1 rounded">{mcpUrl}</code>{' '}
          <button type="button" onClick={() => copy(mcpUrl, 'url')} className="text-[10px] font-bold underline cursor-pointer">{copied === 'url' ? 'Copied' : 'Copy'}</button>.
          Claude sends you here to sign in and choose what it can do. No key needed.
        </p>
      </div>

      {connections && connections.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-zinc-800">Connected apps</p>
          <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-lg">
            {connections.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-zinc-800 truncate">{c.name}</span>
                  <span className="block text-[10px] text-zinc-500">
                    {c.scopes.includes('draft') ? 'Read and drafts' : 'Read only'} · {c.lastUsedAt ? `Last used ${new Date(c.lastUsedAt).toLocaleDateString()}` : 'Not used yet'}
                  </span>
                </div>
                <button type="button" onClick={() => handleDisconnect(c)} className="shrink-0 text-[11px] font-semibold text-rose-700 hover:text-rose-800 cursor-pointer">
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-[11px] text-zinc-600">
        <summary className="cursor-pointer font-semibold text-zinc-800">Connect with an API key (Claude Code, scripts)</summary>
        <div className="mt-2 space-y-2">
          <p><span className="font-semibold">AI assistants (MCP):</span> server URL <code className="font-mono bg-zinc-50 px-1 rounded">{mcpUrl}</code>, with the header <code className="font-mono bg-zinc-50 px-1 rounded">Authorization: Bearer YOUR_KEY</code>.</p>
          <p>Claude Code:</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 font-mono text-[10px] break-all">{claudeCommand}</code>
            <button type="button" onClick={() => copy(claudeCommand, 'cmd')} className="shrink-0 px-2 rounded border border-zinc-200 text-[10px] font-bold cursor-pointer">
              {copied === 'cmd' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p><span className="font-semibold">REST API:</span> <code className="font-mono bg-zinc-50 px-1 rounded">{origin}/api/v1</code>, same header. For example <code className="font-mono bg-zinc-50 px-1 rounded">GET /api/v1/documents?overdue=true</code>.</p>
          <p className="text-zinc-500">Treat keys like passwords. Anyone with a key can read your business records. Revoke a key if it might have leaked.</p>
        </div>
      </details>
    </div>
  );
}
