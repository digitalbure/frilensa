import React, { useEffect, useState } from 'react';
import { ArrowRight, Power } from 'lucide-react';
import { MODULE_INFO, cleanModules, type ModuleId, type ModuleSettings } from '../lib/modules';

type AdminTab = 'plans' | 'branding' | 'auth_access' | 'taxes_fees' | 'billing' | 'directory' | 'marketplace';

/**
 * Admin → Modules: every module switched on or off for everyone, with its settings. Changes are saved
 * for every account and enforced on the server. Areas with their own tab are linked.
 */
export default function AdminModulesView({ modules, onSave, onOpenTab }: { modules: ModuleSettings; onSave: (m: ModuleSettings) => void; onOpenTab: (t: AdminTab) => void }) {
  const [draft, setDraft] = useState<ModuleSettings>(modules);
  useEffect(() => { setDraft(modules); }, [modules]);
  const changed = JSON.stringify(cleanModules(draft)) !== JSON.stringify(cleanModules(modules));
  const set = (id: ModuleId, patch: Record<string, unknown>) => setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));
  const save = () => {
    const next = cleanModules(draft);
    const turningOff = (Object.keys(next) as ModuleId[]).filter(id => modules[id].enabled && !next[id].enabled);
    if (turningOff.length && !confirm(`Switch off ${turningOff.map(id => MODULE_INFO[id].name).join(', ')} for everyone?\n\n${turningOff.map(id => `${MODULE_INFO[id].name}: ${MODULE_INFO[id].off}`).join('\n')}`)) return;
    onSave(next);
  };
  const input = 'w-24 bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500';
  const elsewhere: { name: string; tab: AdminTab; note: string }[] = [
    { name: 'Sign-ups', tab: 'auth_access', note: 'Open, invite-only or closed, and invite codes' },
    { name: 'Plans and limits', tab: 'plans', note: 'Plan names, prices, limits and features' },
    { name: 'Paid plans and payments', tab: 'billing', note: 'Billing on or off, payment details, receipts' },
    { name: 'Taxes and fees', tab: 'taxes_fees', note: 'Standard VAT, taxes and fees for every business' },
    { name: 'Business directory', tab: 'directory', note: 'Directory on or off, paid plans only' },
    { name: 'Marketplace content', tab: 'marketplace', note: 'Review listings, brands, agent listings' },
    { name: 'Branding', tab: 'branding', note: 'Name, logo, colours, app icons' }
  ];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Modules</h3>
          <p className="text-[11px] text-slate-400">Switch parts of Frilensa on or off for everyone and set their limits. The server enforces these; switched-off modules are hidden in the app and nothing is deleted.</p>
        </div>
        <button type="button" disabled={!changed} onClick={save} className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40 shrink-0">Save module settings</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(Object.keys(MODULE_INFO) as ModuleId[]).map(id => {
          const info = MODULE_INFO[id];
          const m: any = draft[id];
          return (
            <div key={id} className={`rounded-2xl border p-4 space-y-2.5 ${m.enabled ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-rose-500/30'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-100">{info.name}</p>
                  <p className="text-[11px] text-slate-400">{info.description}</p>
                </div>
                <button type="button" role="switch" aria-checked={m.enabled} aria-label={`${info.name} on`} onClick={() => set(id, { enabled: !m.enabled })}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer ${m.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                  <Power className="w-3 h-3" /> {m.enabled ? 'On' : 'Off'}
                </button>
              </div>
              {!m.enabled && <p className="text-[10px] text-rose-300">{info.off}</p>}
              {info.fields.length > 0 && (
                <div className={`space-y-1.5 ${m.enabled ? '' : 'opacity-50'}`}>
                  {info.fields.map(f => (
                    <label key={f.key} className="flex items-center justify-between gap-3 text-xs text-slate-300">
                      <span>{f.label}{f.help && <span className="block text-[10px] text-slate-500">{f.help}</span>}{f.type === 'number' && f.zeroMeans && <span className="block text-[10px] text-slate-500">0 = {f.zeroMeans.toLowerCase()}</span>}</span>
                      {f.type === 'bool'
                        ? <input type="checkbox" checked={!!m[f.key]} onChange={e => set(id, { [f.key]: e.target.checked })} />
                        : <input type="number" min={f.min} max={f.max} className={input} value={m[f.key]} onChange={e => set(id, { [f.key]: e.target.value === '' ? '' : Number(e.target.value) })} />}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-slate-100">Set in their own tabs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {elsewhere.map(e => (
            <button key={e.tab} type="button" onClick={() => onOpenTab(e.tab)} className="text-left rounded-xl bg-slate-950 border border-slate-800 p-3 hover:border-sky-500/40 cursor-pointer flex items-center justify-between gap-2">
              <span><span className="block text-xs font-bold text-slate-100">{e.name}</span><span className="block text-[10px] text-slate-400">{e.note}</span></span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
