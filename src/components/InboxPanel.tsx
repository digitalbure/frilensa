import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, XCircle, FileCheck2, MessageSquare, CalendarClock, ChevronRight } from 'lucide-react';
import type { CRMData, CRMDocument, DirectoryBooking, SupportMessage } from '../types';
import { paymentsToConfirm, newlyAcceptedQuotes } from '../lib/inbox';
import { applyConfirmedPayment, type ConfirmedPaymentDetails } from '../lib/payments';
import { loadSupportMessagesForConsultant, updateSupportMessageStatus } from '../lib/db';
import { fetchDirectoryBookings } from '../lib/api';
import { sendDocumentEmail } from '../lib/emailService';
import RecordPaymentModal from './RecordPaymentModal';

type Tab = 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant';

interface InboxPanelProps {
  data: CRMData;
  onUpdateData: (data: CRMData) => void;
  onNavigateToTab: (tab: Tab, selectedDocId?: string) => void;
}

function money(d: CRMDocument) {
  return `${d.currency || 'FJD'} $${(d.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Maps the method a client picks on the portal to the matching "Record Payment" option.
const REPORTED_METHOD_TO_OPTION: Record<string, string> = {
  'M-PAiSA': 'Vodafone M-PAiSA',
  'M-Paisa': 'Vodafone M-PAiSA',
  'MyCash': 'Digicel MyCash',
  'Bank transfer': 'Direct Bank Deposit',
  'Cash': 'Cash / Cheque'
};

function when(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  return isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * "Needs your attention" inbox on the dashboard: client-reported payments to confirm or reject,
 * accepted quotes, unread client messages and pending directory bookings.
 */
export default function InboxPanel({ data, onUpdateData, onNavigateToTab }: InboxPanelProps) {
  const payments = paymentsToConfirm(data);
  const quotes = newlyAcceptedQuotes(data);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [bookings, setBookings] = useState<DirectoryBooking[]>([]);
  const [confirming, setConfirming] = useState<CRMDocument | null>(null);
  const [rejecting, setRejecting] = useState<CRMDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [emailClient, setEmailClient] = useState(true);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const msgs = await loadSupportMessagesForConsultant();
      setMessages(msgs.filter(m => m.sender === 'client' && m.status === 'unread'));
    } catch (err) {
      console.warn('Inbox: could not load messages', err);
    }
    try {
      const b = await fetchDirectoryBookings();
      setBookings(b.received.filter(x => x.status === 'pending'));
    } catch (err) {
      console.warn('Inbox: could not load bookings', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const flash = (text: string, ok = true) => {
    setNotice({ text, ok });
    setTimeout(() => setNotice(null), 5000);
  };

  const emailClientAbout = async (doc: CRMDocument, subject: string, message: string) => {
    const client = data.clients.find(c => c.id === doc.clientId);
    const business = data.businesses.find(b => b.id === doc.businessId) || data.businesses[0];
    if (!client?.email || !business) return 'no client email on file';
    try {
      await sendDocumentEmail({
        document: doc, business, client, userProfile: data.userProfile,
        recipientEmail: client.email, customSubject: subject, customMessage: message,
        consultantEmail: data.userProfile.email
      });
      return null;
    } catch (err: any) {
      return err?.message || 'email failed';
    }
  };

  const handleConfirm = async (docId: string, details: ConfirmedPaymentDetails) => {
    const now = new Date().toISOString();
    const paid = applyConfirmedPayment(data, docId, details);
    const next: CRMData = {
      ...paid,
      documents: paid.documents.map(d => d.id === docId && d.clientPaymentReport
        ? { ...d, clientPaymentReport: { ...d.clientPaymentReport, status: 'confirmed' as const, resolvedAt: now }, updatedAt: now }
        : d)
    };
    onUpdateData(next);
    setConfirming(null);
    const doc = next.documents.find(d => d.id === docId)!;
    if (emailClient) {
      const problem = await emailClientAbout(doc, `Payment received for ${doc.documentNumber}`,
        `Thank you. We've received your payment for ${doc.documentNumber}. This invoice is now marked as paid.`);
      flash(problem ? `Payment confirmed. The client wasn't emailed (${problem}).` : 'Payment confirmed and the client was emailed.', !problem);
    } else {
      flash('Payment confirmed. The invoice is marked as paid.');
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    const now = new Date().toISOString();
    const reason = rejectReason.trim();
    const next: CRMData = {
      ...data,
      documents: data.documents.map(d => d.id === rejecting.id && d.clientPaymentReport
        ? { ...d, clientPaymentReport: { ...d.clientPaymentReport, status: 'rejected' as const, resolvedAt: now, rejectionReason: reason || undefined }, updatedAt: now }
        : d)
    };
    onUpdateData(next);
    const doc = next.documents.find(d => d.id === rejecting.id)!;
    setRejecting(null);
    setRejectReason('');
    if (emailClient) {
      const problem = await emailClientAbout(doc, `We couldn't find your payment for ${doc.documentNumber}`,
        `We couldn't match the payment you reported (${doc.clientPaymentReport?.method}, ref ${doc.clientPaymentReport?.reference}) to our account.${reason ? ` ${reason}` : ''} Please check the details, or reply to this email. You can report the payment again from the invoice link.`);
      flash(problem ? `Payment report rejected. The client wasn't emailed (${problem}).` : 'Payment report rejected and the client was emailed.', !problem);
    } else {
      flash('Payment report rejected. The client can report it again.');
    }
  };

  const dismissQuote = (doc: CRMDocument) => {
    onUpdateData({
      ...data,
      documents: data.documents.map(d => d.id === doc.id ? { ...d, acceptanceSeenAt: new Date().toISOString() } : d)
    });
  };

  const markMessageRead = async (m: SupportMessage) => {
    setMessages(prev => prev.filter(x => x.id !== m.id));
    try { await updateSupportMessageStatus(m.id, 'read'); } catch (err) { console.warn(err); }
  };

  const clientName = (doc: CRMDocument) => data.clients.find(c => c.id === doc.clientId)?.name || 'Client';
  const total = payments.length + quotes.length + messages.length + bookings.length;

  if (total === 0 && !notice) return null;

  return (
    <section className="bg-white rounded-2xl border border-amber-200 shadow-xs overflow-hidden">
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
        <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
          <BellRing className="w-4 h-4" /> Needs your attention
          {total > 0 && <span className="bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">{total}</span>}
        </h2>
        <label className="text-[11px] text-amber-900 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={emailClient} onChange={e => setEmailClient(e.target.checked)} className="rounded border-amber-300" />
          Email the client when I confirm or reject
        </label>
      </div>

      {notice && (
        <div className={`px-4 py-2 text-xs font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</div>
      )}

      <ul className="divide-y divide-zinc-100">
        {payments.map(doc => (
          <li key={`pay-${doc.id}`} className="px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-xs">
                <p className="font-bold text-zinc-900 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Payment reported: {doc.documentNumber}</p>
                <p className="text-zinc-600">{clientName(doc)} · {money(doc)} · {doc.clientPaymentReport!.method}, ref <span className="font-mono">{doc.clientPaymentReport!.reference}</span></p>
                <p className="text-zinc-400 text-[11px]">Reported {when(doc.clientPaymentReport!.reportedAt)}. Check your account before confirming.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming({ ...doc, paymentMethod: REPORTED_METHOD_TO_OPTION[doc.clientPaymentReport!.method] || doc.paymentMethod })} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer">Confirm</button>
                <button type="button" onClick={() => { setRejecting(doc); setRejectReason(''); }} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-[11px] font-bold cursor-pointer">Reject</button>
              </div>
            </div>
            {rejecting?.id === doc.id && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Optional note for the client, e.g. no transfer received yet"
                  className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs"
                />
                <button type="button" onClick={handleReject} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Reject report
                </button>
                <button type="button" onClick={() => setRejecting(null)} className="px-3 py-1.5 text-[11px] font-bold text-zinc-500 cursor-pointer">Cancel</button>
              </div>
            )}
          </li>
        ))}

        {quotes.map(doc => (
          <li key={`quote-${doc.id}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <p className="font-bold text-zinc-900 flex items-center gap-1.5"><FileCheck2 className="w-3.5 h-3.5 text-sky-600" /> Quote accepted: {doc.documentNumber}</p>
              <p className="text-zinc-600">{clientName(doc)} · {money(doc)} · {when(doc.acceptedAt)}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onNavigateToTab('billing', doc.id)} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold cursor-pointer">Open quote</button>
              <button type="button" onClick={() => dismissQuote(doc)} className="px-3 py-1.5 rounded-lg text-zinc-500 text-[11px] font-bold cursor-pointer">Dismiss</button>
            </div>
          </li>
        ))}

        {messages.map(m => (
          <li key={`msg-${m.id}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs min-w-0">
              <p className="font-bold text-zinc-900 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-indigo-600" /> {m.clientName || m.clientEmail}: {m.subject || 'Message'}</p>
              <p className="text-zinc-600 line-clamp-2">{m.message}</p>
              <p className="text-zinc-400 text-[11px]">{when(m.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onNavigateToTab('clients')} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer">Reply</button>
              <button type="button" onClick={() => markMessageRead(m)} className="px-3 py-1.5 rounded-lg text-zinc-500 text-[11px] font-bold cursor-pointer">Mark read</button>
            </div>
          </li>
        ))}

        {bookings.map(b => (
          <li key={`bk-${b.id}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <p className="font-bold text-zinc-900 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-teal-600" /> Booking request {b.bookingRef}: {b.serviceName}</p>
              <p className="text-zinc-600">{b.clientName} · {b.bookingDate}{b.preferredTime ? ` ${b.preferredTime}` : ''}</p>
            </div>
            <button type="button" onClick={() => onNavigateToTab('directory')} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 text-[11px] font-bold cursor-pointer flex items-center gap-1">
              Review <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <RecordPaymentModal
        isOpen={!!confirming}
        document={confirming}
        data={data}
        onClose={() => setConfirming(null)}
        onConfirmPayment={handleConfirm}
      />
    </section>
  );
}
