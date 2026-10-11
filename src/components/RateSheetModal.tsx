import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, X, Copy, Check, Printer } from 'lucide-react';
import { CRMData } from '../types';
import { getCurrencyConfig } from '../lib/currencies';

interface RateSheetModalProps {
  data: CRMData;
  onClose: () => void;
}

export default function RateSheetModal({ data, onClose }: RateSheetModalProps) {
  const [copied, setCopied] = useState(false);
  const [includeScope, setIncludeScope] = useState(true);
  const [includeTiers, setIncludeTiers] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const currencyConfig = getCurrencyConfig(data.userProfile.defaultCurrency || 'FJD');

  const vatRate = data.userProfile.defaultVatRate ?? 12.5;

  // Active business only, and only items meant for clients
  const rateCardServices = (data.services || []).filter(s =>
    (!s.businessId || s.businessId === data.activeBusinessId) &&
    s.isActive !== false &&
    s.showOnRateCard !== false
  );

  const categories = Array.from(new Set(rateCardServices.map(s => s.category || 'General'))).filter(Boolean);

  const displayServices = rateCardServices.filter(s => {
    if (selectedCategory === 'all') return true;
    return (s.category || 'General') === selectedCategory;
  });

  const contactEmail = activeBusiness?.email || data.userProfile.email;
  const contactPhone = activeBusiness?.phone || data.userProfile.phone;
  const tin = activeBusiness?.tin || data.userProfile.tin;

  const handleCopyText = () => {
    let text = `${activeBusiness?.name || 'Company'} — Rates\n`;
    text += `Currency: ${currencyConfig.code} · ${new Date().toLocaleDateString()}\n\n`;

    displayServices.forEach((srv, idx) => {
      text += `${idx + 1}. ${srv.name}\n`;
      text += `   Rate: ${currencyConfig.symbol} ${srv.rate.toFixed(2)} / ${srv.unit}\n`;
      if (includeTiers) {
        if (srv.rushRate) text += `   - Rush: ${currencyConfig.symbol} ${srv.rushRate.toFixed(2)}\n`;
        if (srv.weekendRate) text += `   - Weekend / after hours: ${currencyConfig.symbol} ${srv.weekendRate.toFixed(2)}\n`;
        if (srv.retainerRate) text += `   - Retainer: ${currencyConfig.symbol} ${srv.retainerRate.toFixed(2)}\n`;
      }
      if (includeScope && srv.description) {
        text += `   ${srv.description}\n`;
      }
      text += `\n`;
    });

    if (displayServices.some(s => s.isTaxable !== false)) {
      text += `Rates exclude VAT (${vatRate}%), which is added to taxable items.\n`;
    }
    const contact = [contactEmail, contactPhone].filter(Boolean).join(' | ');
    if (contact) text += `Contact: ${contact}\n`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {
      window.alert("Couldn't copy to the clipboard. Select the text and copy it instead.");
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center border border-white/15 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Rate sheet</h3>
              <p className="text-xs text-slate-300">
                Copy or print your rates to send to clients. Inactive items and items hidden from the rate card are left out.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 px-5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeScope}
                onChange={(e) => setIncludeScope(e.target.checked)}
                className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <span>Include descriptions</span>
            </label>

            <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTiers}
                onChange={(e) => setIncludeTiers(e.target.checked)}
                className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <span>Include rush, weekend and retainer rates</span>
            </label>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 cursor-pointer"
            >
              <option value="all">All categories ({rateCardServices.length})</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              disabled={displayServices.length === 0}
              className="disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-700 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied' : 'Copy text'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={displayServices.length === 0}
              className="disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Printable Rate Sheet Preview Body */}
        <div className="p-4 sm:p-8 space-y-6 overflow-y-auto flex-1 bg-white">
          {/* Rate Sheet Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3 pb-6 border-b border-slate-200">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight">
                  {activeBusiness?.name || 'Rates'}
                </h2>
              </div>
              {activeBusiness?.brandSlogan && (
                <p className="text-xs text-slate-500 mt-1 max-w-md">{activeBusiness.brandSlogan}</p>
              )}
              <p className="text-[11px] text-slate-400 mt-1">
                {[tin ? `TIN ${tin}` : null, contactEmail, contactPhone].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="sm:text-right shrink-0">
              <span className="text-[11px] font-semibold text-slate-400 block">Currency</span>
              <span className="text-lg font-bold text-slate-900 font-mono">
                {currencyConfig.code} ({currencyConfig.symbol})
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Matrix Items */}
          <div className="space-y-4">
            {displayServices.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">
                No items to show. Add items to your catalogue, or turn on "Show on rate card" for the ones clients should see.
              </p>
            )}
            {displayServices.map((srv, idx) => (
              <div 
                key={srv.id}
                className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2 hover:border-slate-200 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-400">{idx + 1}.</span>
                      <h4 className="text-sm font-bold text-slate-900">{srv.name}</h4>
                      {srv.sku && (
                        <span className="text-[9px] font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-500">
                          {srv.sku}
                        </span>
                      )}
                    </div>
                    {srv.category && (
                      <span className="text-[10px] font-medium text-sky-700 bg-sky-50 px-2 py-0.2 rounded-md border border-sky-100 inline-block">
                        {srv.category}
                      </span>
                    )}
                  </div>

                  <div className="sm:text-right sm:self-center shrink-0">
                    <span className="text-base font-extrabold text-slate-900 font-mono">
                      {currencyConfig.symbol} {srv.rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-slate-500 font-medium"> / {srv.unit}</span>
                  </div>
                </div>

                {includeScope && srv.description && (
                  <p className="text-xs text-slate-600 leading-relaxed pt-1">
                    {srv.description}
                  </p>
                )}

                {includeTiers && (srv.rushRate || srv.weekendRate || srv.retainerRate) && (
                  <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    {srv.rushRate && (
                      <div className="p-1.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 flex justify-between items-center">
                        <span className="font-semibold">Rush:</span>
                        <span className="font-bold font-mono">{currencyConfig.symbol} {srv.rushRate.toFixed(2)}</span>
                      </div>
                    )}
                    {srv.weekendRate && (
                      <div className="p-1.5 rounded-lg bg-indigo-50/80 border border-indigo-200 text-indigo-900 flex justify-between items-center">
                        <span className="font-semibold">Weekend / after hours:</span>
                        <span className="font-bold font-mono">{currencyConfig.symbol} {srv.weekendRate.toFixed(2)}</span>
                      </div>
                    )}
                    {srv.retainerRate && (
                      <div className="p-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex justify-between items-center">
                        <span className="font-semibold">Retainer:</span>
                        <span className="font-bold font-mono">{currencyConfig.symbol} {srv.retainerRate.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {displayServices.some(s => s.isTaxable !== false) && (
            <div className="pt-4 border-t border-slate-200 text-[11px] text-slate-500">
              <p>Rates exclude VAT ({vatRate}%), which is added to taxable items.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
