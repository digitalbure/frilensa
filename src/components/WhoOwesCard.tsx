import React, { useMemo, useState } from 'react';
import { HandCoins, MessageCircle, MessageSquareText } from 'lucide-react';
import type { CRMData } from '../types';
import { chaseMessage, owedInvoices, phoneDigits, smsLink, whatsappLink } from '../lib/chase';
import { trackAction } from '../lib/analytics';

// Home: who owes you, most overdue first, with a reminder ready to send from your own WhatsApp or SMS.

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WhoOwesCard({ data, onOpenInvoice }: { data: CRMData; onOpenInvoice?: (docId: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const now = today();
  const owed = useMemo(() => owedInvoices(data, now), [data, now]);
  if (!owed.length) return null;
  const business = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const businessName = business?.name || data.userProfile?.name || 'us';
  const byCurrency = new Map<string, number>();
  owed.forEach(o => byCurrency.set(o.currency, (byCurrency.get(o.currency) || 0) + o.balance));
  const overdue = owed.filter(o => o.daysOverdue > 0).length;
  const shown = showAll ? owed : owed.slice(0, 4);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs" data-testid="who-owes">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><HandCoins className="w-4 h-4 text-emerald-600" /> Who owes you</h3>
          <p className="text-[11px] text-slate-500">{[...byCurrency].map(([c, n]) => `${c} ${fmt(n)}`).join(' · ')} open{overdue ? ` · ${overdue} overdue` : ''}. Send a reminder from your own WhatsApp or SMS.</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {shown.map(o => {
          const phone = phoneDigits(o.phone);
          const text = chaseMessage(o, businessName, now);
          return (
            <div key={o.doc.id} className="py-2 flex items-center gap-2 flex-wrap" data-testid={`owed-${o.doc.documentNumber}`}>
              <button type="button" onClick={() => onOpenInvoice?.(o.doc.id)} className="flex-1 min-w-[150px] text-left">
                <p className="text-xs font-bold text-slate-800">{o.clientName}{o.daysOverdue > 0 && <span className="ml-1.5 text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{o.daysOverdue} day{o.daysOverdue === 1 ? '' : 's'} overdue</span>}</p>
                <p className="text-[10px] text-slate-500">{o.doc.documentNumber} · due {o.dueDate}</p>
              </button>
              <span className="font-mono text-xs font-bold text-slate-800">{o.currency} {fmt(o.balance)}</span>
              <div className="flex gap-1">
                <a href={whatsappLink(phone, text)} target="_blank" rel="noopener noreferrer" onClick={() => trackAction('chase_whatsapp')}
                  aria-label={`WhatsApp reminder to ${o.clientName}`} title={phone ? `WhatsApp ${o.clientName}` : 'WhatsApp (choose who to send it to)'}
                  className="text-[11px] font-bold bg-emerald-600 text-white rounded-lg px-2 py-1 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</a>
                <a href={smsLink(phone, text)} onClick={() => trackAction('chase_sms')}
                  aria-label={`SMS reminder to ${o.clientName}`} title={phone ? `SMS ${o.clientName}` : 'SMS (choose who to send it to)'}
                  className="text-[11px] font-bold border border-slate-300 text-slate-700 rounded-lg px-2 py-1 flex items-center gap-1"><MessageSquareText className="w-3 h-3" /> SMS</a>
              </div>
            </div>
          );
        })}
      </div>
      {owed.length > 4 && <button type="button" onClick={() => setShowAll(!showAll)} className="text-[11px] font-bold text-sky-700">{showAll ? 'Show fewer' : `Show all ${owed.length}`}</button>}
      {owed.some(o => !phoneDigits(o.phone)) && <p className="text-[10px] text-slate-400">Add a phone number to a client to send the reminder straight to them.</p>}
    </section>
  );
}
