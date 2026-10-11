import React, { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarCheck, Copy, Plus, Trash2 } from 'lucide-react';
import type { Business, CRMData } from '../types';
import { QUESTION_TYPES, rateCardServices, type BookingQuestion, type BookingQuestionType, type BookingSettings } from '../lib/bookings';

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
  const setService = (id: string, patch: { bookable?: boolean; minQuantity?: number; maxQuantity?: number }) =>
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

      {/* Bookable services */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-zinc-800">Bookable services</p>
        {services.length === 0 ? (
          <p className="text-[11px] text-zinc-500">Nothing is on your rate card yet. Add services above and they can be booked.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-zinc-400 text-left"><th className="py-1 pr-2 font-bold">Service</th><th className="py-1 px-2 font-bold">Bookable</th><th className="py-1 px-2 font-bold">Min</th><th className="py-1 px-2 font-bold">Max</th></tr></thead>
              <tbody>
                {services.map(s => {
                  const c = booking.services?.[s.id] || {};
                  return (
                    <tr key={s.id} className="border-t border-zinc-100">
                      <td className="py-1.5 pr-2"><span className="font-semibold text-zinc-800">{s.name}</span> <span className="text-zinc-400">per {s.unit || 'item'}</span></td>
                      <td className="py-1.5 px-2"><input type="checkbox" checked={c.bookable !== false} onChange={e => setService(s.id, { bookable: e.target.checked })} aria-label={`${s.name} can be booked`} /></td>
                      <td className="py-1.5 px-2"><input type="number" min={1} value={c.minQuantity ?? ''} placeholder={String(s.minQuantity || 1)} onChange={e => setService(s.id, { minQuantity: Number(e.target.value) || undefined })} className="w-16 border border-zinc-200 rounded px-1.5 py-1" aria-label={`${s.name} minimum`} /></td>
                      <td className="py-1.5 px-2"><input type="number" min={1} value={c.maxQuantity ?? ''} placeholder="Any" onChange={e => setService(s.id, { maxQuantity: Number(e.target.value) || undefined })} className="w-20 border border-zinc-200 rounded px-1.5 py-1" aria-label={`${s.name} maximum`} /></td>
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
