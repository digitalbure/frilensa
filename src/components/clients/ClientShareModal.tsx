import React from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Share2, X, Briefcase, User, Mail, Link2, Copy, Check, QrCode, 
  ExternalLink, MessageSquare, Send, CheckCircle2, AlertTriangle, 
  RefreshCw, Trash2, ShieldCheck, Sparkles, Link 
} from 'lucide-react';
import { Client } from '../../types';
import { getCurrencyConfig } from '../../lib/currencies';

interface ClientShareModalProps {
  client: Client | null;
  onClose: () => void;
  onGenerateAccessLink: (client: Client, e?: React.MouseEvent) => Promise<void>;
  onRevokeAccessLink: (client: Client, e?: React.MouseEvent) => Promise<void>;
  onCopyAccessLink: (client: Client, e?: React.MouseEvent) => Promise<void>;
  copiedClientId: string | null;
  generatingLinkId: string | null;
}

export default function ClientShareModal({
  client,
  onClose,
  onGenerateAccessLink,
  onRevokeAccessLink,
  onCopyAccessLink,
  copiedClientId,
  generatingLinkId
}: ClientShareModalProps) {
  if (!client) return null;

  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const portalUrl = client.accessToken
    ? `${origin}${pathname}?token=${encodeURIComponent(client.accessToken)}`
    : '';

  const representative = client.contactPerson || client.contactName || client.name;

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Share client portal
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Portal link for <span className="text-sky-300 font-semibold">{client.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Client Profile Header Pill */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</span>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{client.name}</span>
              </h4>
              {(client.contactPerson || client.contactName) && (
                <p className="text-xs text-slate-600 font-medium flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Contact: {client.contactPerson || client.contactName}</span>
                </p>
              )}
              <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{client.email || 'No email'}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
              {client.currency && (
                <span className="bg-sky-50 text-[10px] text-sky-800 font-bold px-2 py-0.5 rounded-full border border-sky-200 font-mono">
                  {getCurrencyConfig(client.currency).flag} {client.currency}
                </span>
              )}
              {client.accessToken ? (
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Link active
                </span>
              ) : (
                <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> No link yet
                </span>
              )}
            </div>
          </div>

          {client.accessToken ? (
            <>
              {/* Shareable Link Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-sky-600" /> Portal link
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Token: {client.accessToken.substring(0, 16)}...
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl p-1.5 pl-3 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all">
                  <input
                    type="text"
                    readOnly
                    value={portalUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full bg-transparent text-xs font-mono text-slate-800 focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={(e) => onCopyAccessLink(client, e)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer ${
                      copiedClientId === client.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-sky-600 hover:bg-sky-700 text-white'
                    }`}
                  >
                    {copiedClientId === client.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* QR Code & Mobile Scan Section */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs shrink-0">
                  <QRCodeSVG
                    value={portalUrl}
                    size={120}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="space-y-1.5 text-center sm:text-left">
                  <h5 className="text-xs font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                    <QrCode className="w-4 h-4 text-sky-600" />
                    <span>QR code</span>
                  </h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Your client can scan this with a phone camera to open their portal without a password.
                  </p>
                  <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <a
                      href={portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1 rounded-lg transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open portal in new tab</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* 1-Click Send Channels */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-600" /> Send to client
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Bula ${representative},\n\nHere is your private link to see your projects, quotes and invoices:\n${portalUrl}\n\nThanks`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Send on WhatsApp</span>
                  </a>

                  <a
                    href={`mailto:${client.email || ''}?subject=${encodeURIComponent(`Your client portal link - ${client.name}`)}&body=${encodeURIComponent(
                      `Bula ${representative},\n\nYou can open your client portal with this private link:\n\n${portalUrl}\n\nIn your portal you can:\n- See your projects and their progress\n- Review and accept quotes, and download invoices as PDFs\n- Pay by M-PAiSA, MyCash or bank transfer\n- Send us messages or proof of payment\n\nThanks`
                    )}`}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send by email</span>
                  </a>
                </div>
              </div>

              {/* Features Accessible */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-600" /> What your client can see
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Project progress</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Invoices and PDF receipts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Messages</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>M-PAiSA and bank transfer</span>
                  </div>
                </div>
              </div>

              {/* Security & Management Controls */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => onGenerateAccessLink(client, e)}
                  disabled={generatingLinkId === client.id}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold py-1.5 px-3 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generatingLinkId === client.id ? 'animate-spin' : ''}`} />
                  <span>New link (old one stops working)</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => onRevokeAccessLink(client, e)}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold py-1.5 px-3 rounded-lg hover:bg-rose-50 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke access</span>
                </button>
              </div>
            </>
          ) : (
            /* Empty state - Generate link */
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100 shadow-xs">
                <Link className="w-7 h-7" />
              </div>
              <div className="max-w-sm mx-auto space-y-1">
                <h4 className="text-sm font-bold text-slate-900">Create a portal link</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Create a private link for <strong>{client.name}</strong>. They can use it to open their portal at any time without a password.
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => onGenerateAccessLink(client, e)}
                disabled={generatingLinkId === client.id}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center justify-center gap-2 mx-auto transition-all shadow-sm active:scale-98 cursor-pointer"
              >
                {generatingLinkId === client.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating link…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Create portal link</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
