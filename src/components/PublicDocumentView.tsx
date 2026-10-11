import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Download, FileText, AlertCircle, LogIn } from 'lucide-react';
import { acceptPublicQuote, fetchPublicDocument, reportPublicPayment, type PublicDocumentData } from '../lib/api';
import { downloadDocumentPdf } from '../lib/pdfGenerator';
import type { Business, Client } from '../types';

interface PublicDocumentViewProps {
  /** Share token from /?doc=…, or null for a link from an older version that can't be opened. */
  token: string | null;
  onOpenClientSignIn: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  invoice: 'Tax Invoice',
  quote: 'Quotation',
  receipt: 'Receipt',
  credit_note: 'Credit Note'
};

function money(currency: string, value: number | undefined) {
  return `${currency} $${(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PublicDocumentView({ token, onOpenClientSignIn }: PublicDocumentViewProps) {
  const [data, setData] = useState<PublicDocumentData | null>(null);
  const [error, setError] = useState<string | null>(token ? null : 'legacy');
  const [loading, setLoading] = useState(Boolean(token));
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payMethod, setPayMethod] = useState('M-PAiSA');
  const [payRef, setPayRef] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchPublicDocument(token)
      .then(setData)
      .catch(err => setError(err?.message || 'This document could not be loaded.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <Shell><p className="text-sm text-slate-500 text-center py-16">Loading document…</p></Shell>;
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center py-12 space-y-3 px-4">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
          <h1 className="text-base font-bold text-slate-900">
            {error === 'legacy' ? 'This link has been updated' : 'Document unavailable'}
          </h1>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {error === 'legacy'
              ? 'Links from older invoices no longer open directly. Ask the business to resend the document, or sign in to your client portal to see all your invoices and quotes.'
              : error}
          </p>
          <button
            type="button"
            onClick={onOpenClientSignIn}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" /> Client portal sign-in
          </button>
        </div>
      </Shell>
    );
  }

  const { document: d, business, client } = data;
  const currency = d.currency || 'FJD';
  const brand = business.colorTheme || '#0284c7';
  const paidSoFar = d.status === 'paid' ? d.total : (d.partiallyPaidAmount || 0);
  const balance = Math.max(0, d.total - paidSoFar);
  const taxLines = d.appliedTaxes?.length
    ? d.appliedTaxes.map(t => ({ label: `${t.name}${t.rateType === 'percentage' ? ` (${t.rate}%)` : ''}`, amount: t.amount }))
    : d.vatAmount ? [{ label: `VAT (${d.vatRate}%)`, amount: d.vatAmount }] : [];
  const feeLines = (d.appliedFees || []).map(f => ({ label: f.name, amount: f.amount }));
  // Hide the bookkeeping line the app adds when a client reports a payment.
  const clientNotes = (d.notes || '').split('\n').filter(line => !line.startsWith('[Client reported payment')).join('\n').trim();

  const handleAccept = async () => {
    setBusy(true);
    try {
      await acceptPublicQuote(token!);
      setData({ ...data, document: { ...d, status: 'accepted' } });
      setNotice({ text: `Quote accepted. ${business.name || 'The business'} will see it in Frilensa.`, ok: true });
    } catch (err: any) {
      setNotice({ text: err?.message || 'Couldn’t accept the quote. Try again.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleReportPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await reportPublicPayment(token!, { method: payMethod, reference: payRef });
      setData({ ...data, document: { ...d, clientPaymentReport: { method: payMethod, reference: payRef, reportedAt: new Date().toISOString(), status: 'pending' } } });
      setShowPayForm(false);
      setNotice({ text: 'Thanks. Your payment was reported. The business will confirm it once it arrives.', ok: true });
    } catch (err: any) {
      setNotice({ text: err?.message || 'Couldn’t report the payment. Try again.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    downloadDocumentPdf(d, { id: d.businessId, ...business } as Business, { id: d.clientId, name: client.name } as Client, null);
  };

  return (
    <Shell>
      <div className="h-2" style={{ backgroundColor: brand }} />
      <div className="p-5 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-slate-900">{business.name}</h1>
            {business.brandSlogan && <p className="text-xs text-slate-500">{business.brandSlogan}</p>}
            <div className="text-xs text-slate-500 space-y-0.5">
              {business.address && <p>{business.address}</p>}
              {(business.email || business.phone) && <p>{[business.email, business.phone].filter(Boolean).join(' · ')}</p>}
              {business.tin && <p>TIN: {business.tin}</p>}
            </div>
          </div>
          <div className="sm:text-right space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: brand }}>{TYPE_LABEL[d.type] || 'Document'}</p>
            <p className="text-base font-mono font-bold text-slate-900">#{d.documentNumber}</p>
            <p className="text-xs text-slate-500">Issued {d.issueDate}{d.dueDate ? ` · Due ${d.dueDate}` : ''}</p>
            <StatusBadge status={d.status} reported={Boolean(d.clientPaymentReport) && d.clientPaymentReport?.status !== 'rejected'} />
          </div>
        </div>

        <div className="text-xs text-slate-600">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Billed to</span>
          <span className="font-semibold text-slate-900">{client.name}</span>
        </div>

        {/* Items */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Item</th>
                <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Qty</th>
                <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Rate</th>
                <th className="text-right font-semibold px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(d.items || []).map((it, i) => (
                <tr key={it.id || i} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-slate-900">{it.name}</span>
                    {it.description && <span className="block text-slate-500">{it.description}</span>}
                    <span className="sm:hidden block text-slate-400">{it.quantity} × {money(currency, it.rate)}</span>
                  </td>
                  <td className="px-3 py-2 text-right hidden sm:table-cell">{it.quantity}{it.unit ? ` ${it.unit}` : ''}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap hidden sm:table-cell">{money(currency, it.rate)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{money(currency, it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="ml-auto w-full sm:w-72 text-xs space-y-1.5">
          <Row label="Subtotal" value={money(currency, d.subtotal)} />
          {[...taxLines, ...feeLines].map((l, i) => <Row key={i} label={l.label} value={money(currency, l.amount)} />)}
          <div className="border-t border-slate-200 pt-1.5">
            <Row label="Total" value={money(currency, d.total)} strong />
          </div>
          {d.type === 'invoice' && paidSoFar > 0 && d.status !== 'paid' && <Row label="Paid so far" value={money(currency, paidSoFar)} />}
          {d.type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled' && <Row label="Balance due" value={money(currency, balance)} strong />}
        </div>

        {/* How to pay */}
        {d.type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled' && (business.bankDetails || business.mPaisaId || business.myCashId) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">How to pay</p>
            {business.bankDetails && <p className="whitespace-pre-line">{business.bankDetails}</p>}
            {business.mPaisaId && <p>M-PAiSA: <strong>{business.mPaisaId}</strong></p>}
            {business.myCashId && <p>MyCash: <strong>{business.myCashId}</strong></p>}
            <p className="text-slate-500">Reference: <strong>{d.documentNumber}</strong></p>
          </div>
        )}

        {clientNotes && <p className="text-xs text-slate-500 whitespace-pre-line">{clientNotes}</p>}

        {d.type === 'invoice' && d.status !== 'paid' && d.clientPaymentReport?.status === 'rejected' && !notice && (
          <div className="rounded-xl px-4 py-3 text-xs font-semibold bg-rose-50 text-rose-700">
            Your reported payment (ref {d.clientPaymentReport.reference}) couldn't be matched.{d.clientPaymentReport.rejectionReason ? ` ${d.clientPaymentReport.rejectionReason}` : ''} Check the details and report it again.
          </div>
        )}

        {notice && (
          <div className={`rounded-xl px-4 py-3 text-xs font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
            {notice.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {d.type === 'quote' && d.status === 'sent' && (
            <button type="button" disabled={busy} onClick={handleAccept}
              className="px-4 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 cursor-pointer" style={{ backgroundColor: brand }}>
              <CheckCircle2 className="w-4 h-4 inline -mt-0.5 mr-1" /> Accept quote
            </button>
          )}
          {d.type === 'invoice' && (d.status === 'sent' || d.status === 'partial') && (!d.clientPaymentReport || d.clientPaymentReport.status === 'rejected') && !showPayForm && (
            <button type="button" onClick={() => setShowPayForm(true)}
              className="px-4 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer" style={{ backgroundColor: brand }}>
              I've paid this invoice
            </button>
          )}
          <button type="button" onClick={handleDownload}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer">
            <Download className="w-4 h-4 inline -mt-0.5 mr-1" /> Download PDF
          </button>
        </div>

        {showPayForm && (
          <form onSubmit={handleReportPayment} className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-800">Tell {business.name || 'the business'} about your payment</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Method
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 normal-case font-medium">
                  <option>M-PAiSA</option>
                  <option>MyCash</option>
                  <option>Bank transfer</option>
                  <option>Cash</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Transaction reference
                <input required value={payRef} onChange={e => setPayRef(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 normal-case font-medium" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">Send</button>
              <button type="button" onClick={() => setShowPayForm(false)} className="px-4 py-2 rounded-xl text-slate-500 text-xs font-bold cursor-pointer">Cancel</button>
            </div>
          </form>
        )}

        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Sent with Frilensa</span>
          <button type="button" onClick={onOpenClientSignIn} className="underline font-semibold cursor-pointer">
            See all your documents in the client portal
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 font-sans antialiased">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean; key?: React.Key }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-bold text-slate-900 text-sm' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function StatusBadge({ status, reported }: { status: string; reported: boolean }) {
  if (status !== 'paid' && reported) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"><Clock className="w-3 h-3" /> Payment reported</span>;
  }
  const styles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    partial: 'bg-amber-50 text-amber-800 border-amber-200',
    cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
    sent: 'bg-sky-50 text-sky-700 border-sky-200'
  };
  const label: Record<string, string> = { paid: 'Paid', accepted: 'Accepted', partial: 'Partly paid', cancelled: 'Cancelled', sent: 'Awaiting payment' };
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[status] || styles.sent}`}>{label[status] || status}</span>;
}
