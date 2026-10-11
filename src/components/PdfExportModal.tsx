import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Download, Printer, Share2, Check, X, ShieldCheck, 
  Settings2, Eye, RefreshCw, Palette, ExternalLink, Sparkles, Building2, Mail
} from 'lucide-react';
import { CRMDocument, Business, Client, UserProfile } from '../types';
import { downloadDocumentPdf, getDocumentPdfDataUri, PdfExportOptions } from '../lib/pdfGenerator';
import { getCurrencyConfig } from '../lib/currencies';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CRMDocument | null;
  business: Business;
  client?: Client | null;
  userProfile: UserProfile;
  onOpenEmailModal?: () => void;
}

const COLOR_PRESETS = [
  { label: 'Business colour', value: '' },
  { label: 'Pacific Sky', value: '#0284c7' },
  { label: 'Deep Navy', value: '#1e293b' },
  { label: 'Tropical Teal', value: '#0d9488' },
  { label: 'Emerald Mint', value: '#059669' },
  { label: 'Sunset Coral', value: '#e11d48' },
  { label: 'Royal Violet', value: '#7c3aed' },
];

export default function PdfExportModal({
  isOpen,
  onClose,
  document,
  business,
  client,
  userProfile,
  onOpenEmailModal
}: PdfExportModalProps) {
  if (!isOpen || !document) return null;

  const [includeBankDetails, setIncludeBankDetails] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeFrcsBadge, setIncludeFrcsBadge] = useState(true);
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [selectedColor, setSelectedColor] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const options: PdfExportOptions = useMemo(() => ({
    includeBankDetails,
    includeNotes,
    includeFrcsBadge,
    includeWatermark,
    colorTheme: selectedColor || business.colorTheme || '#0284c7',
  }), [includeBankDetails, includeNotes, includeFrcsBadge, includeWatermark, selectedColor, business.colorTheme]);

  // Generate live data URI preview for iframe
  const pdfDataUri = useMemo(() => {
    try {
      return getDocumentPdfDataUri(document, business, client, userProfile, options);
    } catch (e) {
      console.error('Error generating PDF preview URI', e);
      return '';
    }
  }, [document, business, client, userProfile, options]);

  const docCurrency = document.currency || userProfile.defaultCurrency || 'FJD';
  const currencyCfg = getCurrencyConfig(docCurrency);

  const handleDownload = () => {
    setIsDownloading(true);
    try {
      downloadDocumentPdf(document, business, client, userProfile, options);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to download PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenInNewTab = () => {
    if (pdfDataUri) {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(
          `<iframe src="${pdfDataUri}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
      }
    }
  };

  const docTypeLabel = document.type === 'quote' ? 'Quotation' :
                       document.type === 'receipt' ? 'Receipt' :
                       document.type === 'credit_note' ? 'Credit Note' : 'Tax Invoice';

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
        className="bg-slate-900 text-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col my-auto max-h-[94vh]"
      >
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-white">
                  {docTypeLabel} #{document.documentNumber}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {client?.name || 'Client'} • {currencyCfg.symbol} {document.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} {docCurrency}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                showCustomizer ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="PDF options"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Options</span>
            </button>

            <button
              onClick={handleOpenInNewTab}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer ml-1"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Customization Drawer (Collapsible) */}
        <AnimatePresence>
          {showCustomizer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-950 border-b border-slate-800 p-4 shrink-0 overflow-hidden text-xs text-slate-300 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* Bank details toggle */}
                <label className="flex items-center gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={includeBankDetails}
                    onChange={(e) => setIncludeBankDetails(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
                  />
                  <span>Bank details</span>
                </label>

                {/* Notes toggle */}
                <label className="flex items-center gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
                  />
                  <span>Terms and notes</span>
                </label>

                {/* FRCS Badge toggle */}
                <label className="flex items-center gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={includeFrcsBadge}
                    onChange={(e) => setIncludeFrcsBadge(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
                  />
                  <span>Tax reference footer</span>
                </label>

                {/* Watermark toggle */}
                <label className="flex items-center gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={includeWatermark}
                    onChange={(e) => setIncludeWatermark(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
                  />
                  <span>Status watermark</span>
                </label>
              </div>

              {/* Color Presets */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  <Palette className="w-3 h-3 text-sky-400" /> Header colour:
                </span>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSelectedColor(preset.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedColor === preset.value
                        ? 'bg-sky-500 text-white shadow-xs'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {preset.value && (
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preset.value }} />
                    )}
                    {preset.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live PDF Viewer Container */}
        <div className="flex-1 bg-slate-950 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center min-h-[380px] sm:min-h-[460px]">
          {pdfDataUri ? (
            <iframe
              src={pdfDataUri}
              title={`PDF Preview #${document.documentNumber}`}
              className="w-full h-full rounded-2xl bg-white shadow-2xl border border-slate-800"
              style={{ minHeight: '440px' }}
            />
          ) : (
            <div className="text-center p-8 space-y-2">
              <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Preparing PDF…</p>
            </div>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Shows your TIN and line items</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Close
            </button>

            <button
              onClick={() => window.print()}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              title="Print"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden md:inline">Print</span>
            </button>

            {onOpenEmailModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenEmailModal();
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-600/20"
                title="Email to client"
              >
                <Mail className="w-4 h-4" />
                <span>Email client</span>
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
                downloadSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white shadow-sky-600/30'
              }`}
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Downloaded</span>
                </>
              ) : isDownloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Preparing PDF…</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
