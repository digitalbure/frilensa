import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, Send, Check, X, ShieldCheck, RefreshCw, Eye, 
  FileText, Clock, AlertCircle, Sparkles, ExternalLink, 
  Paperclip, CheckCircle2, ChevronRight, User, Building2
} from 'lucide-react';
import { CRMDocument, Business, Client, UserProfile } from '../types';
import { sendDocumentEmail, getEmailServiceConfig, EmailServiceConfig, EmailSendResult } from '../lib/emailService';

interface EmailDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CRMDocument | null;
  business: Business;
  client?: Client | null;
  userProfile: UserProfile;
  consultantEmail?: string;
  onDocumentUpdated?: (updatedDoc: CRMDocument) => void;
}

export default function EmailDocumentModal({
  isOpen,
  onClose,
  document,
  business,
  client,
  userProfile,
  consultantEmail,
  onDocumentUpdated
}: EmailDocumentModalProps) {
  if (!isOpen || !document) return null;

  const docTypeLabel = document.type === 'quote' ? 'Quotation' :
                       document.type === 'receipt' ? 'Official Receipt' :
                       document.type === 'credit_note' ? 'Credit Note' : 'Tax Invoice';

  const defaultRecipient = client?.email || '';
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipient);
  const [ccConsultant, setCcConsultant] = useState(true);
  const [attachPdf, setAttachPdf] = useState(true);
  const [customSubject, setCustomSubject] = useState(
    `${docTypeLabel} #${document.documentNumber} from ${business.name}`
  );
  const [customMessage, setCustomMessage] = useState(
    document.type === 'receipt'
      ? `Bula! Vinaka vaka levu for your payment. Please find your official receipt attached.`
      : document.type === 'quote'
      ? `Bula! Please find your requested quotation attached. Feel free to review and accept online.`
      : `Bula! Please find your tax invoice attached. Online payment instructions (including M-PAiSA and Bank Transfer) are provided inside.`
  );

  const [activeTab, setActiveTab] = useState<'compose' | 'preview' | 'history'>('compose');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<EmailSendResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<EmailServiceConfig | null>(null);

  // Load email configuration status
  useEffect(() => {
    getEmailServiceConfig().then(cfg => setConfig(cfg));
  }, []);

  // Update fields when document or client changes
  useEffect(() => {
    if (client?.email) {
      setRecipientEmail(client.email);
    }
    setCustomSubject(`${docTypeLabel} #${document.documentNumber} from ${business.name}`);
  }, [document.id, client?.id]);

  const handleSend = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setErrorMessage('Please provide a valid client email address.');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const result = await sendDocumentEmail({
        document,
        business,
        client,
        userProfile,
        recipientEmail: recipientEmail.trim(),
        customSubject: customSubject.trim(),
        customMessage: customMessage.trim(),
        ccConsultant,
        consultantEmail: consultantEmail || userProfile.email,
        attachPdf
      });

      setSendResult(result);
      if (result.updatedDocument && onDocumentUpdated) {
        onDocumentUpdated(result.updatedDocument);
      }
    } catch (err: any) {
      console.error('Email sending error:', err);
      setErrorMessage(err.message || 'Failed to dispatch email. Please check internet connection.');
    } finally {
      setIsSending(false);
    }
  };

  const emailHistory = document.emailHistory || [];

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white text-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-white">
                  Email {docTypeLabel} #{document.documentNumber}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  {document.currency || userProfile.defaultCurrency || 'FJD'} ${document.total.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Direct delivery to {client?.name || 'Client'} &bull; {business.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab('compose')}
            className={`py-3 px-4 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'compose'
                ? 'border-sky-600 text-sky-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Compose Message
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`py-3 px-4 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'preview'
                ? 'border-sky-600 text-sky-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Branded Email Preview
          </button>
          {emailHistory.length > 0 && (
            <button
              onClick={() => setActiveTab('history')}
              className={`py-3 px-4 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-sky-600 text-sky-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Send History ({emailHistory.length})
            </button>
          )}
        </div>

        {/* Provider Status Pill Bar */}
        <div className="bg-sky-50/60 border-b border-sky-100 px-5 py-2 flex items-center justify-between text-[11px] text-sky-800 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span>
              {config?.sendgridConfigured ? (
                <>Delivered via <strong>Twilio SendGrid</strong> with automatic PDF attachment</>
              ) : (
                <>Delivered via <strong>Firebase Trigger Email</strong> &amp; SendGrid Pipeline</>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operational
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-5 overflow-y-auto">
          {sendResult ? (
            /* Success View */
            <div className="text-center py-8 px-4 space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Email Successfully Dispatched!</h3>
                <p className="text-xs text-slate-600 mt-1">
                  {docTypeLabel} #{document.documentNumber} was sent to <strong>{sendResult.recipient}</strong>.
                </p>
                {sendResult.deliveryNote && (
                  <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mt-3 text-left">
                    {sendResult.deliveryNote}
                  </p>
                )}
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={() => setSendResult(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Send Another Copy
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-sky-600/20"
                >
                  Done
                </button>
              </div>
            </div>
          ) : activeTab === 'compose' ? (
            /* Compose Form */
            <div className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Recipient Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="client@company.com"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-hidden font-medium"
                    required
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
                {client?.name && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Client: <strong>{client.name}</strong> {client.phone ? `(${client.phone})` : ''}
                  </p>
                )}
              </div>

              {/* Subject Line */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-hidden font-medium"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Personalized Message / Note to Client
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-hidden font-sans resize-none"
                  placeholder="Include any personalized greeting or special payment notes..."
                />
              </div>

              {/* Options Checkboxes */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-2.5">
                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(e) => setAttachPdf(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                    Attach high-resolution official PDF document
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ccConsultant}
                    onChange={(e) => setCcConsultant(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <span>
                    Send a CC copy to me ({consultantEmail || userProfile.email || 'my email'})
                  </span>
                </label>
              </div>

              {/* Document Summary Card */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Document Attached
                  </span>
                  <span className="font-extrabold text-slate-800">
                    {docTypeLabel} #{document.documentNumber}
                  </span>
                  <span className="text-slate-500 text-[11px] block">
                    {document.items.length} line item{document.items.length !== 1 ? 's' : ''} &bull; Due: {document.dueDate || 'Upon receipt'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Due
                  </span>
                  <span className="font-mono font-black text-sky-700 text-sm">
                    {document.currency || userProfile.defaultCurrency || 'FJD'} ${document.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : activeTab === 'preview' ? (
            /* Live Email Preview */
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                This is a live rendered preview of the responsive HTML email template your client will receive in their email inbox:
              </p>
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-slate-100 min-h-[420px]">
                <iframe
                  title="Email Preview"
                  srcDoc={`
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 16px; background: #f8fafc; color: #0f172a; }
    .box { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; }
    .banner { background: ${business.colorTheme || '#0284c7'}; color: #fff; padding: 24px; }
    .content { padding: 24px; }
    .pill { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; margin-top: 10px; }
    .table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 12px; }
    .table th { text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 10px; }
    .table td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .btn { display: block; background: ${business.colorTheme || '#0284c7'}; color: #fff; text-align: center; padding: 12px; border-radius: 10px; font-weight: bold; text-decoration: none; margin: 18px 0; font-size: 13px; }
    .footer { background: #f8fafc; padding: 16px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="banner">
      <h2 style="margin:0 0 4px 0; font-size: 18px;">${business.name}</h2>
      <p style="margin:0; font-size: 12px; opacity: 0.9;">${business.tagline || 'Pacific Freelance & Business Consulting'}</p>
      <div class="pill">${docTypeLabel.toUpperCase()} #${document.documentNumber}</div>
    </div>
    <div class="content">
      <p style="font-size: 14px; font-weight: bold; margin-top: 0;">Bula ${client?.name || 'Valued Client'},</p>
      <p style="font-size: 13px; line-height: 1.5; color: #334155;">
        ${customMessage ? customMessage.replace(/\n/g, '<br/>') : 'Please find your document attached.'}
      </p>
      <table class="table">
        <thead>
          <tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Total</th></tr>
        </thead>
        <tbody>
          ${document.items.map(it => `
            <tr>
              <td><strong>${it.name}</strong></td>
              <td style="text-align:right">${it.quantity} &times; $${it.rate.toFixed(2)}</td>
              <td style="text-align:right; font-weight:bold">$${it.total.toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr style="font-size: 14px; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <td colspan="2">TOTAL AMOUNT:</td>
            <td style="text-align:right; color:${business.colorTheme || '#0284c7'}">${document.currency || 'FJD'} $${document.total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="btn">&#128279; View & Pay Online via Secure Client Portal</div>
      ${business.bankDetails ? `
        <div style="background:#f1f5f9; padding:12px; border-radius:8px; font-size:11px; margin-top:14px;">
          <strong>Banking Instructions:</strong><br/>
          <span style="font-family: monospace;">${business.bankDetails.replace(/\n/g, '<br/>')}</span>
        </div>
      ` : ''}
    </div>
    <div class="footer">
      Official invoice delivery via <strong>Frilensa</strong> &bull; FRCS Tax Compliant
    </div>
  </div>
</body>
</html>
                  `}
                  className="w-full h-[460px] border-0"
                />
              </div>
            </div>
          ) : (
            /* Send History */
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700">Previous Deliveries</h4>
              <div className="space-y-2">
                {emailHistory.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800">{item.recipientEmail}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {item.provider.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.subject}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      {new Date(item.sentAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!sendResult && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleSend}
              disabled={isSending || !recipientEmail}
              className={`px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                isSending || !recipientEmail
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20'
              }`}
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Dispatching Email...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send {docTypeLabel} to Client</span>
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
