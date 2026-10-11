import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, X, Download, Copy, Check, Printer, Building2, 
  Sparkles, Tag, ShieldCheck, DollarSign
} from 'lucide-react';
import { CRMData, ProductService } from '../types';
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

  const categories = Array.from(new Set(data.services.map(s => s.category || 'General Services'))).filter(Boolean);

  const displayServices = data.services.filter(s => {
    if (selectedCategory === 'all') return true;
    return (s.category || 'General Services') === selectedCategory;
  });

  const handleCopyText = () => {
    let text = `${activeBusiness?.name || 'Company'} — Rates\n`;
    text += `Currency: ${currencyConfig.code} (${currencyConfig.symbol}) • Date: ${new Date().toLocaleDateString()}\n`;
    text += `===========================================================\n\n`;

    displayServices.forEach((srv, idx) => {
      text += `${idx + 1}. ${srv.name}\n`;
      text += `   Rate: ${currencyConfig.symbol} ${srv.rate.toFixed(2)} / ${srv.unit}\n`;
      if (includeTiers) {
        if (srv.rushRate) text += `   - Rush: ${currencyConfig.symbol} ${srv.rushRate.toFixed(2)}\n`;
        if (srv.weekendRate) text += `   - Weekend / after hours: ${currencyConfig.symbol} ${srv.weekendRate.toFixed(2)}\n`;
        if (srv.retainerRate) text += `   - Retainer: ${currencyConfig.symbol} ${srv.retainerRate.toFixed(2)}\n`;
      }
      if (includeScope && srv.description) {
        text += `   Scope: ${srv.description}\n`;
      }
      text += `\n`;
    });

    text += `\n* Rates are subject to Fiji VAT (${data.userProfile.defaultVatRate || 12.5}%) unless exempt.\n`;
    text += `Contact: ${activeBusiness?.email || data.userProfile.email} | ${activeBusiness?.phone || data.userProfile.phone || ''}\n`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
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
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center border border-amber-400/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Rate sheet</span>
                <span className="bg-amber-400/20 text-amber-300 text-[9px] font-extrabold px-2 py-0.2 rounded-full uppercase border border-amber-400/30">
                  Exportable
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Copy or print your rates to send to clients.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
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
              <option value="all">All categories ({data.services.length})</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-700 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied' : 'Copy text'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Printable Rate Sheet Preview Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 bg-white">
          {/* Rate Sheet Header */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-sky-500" />
                <h2 className="text-xl font-bold text-slate-900 font-display tracking-tight">
                  {activeBusiness?.name || 'Rates'}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                {activeBusiness?.brandSlogan || 'Rates and services'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                TIN: {activeBusiness?.tin || data.userProfile.tin || '—'} • {activeBusiness?.email || data.userProfile.email}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Currency</span>
              <span className="text-lg font-bold text-slate-900 font-mono">
                {currencyConfig.code} ({currencyConfig.symbol})
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                Effective {new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Matrix Items */}
          <div className="space-y-4">
            {displayServices.map((srv, idx) => (
              <div 
                key={srv.id}
                className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2 hover:border-slate-200 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
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

                  <div className="text-right sm:self-center">
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

          {/* Rate Sheet Legal & Tax Disclosures */}
          <div className="pt-4 border-t border-slate-200 text-[10.5px] text-slate-500 space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Fiji VAT (12.5%) applies to standard-rated supplies.</span>
            </p>
            <p>
              Quotes from this sheet are valid for 30 days. Retainer agreements are available on request.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
