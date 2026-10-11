import React, { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarCheck, Copy, Plus, Trash2 } from 'lucide-react';
import type { Business, CRMData } from '../types';
import { QUESTION_TYPES, rateCardServices, type BookingQuestion, type BookingQuestionType, type BookingSettings, type DepositRule } from '../lib/bookings';

interface BookingSettingsCardProps {
  data: CRMData;
  onUpdateData: (data: CRMData) => void;
}

const CHOICE: BookingQuestionType[] = ['single_choice', 'multi_choice'];

/** Bookings settings for the active business: what can be booked, the questions asked, and messages. */
export default function BookingSettingsCard({ data, onUpdateData }: BookingSettingsCardProps) {
  const business = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  if (!business) return null;

  const booking: BookingSettings = business.booking || {};
  const services = rateCardServices(data.services, business.id);
  const questions = booking.questions || [];
  const built = booking.builtIn || {};

  const save = (patch: Partial<BookingSettings>) => onUpdateData({
    ...data,
    businesses: data.businesses.map(b => b.id === business.id
      ? { ...b, booking: { ...(b.booking || {}), ...patch }, updatedAt: new Date().toISOString() } as Business
      : b)
  });
  const setService = (id: string, patch: { bookable?: boolean; minQuantity?: number; maxQuantity?: number; deposit?: DepositRule }) =>
    save({ services: { ...(booking.services || {}), [id]: { ...(booking.services?.[id] || {}), ...patch } } });
  const setQuestions = (next: BookingQuestion[]) => save({ questions: next });
  const updateQ = (id: string, patch: Partial<BookingQuestion>) => setQuestions(questions.map(q => q.id === id ? { ...q, ...patch } : q));
  const move = (i: number, d: -1 | 1) => {
    const next = [...questions];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  };
  const addQuestion = () => {
    const q: BookingQuestion = { id: `q_${Date.now().toString(36)}`, type: 'short_text', label: 'New question', required: false };
    setQuestions([...questions, q]);
    setEditing(q.id);
  };
  const copyId = async () => {
    try { await navigator.clipboard.writeText(business.id); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const input = 'w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 mt-1 normal-case font-normal';
  const label = 'block text-[10px] font-bold text-zinc-400 uppercase';

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4 text-zinc-700" />
            <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Bookings for {business.name || 'this business'}</h3>
          </div>
          <p className="text-xs text-zinc-600 mt-1">What customers can book and what you ask them. Used by apps connected with an API key, and by your rate card.</p>
        </div>
        <div className="text-[11px] text-zinc-500">
          Business id (for apps and websites)
          <div className="flex items-center gap-1 mt-0.5">
            <code className="bg-zinc-50 border border-zinc-200 rounded px-1.5 py-0.5 font-mono text-zinc-800">{business.id}</code>
            <button type="button" onClick={copyId} className="p-1 text-zinc-500 cursor-pointer" aria-label="Copy business id"><Copy className="w-3.5 h-3.5" /></button>
            {copied && <span className="text-emerald-700">Copied</span>}
          </div>
        </div>
      </div>

      <BookingPagePanel business={business} booking={booking} save={save} />

      {/* Bookable services */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-zinc-800">Bookable services</p>
        {services.length === 0 ? (
          <p className="text-[11px] text-zinc-500">Nothing is on your rate card yet. Add services above and they can be booked.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-zinc-400 text-left"><th className="py-1 pr-2 font-bold">Service</th><th className="py-1 px-2 font-bold">Bookable</th><th className="py-1 px-2 font-bold">Min</th><th className="py-1 px-2 font-bold">Max</th><th className="py-1 px-2 font-bold">Own deposit</th></tr></thead>
              <tbody>
                {services.map(s => {
                  const c = booking.services?.[s.id] || {};
                  return (
                    <tr key={s.id} className="border-t border-zinc-100">
                      <td className="py-1.5 pr-2"><span className="font-semibold text-zinc-800">{s.name}</span> <span className="text-zinc-400">per {s.unit || 'item'}</span></td>
                      <td className="py-1.5 px-2"><input type="checkbox" checked={c.bookable !== false} onChange={e => setService(s.id, { bookable: e.target.checked })} aria-label={`${s.name} can be booked`} /></td>
                      <td className="py-1.5 px-2"><input type="number" min={1} value={c.minQuantity ?? ''} placeholder={String(s.minQuantity || 1)} onChange={e => setService(s.id, { minQuantity: Number(e.target.value) || undefined })} className="w-16 border border-zinc-200 rounded px-1.5 py-1" aria-label={`${s.name} minimum`} /></td>
                      <td className="py-1.5 px-2"><input type="number" min={1} value={c.maxQuantity ?? ''} placeholder="Any" onChange={e => setService(s.id, { maxQuantity: Number(e.target.value) || undefined })} className="w-20 border border-zinc-200 rounded px-1.5 py-1" aria-label={`${s.name} maximum`} /></td>
                      <td className="py-1.5 px-2"><DepositInput compact rule={c.deposit} onChange={deposit => setService(s.id, { deposit })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-zinc-800">Booking questions</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {([['date', 'Event or job date'], ['time', 'Start time'], ['location', 'Location']] as const).map(([key, text]) => {
            const on = Boolean((built as any)[key]);
            const reqKey = `${key}Required` as const;
            const required = key === 'date' ? (built as any)[reqKey] !== false : Boolean((built as any)[reqKey]);
            return (
              <div key={key} className="border border-zinc-200 rounded-lg p-2 text-xs space-y-1">
                <label className="flex items-center gap-2 font-semibold text-zinc-800"><input type="checkbox" checked={on} onChange={e => save({ builtIn: { ...built, [key]: e.target.checked } })} /> {text}</label>
                {on && <label className="flex items-center gap-2 text-[11px] text-zinc-600"><input type="checkbox" checked={required} onChange={e => save({ builtIn: { ...built, [reqKey]: e.target.checked } })} /> Required</label>}
              </div>
            );
          })}
        </div>

        <ul className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.id} className="border border-zinc-200 rounded-lg p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setEditing(editing === q.id ? null : q.id)} className="text-left font-semibold text-zinc-800 cursor-pointer min-w-0 truncate">
                  {q.label} <span className="font-normal text-zinc-400">· {QUESTION_TYPES.find(t => t.id === q.type)?.label}{q.required ? ' · required' : ''}{q.appliesToServiceIds?.length ? ' · some services' : ''}</span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-zinc-500 disabled:opacity-30 cursor-pointer" aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="p-1 text-zinc-500 disabled:opacity-30 cursor-pointer" aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => confirm(`Delete "${q.label}"?`) && setQuestions(questions.filter(x => x.id !== q.id))} className="p-1 text-rose-500 cursor-pointer" aria-label="Delete question"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {editing === q.id && (
                <div className="grid sm:grid-cols-2 gap-2 mt-2">
                  <label className={label}>Question<input value={q.label} maxLength={120} onChange={e => updateQ(q.id, { label: e.target.value })} className={input} /></label>
                  <label className={label}>Type
                    <select value={q.type} onChange={e => updateQ(q.id, { type: e.target.value as BookingQuestionType })} className={input}>
                      {QUESTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className={`${label} sm:col-span-2`}>Help text (optional)<input value={q.help || ''} maxLength={300} onChange={e => updateQ(q.id, { help: e.target.value })} className={input} /></label>
                  {CHOICE.includes(q.type) && (
                    <label className={`${label} sm:col-span-2`}>Choices (one per line)
                      <textarea rows={3} value={(q.options || []).join('\n')} onChange={e => updateQ(q.id, { options: e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 30) })} className={input} />
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={Boolean(q.required)} onChange={e => updateQ(q.id, { required: e.target.checked })} /> Required</label>
                  {services.length > 0 && (
                    <div className="sm:col-span-2 text-[11px] text-zinc-600">
                      <p className="font-semibold">Only ask when these are chosen (leave all unticked to always ask):</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        {services.map(s => (
                          <label key={s.id} className="flex items-center gap-1">
                            <input type="checkbox" checked={(q.appliesToServiceIds || []).includes(s.id)}
                              onChange={e => updateQ(q.id, { appliesToServiceIds: e.target.checked ? [...(q.appliesToServiceIds || []), s.id] : (q.appliesToServiceIds || []).filter(x => x !== s.id) })} />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={addQuestion} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 text-[11px] font-bold cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add question</button>
      </div>

      <AvailabilityPanel booking={booking} save={save} />

      {/* Deposit */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-zinc-800">Deposit</p>
        <p className="text-[11px] text-zinc-500">Asked for when you accept a booking: open the quote and press <strong>Create deposit invoice</strong>. The customer pays it with Pay now. A service can have its own deposit in the table above.</p>
        <DepositInput rule={booking.deposit} onChange={deposit => save({ deposit })} />
      </div>

      {/* Messages */}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={label}>Intro text
          <textarea rows={2} maxLength={1000} defaultValue={booking.intro || ''} key={`intro-${business.id}`} onBlur={e => e.target.value !== (booking.intro || '') && save({ intro: e.target.value.trim() })} placeholder="What customers should know before booking." className={input} />
        </label>
        <label className={label}>After-booking message
          <textarea rows={2} maxLength={1000} defaultValue={booking.afterMessage || ''} key={`after-${business.id}`} onBlur={e => e.target.value !== (booking.afterMessage || '') && save({ afterMessage: e.target.value.trim() })} placeholder="We'll reply within one working day." className={input} />
        </label>
      </div>
    </section>
  );
}

function suggestSlug(name: string) {
  return (name || 'my-business').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-business';
}

/** Hosted booking page and website widget for a business. */
function BookingPagePanel({ business, booking, save }: { business: Business; booking: BookingSettings; save: (p: Partial<BookingSettings>) => void }) {
  const page = booking.page || {};
  const [slug, setSlug] = useState(page.slug || suggestSlug(business.name));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = window.location.origin;
  const url = page.slug ? `${origin}/book/${page.slug}` : '';
  const embed = page.slug ? `<div data-frilensa-booking="${page.slug}"></div>\n<script src="${origin}/embed/booking.js" async></script>` : '';

  const claim = async (enable: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/booking-page', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: business.id, slug: slug.trim().toLowerCase() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Couldn’t save that address.');
      save({ page: { ...page, slug: body.slug, enabled: enable || page.enabled } });
      setNotice({ text: enable && !page.enabled ? 'Your booking page is on.' : 'Address saved.', ok: true });
    } catch (err: any) {
      setNotice({ text: err.message, ok: false });
    } finally {
      setBusy(false);
    }
  };
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  return (
    <div className="border border-zinc-200 rounded-xl p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-zinc-800">Booking page and website widget</p>
        {page.enabled && <button type="button" onClick={() => save({ page: { ...page, enabled: false } })} className="text-[11px] font-bold text-rose-600 cursor-pointer">Turn off</button>}
      </div>
      <p className="text-[11px] text-zinc-500">A page on Frilensa where customers choose services, answer your questions and send a booking request. Add it to any website with the widget; no developer needed.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-[10px] font-bold text-zinc-400 uppercase flex-1 min-w-[200px]">Address
          <span className="flex items-center mt-1 border border-zinc-200 rounded-lg overflow-hidden bg-white">
            <span className="px-2 text-[11px] text-zinc-500 normal-case font-normal bg-zinc-50 border-r border-zinc-200 py-1.5">{origin.replace(/^https?:\/\//, '')}/book/</span>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))} className="flex-1 min-w-0 px-2 py-1.5 text-xs text-zinc-800 normal-case font-normal outline-none" aria-label="Booking page address" />
          </span>
        </label>
        {!page.enabled ? (
          <button type="button" disabled={busy} onClick={() => claim(true)} className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{busy ? 'Saving…' : 'Turn on booking page'}</button>
        ) : slug !== page.slug ? (
          <button type="button" disabled={busy} onClick={() => claim(false)} className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-bold cursor-pointer disabled:opacity-50">Change address</button>
        ) : null}
      </div>
      {page.enabled && page.slug && (
        <>
          <div className="flex items-center gap-2 text-[11px]">
            <a href={url} target="_blank" rel="noopener" className="font-mono text-sky-700 underline truncate">{url}</a>
            <button type="button" onClick={() => copy('link', url)} className="p-1 text-zinc-500 cursor-pointer" aria-label="Copy link"><Copy className="w-3.5 h-3.5" /></button>
            {copied === 'link' && <span className="text-emerald-700">Copied</span>}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-zinc-600">To add a <strong>Book now</strong> button to your website, paste this where you want it:</p>
            <pre className="bg-zinc-900 text-zinc-100 text-[10.5px] rounded-lg p-2.5 overflow-x-auto whitespace-pre">{embed}</pre>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => copy('embed', embed)} className="px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-700 text-[11px] font-bold cursor-pointer flex items-center gap-1"><Copy className="w-3 h-3" /> Copy code</button>
              {copied === 'embed' && <span className="text-[11px] text-emerald-700">Copied</span>}
            </div>
            <p className="text-[11px] text-zinc-500">Optional: add data-service="service id" to preselect a service, data-label="Book a shoot" or data-colour="#0f766e".</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-zinc-700">
            <input type="checkbox" checked={Boolean(page.ackEmail)} onChange={e => save({ page: { ...page, ackEmail: e.target.checked } })} className="mt-0.5" />
            <span>Email the customer a copy of their request<span className="block text-[11px] text-zinc-500">A short "We've got your booking request" email with their answers and your after-booking message, sent in your business's name. Only for this page and the widget.</span></span>
          </label>
        </>
      )}
      {notice && <p className={`text-[11px] ${notice.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{notice.text}</p>}
    </div>
  );
}

function DepositInput({ rule, onChange, compact }: { rule?: DepositRule; onChange: (r: DepositRule | undefined) => void; compact?: boolean }) {
  const type = rule?.value ? rule.type : 'none';
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <select value={type} onChange={e => e.target.value === 'none' ? onChange(undefined) : onChange({ type: e.target.value as DepositRule['type'], value: rule?.value || (e.target.value === 'percent' ? 30 : 100) })}
        className="border border-zinc-200 rounded px-1.5 py-1 text-xs text-zinc-800" aria-label="Deposit type">
        <option value="none">{compact ? 'Default' : 'No deposit'}</option>
        <option value="percent">Percent</option>
        <option value="fixed">{compact ? 'Fixed per unit' : 'Fixed amount'}</option>
      </select>
      {type !== 'none' && (
        <input type="number" min={0} max={type === 'percent' ? 100 : undefined} step="any" value={rule?.value ?? ''}
          onChange={e => onChange({ type: type as DepositRule['type'], value: Math.max(0, Number(e.target.value) || 0) })}
          className="w-20 border border-zinc-200 rounded px-1.5 py-1 text-xs text-zinc-800" aria-label="Deposit amount" />
      )}
      {type === 'percent' && <span className="text-zinc-500">%</span>}
    </span>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** When customers can book: working days, lead time, blocked dates and a daily limit. */
function AvailabilityPanel({ booking, save }: { booking: BookingSettings; save: (p: Partial<BookingSettings>) => void }) {
  const a = booking.availability || {};
  const [newDate, setNewDate] = useState('');
  const set = (patch: Partial<NonNullable<BookingSettings['availability']>>) => save({ availability: { ...a, ...patch } });
  const days = a.workingDays && a.workingDays.length ? a.workingDays : [0, 1, 2, 3, 4, 5, 6];
  const blocked = [...(a.blockedDates || [])].sort();
  const num = 'w-16 border border-zinc-200 rounded px-1.5 py-1 text-xs text-zinc-800';
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-bold text-zinc-800">
        <input type="checkbox" checked={Boolean(a.enabled)} onChange={e => set({ enabled: e.target.checked })} /> Limit when customers can book
      </label>
      {a.enabled && (
        <div className="space-y-2.5 pl-5 text-xs text-zinc-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-500">Days you work:</span>
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={days.includes(i)} onChange={e => set({ workingDays: e.target.checked ? [...days, i].sort() : days.filter(x => x !== i) })} /> {d}</label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5">Book at least <input type="number" min={0} max={365} value={a.leadDays ?? 0} onChange={e => set({ leadDays: Math.max(0, Number(e.target.value) || 0) })} className={num} /> days ahead</label>
            <label className="flex items-center gap-1.5">At most <input type="number" min={0} value={a.maxPerDay ?? ''} placeholder="Any" onChange={e => set({ maxPerDay: Number(e.target.value) || undefined })} className={num} /> bookings a day</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(a.countPending)} onChange={e => set({ countPending: e.target.checked })} /> Count requests you haven't accepted yet</label>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Blocked dates:</span>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="border border-zinc-200 rounded px-1.5 py-1 text-xs text-zinc-800" aria-label="Date to block" />
              <button type="button" disabled={!newDate || blocked.includes(newDate)} onClick={() => { set({ blockedDates: [...blocked, newDate].sort() }); setNewDate(''); }} className="px-2 py-1 rounded border border-zinc-200 text-[11px] font-bold cursor-pointer disabled:opacity-40">Block</button>
            </div>
            {blocked.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {blocked.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 text-[11px]">{d}
                    <button type="button" onClick={() => set({ blockedDates: blocked.filter(x => x !== d) })} className="text-zinc-500 cursor-pointer" aria-label={`Unblock ${d}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">A day counts as booked once its quote is accepted. Apps and your booking page grey out days that are closed, too soon, blocked or full, and full dates are refused.</p>
        </div>
      )}
    </div>
  );
}
