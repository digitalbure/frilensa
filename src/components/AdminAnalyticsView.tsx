import React, { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import { categoriesFor } from '../lib/marketplaceTaxonomy';

type Named = { name: string; count: number }[];
interface Report {
  generatedAt: string; from: string; to: string; days: number;
  users: { total: number; verified: number; newInRange: number; signedInInRange: number; providers: Named };
  engagement: { dau: number; wau: number; mau: number; activeInRange: number; series: { date: string; active: number; signups: number }[]; screens: Named; actions: Named; devices: Named; versions: Named; trackingSince: string | null };
  retention: { week: string; size: number; weeks: (number | null)[] }[];
  workspaces: { total: number; withDocuments: number; avgClients: number; avgDocuments: number; avgProjects: number; plans: Record<string, number>; createdDocsInRange: number };
  documents: { byType: Record<string, number>; invoiceStatus: Record<string, number>; money: Record<string, { invoiced: number; paid: number; outstanding: number; count: number }>; invoicedByMonth: Record<string, Record<string, number>>; quotes: number; quotesWon: number; quoteWinRate: number | null };
  bookings: { total: number; byChannel: Named; byDay: { date: string; count: number }[]; quoted: number; conversion: number | null; directoryBookings: number; directoryListings: number };
  marketplace: { listings: number; byStatus: Record<string, number>; byKind: Named; topIndustries: Named; topCategories: Named; topCities: Named; requests: number; agentRequests: number; rentalsConfirmed: number };
  plans: { paying: number; byMethod: Named; revenue: number; revenueByMonth: Record<string, number> };
  ai: { scans: number; assistantMessages: number; users: number };
  api: { activeKeys: number; keyOwners: number; apiBookings: number; webhooks: number };
  errors: { inRange: number; topScreens: Named };
}

const DATASETS = [
  { id: 'users', name: 'Users', note: 'Sign-up and last sign-in dates, plan, verified' },
  { id: 'activity', name: 'App use by day', note: 'Screens and actions per person per day' },
  { id: 'documents', name: 'Documents', note: 'Type, status, currency, totals, month' },
  { id: 'bookings', name: 'Booking requests', note: 'Channel, estimate, stage, quoted' },
  { id: 'listings', name: 'Marketplace listings', note: 'Kind, category, town, prices' }
];
const LABELS: Record<string, string> = {
  rate_card: 'Rate card', booking_page: 'Booking page', widget: 'Website widget', api: 'API', directory: 'Directory', marketplace: 'Marketplace',
  dashboard: 'Home', billing: 'Billing', clients: 'Clients', catalogue: 'Services', services: 'Finance', projects: 'Projects', marketplace_tab: 'Marketplace',
  assistant: 'Assistant', settings: 'Settings', paypal: 'PayPal', bank: 'Bank', mpaisa: 'M-PAiSA', mycash: 'MyCash', admin: 'Given by admin'
};
/** Named counts from a record, typed. */
const entriesOf = (o: Record<string, number>): [string, number][] => Object.keys(o || {}).map(k => [k, Number(o[k]) || 0]);
/** A marketplace category's name, whether gear or a service. */
const catName = (id: string) => { const g = categoriesFor('gear').find(c => c.id === id) || categoriesFor('service').find(c => c.id === id); return g ? g.name : id; };
const label = (s: string) => LABELS[s] || s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
const n = (v: number) => v.toLocaleString();
const money = (cur: string, v: number) => `${cur} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Admin → Analytics: how Frilensa is used, by whom, and what flows through it; with anonymised exports for studies. */
export default function AdminAnalyticsView() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async (fresh = false) => {
    setBusy(true); setProblem(null);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}${fresh ? '&fresh=1' : ''}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Analytics could not be loaded.');
      setReport(body);
    } catch (err: any) { setProblem(err.message); } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [days]);

  const download = async (dataset: string) => {
    try {
      const res = await fetch(`/api/admin/analytics/export/${dataset}?days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Export failed.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `frilensa-${dataset}-${days}d.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) { setProblem(err.message); }
  };

  const card = 'bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3';
  const h = 'text-sm font-bold text-slate-100';
  const tile = (title: string, value: React.ReactNode, note?: string) => (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <p className="text-xl font-black text-slate-100 font-mono mt-0.5">{value}</p>
      {note && <p className="text-[10px] text-slate-500">{note}</p>}
    </div>
  );
  const list = (items: Named, empty = 'Nothing yet.') => items.length === 0 ? <p className="text-xs text-slate-500">{empty}</p> : (
    <div className="space-y-1">
      {items.map(i => {
        const max = items[0]?.count || 1;
        return (
          <div key={i.name} className="text-xs">
            <div className="flex justify-between gap-2 text-slate-300"><span className="truncate">{label(i.name)}</span><span className="font-mono">{n(i.count)}</span></div>
            <div className="h-1.5 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${Math.max(2, i.count / max * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
  const axis = { stroke: '#64748b', fontSize: 10, tickLine: false, axisLine: false };
  const tip = { contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }, labelStyle: { color: '#cbd5e1' } };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div>
          <h3 className={h}>Analytics</h3>
          <p className="text-[11px] text-slate-400">{report ? `${report.from} to ${report.to} · updated ${new Date(report.generatedAt).toLocaleTimeString()}` : 'Loading…'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5" role="radiogroup" aria-label="Period">
            {[7, 30, 90, 365].map(d => (
              <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${days === d ? 'bg-sky-500 text-slate-950' : 'text-slate-400'}`}>{d === 365 ? '1 year' : `${d} days`}</button>
            ))}
          </div>
          <button type="button" onClick={() => load(true)} disabled={busy} aria-label="Refresh" className="p-2 rounded-xl bg-slate-800 text-slate-200 cursor-pointer disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {problem && <p className="text-xs text-rose-300">{problem}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {tile('Accounts', n(report.users.total), `${n(report.users.newInRange)} new in period`)}
            {tile('Active today', n(report.engagement.dau), `${n(report.engagement.wau)} this week`)}
            {tile('Active this month', n(report.engagement.mau), `${n(report.users.signedInInRange)} signed in in period`)}
            {tile('Paying', n(report.plans.paying), `FJD ${n(Math.round(report.plans.revenue))} received in period`)}
            {tile('Booking requests', n(report.bookings.total), report.bookings.conversion !== null ? `${report.bookings.conversion}% turned into quotes` : undefined)}
            {tile('Quotes won', report.documents.quoteWinRate !== null ? `${report.documents.quoteWinRate}%` : '–', `${n(report.documents.quotesWon)} of ${n(report.documents.quotes)}`)}
          </div>

          <section className={card}>
            <h3 className={h}>Active people and sign-ups</h3>
            {!report.engagement.trackingSince && <p className="text-[11px] text-amber-300">App use is recorded from this version on, so activity starts at zero and fills in as people use the app.</p>}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.engagement.series} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" {...axis} tickFormatter={d => String(d).slice(5)} minTickGap={24} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip {...tip} />
                  <Area isAnimationActive={false} type="monotone" dataKey="active" name="Active people" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} />
                  <Area isAnimationActive={false} type="monotone" dataKey="signups" name="Sign-ups" stroke="#34d399" fill="#34d399" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <section className={card}><h3 className={h}>Most used screens</h3>{list(report.engagement.screens)}</section>
            <section className={card}><h3 className={h}>Actions</h3>{list(report.engagement.actions)}</section>
            <section className={card}>
              <h3 className={h}>Devices and sign-in</h3>
              {list(report.engagement.devices)}
              <div className="pt-2 border-t border-slate-800">{list(report.users.providers)}</div>
              <p className="text-[10px] text-slate-500">{n(report.users.verified)} of {n(report.users.total)} accounts have a verified email.</p>
            </section>
          </div>

          <section className={card}>
            <h3 className={h}>Retention</h3>
            <p className="text-[11px] text-slate-400">People who signed up each week, and the share who used the app 1 to 4 weeks later.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-300">
                <thead><tr className="text-[10px] uppercase text-slate-500"><th className="text-left py-1">Week starting</th><th className="text-right">Signed up</th>{[1, 2, 3, 4].map(w => <th key={w} className="text-right">Week {w}</th>)}</tr></thead>
                <tbody>
                  {report.retention.map(c => (
                    <tr key={c.week} className="border-t border-slate-800">
                      <td className="py-1 font-mono">{c.week}</td><td className="text-right font-mono">{c.size}</td>
                      {c.weeks.map((v, i) => <td key={i} className="text-right font-mono" style={v !== null && c.size ? { background: `rgba(56,189,248,${v / 150})` } : undefined}>{v === null ? '' : `${v}%`}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className={card}>
              <h3 className={h}>Workspaces and plans</h3>
              <div className="grid grid-cols-2 gap-2">
                {tile('Workspaces', n(report.workspaces.total), `${n(report.workspaces.withDocuments)} with documents`)}
                {tile('Made documents in period', n(report.workspaces.createdDocsInRange))}
                {tile('Clients each', report.workspaces.avgClients, 'average')}
                {tile('Documents each', report.workspaces.avgDocuments, 'average')}
              </div>
              {list(entriesOf(report.workspaces.plans).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))}
            </section>
            <section className={card}>
              <h3 className={h}>Invoices issued in the period</h3>
              {Object.keys(report.documents.money).length === 0 ? <p className="text-xs text-slate-500">No invoices issued.</p> : (
                <table className="w-full text-xs text-slate-300">
                  <thead><tr className="text-[10px] uppercase text-slate-500"><th className="text-left">Currency</th><th className="text-right">Invoices</th><th className="text-right">Invoiced</th><th className="text-right">Paid</th><th className="text-right">Owing</th></tr></thead>
                  <tbody>{(Object.keys(report.documents.money)).map(cur => [cur, report.documents.money[cur]] as const).map(([cur, m]) => (
                    <tr key={cur} className="border-t border-slate-800 font-mono"><td className="py-1">{cur}</td><td className="text-right">{n(m.count)}</td><td className="text-right">{money(cur, m.invoiced)}</td><td className="text-right text-emerald-300">{money(cur, m.paid)}</td><td className="text-right text-amber-300">{money(cur, m.outstanding)}</td></tr>
                  ))}</tbody>
                </table>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div><p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Documents made</p>{list(entriesOf(report.documents.byType).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))}</div>
                <div><p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Invoice status</p>{list(entriesOf(report.documents.invoiceStatus).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))}</div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className={card}>
              <h3 className={h}>Booking requests</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.bookings.byDay} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" {...axis} tickFormatter={d => String(d).slice(5)} minTickGap={24} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tip} />
                    <Bar isAnimationActive={false} dataKey="count" name="Requests" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {list(report.bookings.byChannel)}
              <p className="text-[10px] text-slate-500">Directory: {n(report.bookings.directoryListings)} businesses listed, {n(report.bookings.directoryBookings)} bookings in the period.</p>
            </section>
            <section className={card}>
              <h3 className={h}>Marketplace</h3>
              <div className="grid grid-cols-3 gap-2">
                {tile('Listings', n(report.marketplace.listings), `${n(report.marketplace.byStatus.live || 0)} live · ${n(report.marketplace.byStatus.pending || 0)} waiting`)}
                {tile('Requests', n(report.marketplace.requests), `${n(report.marketplace.agentRequests)} via Frilensa`)}
                {tile('Rentals confirmed', n(report.marketplace.rentalsConfirmed))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Top categories</p>{list(report.marketplace.topCategories.map(c => ({ ...c, name: catName(c.name) })))}</div>
                <div><p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Towns</p>{list(report.marketplace.topCities)}</div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <section className={card}>
              <h3 className={h}>Plan revenue</h3>
              {tile('Received in period', `FJD ${n(Math.round(report.plans.revenue))}`)}
              {list(entriesOf(report.plans.revenueByMonth).map(([name, count]) => ({ name, count: Math.round(count) })).sort((a, b) => a.name.localeCompare(b.name)), 'No plan payments yet.')}
              <p className="text-[10px] uppercase text-slate-500 font-bold">Paying by</p>{list(report.plans.byMethod)}
            </section>
            <section className={card}>
              <h3 className={h}>AI and connected apps</h3>
              <div className="grid grid-cols-2 gap-2">
                {tile('AI scans', n(report.ai.scans))}
                {tile('Assistant messages', n(report.ai.assistantMessages), 'counted when a monthly limit is set')}
                {tile('API keys', n(report.api.activeKeys), `${n(report.api.keyOwners)} people`)}
                {tile('Webhooks', n(report.api.webhooks), `${n(report.api.apiBookings)} bookings by API`)}
              </div>
            </section>
            <section className={card}>
              <h3 className={h}>Errors</h3>
              {tile('Screen errors in period', n(report.errors.inRange))}
              {list(report.errors.topScreens, 'No errors. 🎉')}
            </section>
          </div>

          <section className={card}>
            <h3 className={h}>Exports for studies</h3>
            <p className="text-[11px] text-slate-400">CSV files for the selected period with anonymous ids instead of people: no names, emails, client details or anything typed. The same person has the same id in every file, so files can be joined.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {DATASETS.map(d => (
                <button key={d.id} type="button" onClick={() => download(d.id)} className="text-left rounded-xl bg-slate-950 border border-slate-800 p-3 hover:border-sky-500/40 cursor-pointer">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-100"><Download className="w-3.5 h-3.5 text-sky-400" /> {d.name}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">{d.note}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
