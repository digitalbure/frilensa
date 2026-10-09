import React, { useState } from 'react';
import { documentPublicUrl } from '../lib/documentLinks';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  FileText, CheckCircle2, ShieldCheck, Printer, Copy, Check, 
  Smartphone, Building2, Calendar, DollarSign, Download, Share2, 
  ExternalLink, Waves, Briefcase, Sparkles, AlertCircle, ArrowRight, X,
  Ban, AlertTriangle, Clock, Paperclip, Eye
} from 'lucide-react';
import { CRMDocument, Business, Client, UserProfile } from '../types';
import { downloadDocumentPdf } from '../lib/pdfGenerator';

interface OnlineDocumentModalProps {
  document: CRMDocument;
  business: Business;
  client?: Client;
  userProfile: UserProfile;
  onClose: () => void;
  onMarkPaid?: (docId: string, paymentMethod?: string) => void;
  onAcceptQuote?: (docId: string) => void;
}

export default function OnlineDocumentModal({
  document,
  business,
  client,
  userProfile,
  onClose,
  onMarkPaid,
  onAcceptQuote
}: OnlineDocumentModalProps) {
  const [activePaymentTab, setActivePaymentTab] = useState<'mpaisa' | 'mycash' | 'bank'>('mpaisa');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedBankRef, setCopiedBankRef] = useState(false);
  const [mPaisaRefInput, setMPaisaRefInput] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [quoteAcceptedSuccess, setQuoteAcceptedSuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownloadPdf = () => {
    try {
      downloadDocumentPdf(document, business, client, userProfile);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to download PDF:', err);
    }
  };

  // Verification URL encoded in QR Code
  const documentUrl = documentPublicUrl(document) || '';

  const verificationHash = `FRCS-FJ-${document.documentNumber}-${(business.tin || 'TAX').replace(/[^0-9]/g, '').slice(0, 6)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(documentUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareNative = async () => {
    const docTitle = document.type === 'invoice' ? 'Tax Invoice' : 
                     document.type === 'receipt' ? 'Receipt' :
                     document.type === 'quote' ? 'Quote' : 'Credit Note';

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${docTitle} #${document.documentNumber} - ${business.name}`,
          text: `Bula! Please view your ${docTitle} #${document.documentNumber} from ${business.name} (${document.currency || userProfile.defaultCurrency || 'FJD'} $${document.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
          url: documentUrl
        });
        return;
      } catch (err) {
        // Fallback to copy
      }
    }
    handleCopyLink();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleConfirmMPaisaPayment = () => {
    if (onMarkPaid) {
      onMarkPaid(document.id, 'M-Paisa');
    }
    setPaymentSuccess(true);
  };

  const handleConfirmQuoteAcceptance = () => {
    if (onAcceptQuote) {
      onAcceptQuote(document.id);
    }
    setQuoteAcceptedSuccess(true);
  };

  const isCancelled = document.status === 'cancelled';
  const isPaid = document.status === 'paid' || paymentSuccess;
  const isAccepted = document.status === 'accepted' || quoteAcceptedSuccess;
  const isTaxExemptDoc = document.isTaxExempt || userProfile.enableTax === false || document.taxTotal === 0;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh] relative"
      >
        {/* Top Sticky Bar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs tracking-wide">Official Online Document Portal</span>
                {isCancelled ? (
                  <span className="bg-rose-500/20 text-rose-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-500/30 flex items-center gap-1">
                    <Ban className="w-2.5 h-2.5" />
                    VOID / CANCELLED
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    ISSUED
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-mono">Hash: {verificationHash}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title="Download PDF Document"
            >
              {downloadSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-sky-400" />}
              <span className="hidden sm:inline">{downloadSuccess ? 'Downloaded!' : 'Download PDF'}</span>
            </button>
            <button
              onClick={handleShareNative}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title="Share or Copy Public Link"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'Copied!' : 'Share'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cancelled Banner if applicable */}
        {isCancelled && (
          <div className="bg-rose-50 border-b border-rose-200 p-4 text-rose-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <h4 className="font-extrabold uppercase tracking-wide text-rose-800">
                This Document Has Been Officially Cancelled / Voided
              </h4>
              <p className="text-[11px] text-rose-700 mt-0.5">
                <strong>Reason:</strong> {document.cancellationReason || 'Cancelled by account issuer'}
                {document.cancelledAt && ` on ${new Date(document.cancelledAt).toLocaleDateString()}`}.
                {document.creditNoteNumber && (
                  <span className="block mt-1 font-mono font-bold text-rose-950">
                    Linked Offset Credit Note: #{document.creditNoteNumber}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 text-slate-700 font-sans text-xs print:p-0 relative">
          
          {/* Cancelled watermark */}
          {isCancelled && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 select-none z-10">
              <span className="text-8xl font-black text-rose-600 border-8 border-rose-600 p-6 rounded-3xl rotate-[-25deg] uppercase">
                VOID
              </span>
            </div>
          )}

          {/* Document Header & QR Code Banner */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-200">
            {/* Vendor Details */}
            <div className="space-y-1.5 max-w-sm">
              <div className="flex items-center gap-2.5 mb-1">
                {/* Logo Image */}
                {((business.logoType === 'image' || (!business.logoType && business.logoUrl)) && business.logoUrl) && (
                  <img 
                    src={business.logoUrl} 
                    alt={business.name || 'Company Logo'} 
                    className="max-h-12 max-w-[140px] w-auto object-contain rounded-lg shadow-2xs shrink-0 border border-slate-100 bg-white p-0.5"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}

                {/* Logo Monogram Text */}
                {business.logoType === 'text' && business.logoText && (
                  <div 
                    className="px-2.5 py-1.5 rounded-xl font-mono font-black text-white text-xs tracking-wider shadow-xs shrink-0"
                    style={{ backgroundColor: business.colorTheme || '#0284c7' }}
                  >
                    {business.logoText.toUpperCase()}
                  </div>
                )}

                {/* Logo Symbol / Icon */}
                {(business.logoType === 'symbol' || (!business.logoUrl && business.logoType !== 'text')) && (
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0"
                    style={{ backgroundColor: business.colorTheme || '#0284c7' }}
                  >
                    {business.logoSymbol === 'Briefcase' && <Briefcase className="w-5 h-5" />}
                    {business.logoSymbol === 'Building2' && <Building2 className="w-5 h-5" />}
                    {business.logoSymbol === 'ShieldCheck' && <ShieldCheck className="w-5 h-5" />}
                    {business.logoSymbol === 'Sparkles' && <Sparkles className="w-5 h-5" />}
                    {(!business.logoSymbol || business.logoSymbol === 'Waves') && <Waves className="w-5 h-5" />}
                  </div>
                )}

                <div>
                  <h2 className="font-black text-slate-900 text-base leading-tight">{business.name || userProfile.name}</h2>
                  {business.brandSlogan && <p className="text-[10px] text-slate-400 italic">{business.brandSlogan}</p>}
                </div>
              </div>

              <p className="text-slate-500 text-[11px] leading-relaxed">{business.address || 'Suva, Fiji Islands'}</p>
              <div className="flex flex-wrap gap-x-3 text-[10.5px] text-slate-500">
                <span>Email: <strong className="text-slate-700">{business.email || userProfile.email}</strong></span>
                <span>Phone: <strong className="text-slate-700">{business.phone || userProfile.phone || '+679 991 2345'}</strong></span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-slate-800 text-[11px] pt-0.5">
                <span>
                  TIN: <span className="font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-sky-900">{business.tin || userProfile.tin}</span>
                </span>
                {business.registrationNumber && (
                  <span>
                    Reg #: <span className="font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">{business.registrationNumber}</span>
                  </span>
                )}
              </div>
              {business.socials && business.socials.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {business.socials.map((s, idx) => (
                    <span key={s.id || idx} className="text-[9.5px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                      <strong className="capitalize">{s.platform}:</strong> {s.handle}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Document Meta & Autogenerated QR Code */}
            <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-3 w-full sm:w-auto text-right">
              <div>
                <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                  isCancelled ? 'bg-rose-100 text-rose-800' :
                  document.type === 'invoice' ? 'bg-sky-100 text-sky-800' :
                  document.type === 'receipt' ? 'bg-emerald-100 text-emerald-800' :
                  document.type === 'credit_note' ? 'bg-purple-100 text-purple-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {isCancelled ? 'CANCELLED / VOID' :
                   document.type === 'invoice' ? (isTaxExemptDoc ? 'INVOICE (NON-VAT)' : 'TAX INVOICE') :
                   document.type === 'credit_note' ? 'CREDIT NOTE' :
                   document.type.toUpperCase()}
                </span>
                <h3 className="font-mono font-black text-slate-900 text-sm mt-1">#{document.documentNumber}</h3>
                <p className="text-[10.5px] text-slate-400 mt-0.5">Issue Date: <strong className="text-slate-700">{document.issueDate}</strong></p>
                {document.dueDate && (
                  <p className="text-[10.5px] text-slate-400">Due Date: <strong className="text-rose-600">{document.dueDate}</strong></p>
                )}
                <div className="mt-1.5 flex justify-end">
                  {isCancelled ? (
                    <span className="bg-rose-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <Ban className="w-3 h-3" /> VOIDED
                    </span>
                  ) : isPaid ? (
                    <span className="bg-emerald-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <Check className="w-3 h-3" /> PAID IN FULL
                    </span>
                  ) : document.status === 'partial' ? (
                    <span className="bg-amber-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> PARTIALLY PAID
                    </span>
                  ) : isAccepted ? (
                    <span className="bg-sky-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <Check className="w-3 h-3" /> QUOTE ACCEPTED
                    </span>
                  ) : (
                    <span className={`font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      document.status === 'sent' ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      STATUS: {document.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic QR Code */}
              <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center gap-1 text-center shrink-0">
                <QRCodeSVG
                  value={documentUrl}
                  size={84}
                  level="M"
                  includeMargin={false}
                />
                <span className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-tighter">
                  Scan to View & Pay
                </span>
              </div>
            </div>
          </div>

          {/* Billed To Customer Information */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Billed To Customer / Client:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">{client?.name || 'Valued Client'}</h4>
                {(client?.contactPerson || client?.contactName) && (
                  <p className="text-slate-700 font-semibold text-[11px] mt-0.5">
                    Attn: <span>{client?.contactPerson || client?.contactName}</span>
                  </p>
                )}
                <p className="text-slate-500 text-[11px] mt-0.5">{client?.address || 'Fiji Islands'}</p>
              </div>
              <div className="text-left sm:text-right space-y-0.5 text-[11px]">
                {client?.email && <p className="text-slate-600">Email: <strong>{client.email}</strong></p>}
                {client?.phone && <p className="text-slate-600">Phone: <strong>{client.phone}</strong></p>}
                {client?.tin && (
                  <p className="text-slate-800 font-mono text-[10px]">
                    Client TIN: <strong>{client.tin}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="border-b border-slate-300 pb-1.5 grid grid-cols-12 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              <span className="col-span-6 sm:col-span-7">Description / Scope Deliverable</span>
              <span className="col-span-2 text-center">Qty / Hrs</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Amount ({document.currency || userProfile.defaultCurrency || 'FJD'})</span>
            </div>

            <div className="space-y-2 divide-y divide-slate-100">
              {document.items.map((it, idx) => (
                <div key={it.id || idx} className="pt-2 grid grid-cols-12 items-center text-xs">
                  <div className="col-span-6 sm:col-span-7 pr-2">
                    <span className="font-bold text-slate-800 block">{it.name}</span>
                    {it.description && <p className="text-[10px] text-slate-400 mt-0.5">{it.description}</p>}
                  </div>
                  <div className="col-span-2 text-center font-mono text-slate-600">
                    {it.quantity}
                  </div>
                  <div className="col-span-2 text-right font-mono text-slate-600">
                    ${it.rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-slate-900">
                    ${it.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals & Fiji Statutory Charges */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-4 border-t border-slate-200">
            {/* Notes & Advice */}
            <div className="max-w-xs space-y-1 text-[10.5px]">
              <span className="font-bold text-slate-500 uppercase tracking-wider block text-[9.5px]">Notes & Payment Terms:</span>
              <p className="text-slate-500 leading-relaxed">{document.notes || 'Vinaka vakalevu for your business partnership.'}</p>
              {isTaxExemptDoc && (
                <span className="text-[9.5px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono inline-block mt-1">
                  Tax-Exempt / 0% VAT Invoicing (Section 21 FRCS Exemption)
                </span>
              )}
            </div>

            {/* Financial Totals */}
            <div className="w-full sm:w-64 space-y-1.5 text-xs bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal:</span>
                <span className="font-mono font-bold">${document.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              {!isTaxExemptDoc && (
                <>
                  {document.appliedTaxes && document.appliedTaxes.length > 0 ? (
                    document.appliedTaxes.map((tax) => (
                      <div key={tax.id} className="flex justify-between text-sky-800 text-[11px]">
                        <span>{tax.name} ({tax.rateType === 'flat' ? `$${tax.rate}` : `${tax.rate}%`}):</span>
                        <span className="font-mono font-bold">${tax.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between text-sky-800 text-[11px]">
                      <span>Fiji VAT ({document.vatRate || 12.5}%):</span>
                      <span className="font-mono font-bold">${(document.vatAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </>
              )}

              {document.appliedFees && document.appliedFees.length > 0 && (
                document.appliedFees.map((fee) => (
                  <div key={fee.id} className="flex justify-between text-emerald-800 text-[11px]">
                    <span>{fee.name} ({fee.rateType === 'flat' ? `$${fee.rate}` : `${fee.rate}%`}):</span>
                    <span className="font-mono font-bold">${fee.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ))
              )}

              <div className="pt-2 border-t border-slate-300 flex justify-between items-baseline text-slate-900 font-black text-sm">
                <span>TOTAL DUE:</span>
                <span className="font-mono text-sky-700 text-base">
                  {document.currency || userProfile.defaultCurrency || 'FJD'} ${document.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Online Payment & Acceptance Gateway Section */}
          {!isCancelled && !isPaid && document.type !== 'receipt' && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 print:hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-white">Pay Online / Pacific Payment Options</h4>
                    <p className="text-[10px] text-slate-400">Instant mobile wallet & direct local Fiji bank settlement</p>
                  </div>
                </div>

                {document.type === 'quote' && !isAccepted && (
                  <button
                    onClick={handleConfirmQuoteAcceptance}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Accept & Sign Quote
                  </button>
                )}
              </div>

              {/* Payment Method Switcher */}
              <div className="grid grid-cols-3 gap-2 bg-slate-800/80 p-1 rounded-xl">
                <button
                  onClick={() => setActivePaymentTab('mpaisa')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activePaymentTab === 'mpaisa' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vodafone M-PAiSA
                </button>
                <button
                  onClick={() => setActivePaymentTab('mycash')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activePaymentTab === 'mycash' ? 'bg-red-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Digicel MyCash
                </button>
                <button
                  onClick={() => setActivePaymentTab('bank')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activePaymentTab === 'bank' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fiji Bank Wire
                </button>
              </div>

              {/* M-PAiSA Payment Info */}
              {activePaymentTab === 'mpaisa' && (
                <div className="space-y-3 pt-1">
                  <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Registered M-Paisa Mobile Number</span>
                      <span className="font-mono font-black text-sm text-white">{business.mPaisaId || userProfile.phone || '+679 991 2345'}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(business.mPaisaId || userProfile.phone || '+679 991 2345');
                        setCopiedBankRef(true);
                        setTimeout(() => setCopiedBankRef(false), 2000);
                      }}
                      className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedBankRef ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedBankRef ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Confirm M-Paisa Transaction Reference / SMS Receipt Code
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mPaisaRefInput}
                        onChange={(e) => setMPaisaRefInput(e.target.value)}
                        placeholder="e.g. MP882947291"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                      <button
                        onClick={handleConfirmMPaisaPayment}
                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Confirm Sent
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MyCash Payment Info */}
              {activePaymentTab === 'mycash' && (
                <div className="space-y-3 pt-1">
                  <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Registered Digicel MyCash Mobile ID</span>
                      <span className="font-mono font-black text-sm text-white">{business.myCashId || userProfile.phone || '+679 701 2345'}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(business.myCashId || userProfile.phone || '+679 701 2345');
                        setCopiedBankRef(true);
                        setTimeout(() => setCopiedBankRef(false), 2000);
                      }}
                      className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedBankRef ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedBankRef ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mPaisaRefInput}
                      onChange={(e) => setMPaisaRefInput(e.target.value)}
                      placeholder="e.g. MC994821039"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <button
                      onClick={handleConfirmMPaisaPayment}
                      className="bg-red-700 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Confirm Sent
                    </button>
                  </div>
                </div>
              )}

              {/* Bank Wire Details */}
              {activePaymentTab === 'bank' && (
                <div className="space-y-3 pt-1">
                  <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50 space-y-2">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Fiji Commercial Bank Account Details</span>
                    <p className="font-mono text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                      {business.bankDetails || 'Bank: Westpac / ANZ Bank Fiji\nAccount Name: ' + (business.name || userProfile.name) + '\nBSB / Branch: 039-001\nAccount Number: 9801234567\nPayment Reference: ' + document.documentNumber}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(business.bankDetails || `${business.name} - ${document.documentNumber}`);
                      setCopiedBankRef(true);
                      setTimeout(() => setCopiedBankRef(false), 2000);
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedBankRef ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedBankRef ? 'Bank Details Copied!' : 'Copy Bank Account & Reference Code'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Attached Payment Proofs & Remittance Records */}
          {document.paymentAttachments && document.paymentAttachments.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-sky-100 text-sky-700 rounded-lg">
                  <Paperclip className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-black text-slate-800">Verified Payment Records & Proofs</h4>
                  <p className="text-[10px] text-slate-500">
                    {document.paymentAttachments.length} document{document.paymentAttachments.length > 1 ? 's' : ''} on record for this invoice
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {document.paymentAttachments.map((att) => {
                  const isImage = att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
                  return (
                    <div
                      key={att.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isImage ? (
                          <img
                            src={att.dataUrl}
                            alt={att.name}
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate" title={att.name}>
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {(att.size / 1024).toFixed(0)} KB • {new Date(att.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <a
                        href={att.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg flex items-center gap-1 shrink-0 transition-all"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Statutory Note */}
          <div className="text-center pt-4 border-t border-slate-200 text-[9.5px] text-slate-400 space-y-1">
            <p>Generated via Frilensa • Fiji & Pacific Cloud Invoicing and Escrow Suite</p>
            <p className="font-mono">Document Token: {document.id} • Verified Timestamp: {new Date().toISOString()}</p>
          </div>

        </div>

        {/* Modal Footer Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all cursor-pointer"
          >
            Close Viewer
          </button>
        </div>
      </motion.div>
    </div>
  );
}
