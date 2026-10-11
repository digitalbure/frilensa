import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Globe, ArrowRight, CheckCircle2, DollarSign, Building2, 
  ExternalLink, Layers, ArrowUpRight, TrendingUp, ShieldCheck 
} from 'lucide-react';
import { CRMData, Business, CRMDocument, Transaction } from '../types';
import { getCurrencyConfig, getDocumentHomeValues, BusinessFinancialStats } from '../lib/currencies';

interface MultiCurrencyBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CRMData;
  activeBusiness?: Business;
  stats: BusinessFinancialStats;
  onNavigateToTab: (tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant', selectedDocId?: string) => void;
}

export default function MultiCurrencyBreakdownModal({
  isOpen,
  onClose,
  data,
  activeBusiness,
  stats,
  onNavigateToTab
}: MultiCurrencyBreakdownModalProps) {
  if (!isOpen) return null;

  const baseCurrency = activeBusiness?.currency || data.userProfile.defaultCurrency || 'FJD';
  const baseCfg = getCurrencyConfig(baseCurrency);

  // Collect all foreign documents
  const foreignDocs = data.documents.filter(doc => {
    if (activeBusiness && doc.businessId && doc.businessId !== activeBusiness.id) return false;
    const docCurr = (doc.currency || baseCurrency).toUpperCase();
    return docCurr !== baseCurrency.toUpperCase();
  });

  // Collect foreign transactions or TT remittances
  const foreignTransactions = (data.transactions || []).filter(tx => {
    if (activeBusiness && tx.businessId && tx.businessId !== activeBusiness.id) return false;
    const hasForeignCurr = tx.currency && tx.currency.toUpperCase() !== baseCurrency.toUpperCase();
    const hasOrigAmount = tx.originalAmount !== undefined && tx.originalAmount > 0;
    const hasTtDesc = tx.description && /(AUD|USD|NZD|EUR|GBP|TT|remittance|pacific)/i.test(tx.description);
    return hasForeignCurr || hasOrigAmount || hasTtDesc;
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="bg-white rounded-3xl max-w-2xl w-full border border-slate-100 shadow-2xl overflow-hidden my-8"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-900 via-sky-800 to-indigo-900 p-6 text-white relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-white border border-white/10 shadow-inner">
                  <Globe className="w-6 h-6 text-sky-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-lg text-white">Foreign currency</h3>
                    <span className="bg-sky-400/20 text-sky-200 border border-sky-300/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Base: {baseCurrency}
                    </span>
                  </div>
                  <p className="text-xs text-sky-200/80 mt-0.5">
                    Foreign invoices and incoming transfers, converted to your base currency
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Total Reconciled Hero Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] uppercase font-bold text-sky-200/90 tracking-wider block">Total received ({baseCurrency})</span>
                <span className="text-xl font-black text-white font-mono mt-0.5 block">
                  ${stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9.5px] text-emerald-300 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Paid invoices
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] uppercase font-bold text-sky-200/90 tracking-wider block">Foreign payments</span>
                <span className="text-xl font-black text-white font-mono mt-0.5 block truncate">
                  {stats.primaryForeignSummary || 'None yet'}
                </span>
                <span className="text-[9.5px] text-sky-200 mt-1 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {stats.paidInvoicesCount} invoices paid
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] uppercase font-bold text-sky-200/90 tracking-wider block">VAT collected</span>
                <span className="text-xl font-black text-white font-mono mt-0.5 block">
                  ${stats.totalVatCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9.5px] text-emerald-300 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> On paid invoices
                </span>
              </div>
            </div>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Breakdown Cards */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">By currency</h4>
              <div className="space-y-2.5">
                {stats.currencyBreakdown.map(curr => (
                  <div key={curr.code} className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{curr.flag}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-extrabold text-slate-800 text-sm">{curr.code}</h5>
                          <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                            {curr.count} {curr.count === 1 ? 'transaction' : 'transactions'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Rate received: <span className="font-mono font-bold text-slate-700">1 {curr.code} = {curr.effectiveRate.toFixed(4)} {baseCurrency}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-xs font-bold text-slate-400">{curr.symbol}</span>
                        <span className="text-sm font-bold text-slate-800 font-mono">
                          {curr.foreignTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400 mx-1" />
                        <span className="text-xs font-bold text-sky-700">{baseCfg.symbol}</span>
                        <span className="text-base font-extrabold text-sky-900 font-mono">
                          {curr.homeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                        Converted
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reconciled Documents Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Foreign currency documents</h4>
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToTab('billing');
                  }}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                >
                  View in Billing <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {foreignDocs.map(doc => {
                  const client = data.clients.find(c => c.id === doc.clientId);
                  const conv = getDocumentHomeValues(doc, baseCurrency, activeBusiness?.customExchangeRates, data.transactions);

                  return (
                    <div key={doc.id} className="p-3.5 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-800">#{doc.documentNumber}</span>
                          <span className="text-xs font-bold text-slate-700">{client?.name || 'Client'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                            doc.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {doc.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                          <span>Issued: {doc.issueDate}</span>
                          <span>•</span>
                          <span>Currency: {doc.currency}</span>
                          {(doc.paymentExchangeNotes || doc.paymentMethod) && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-sky-700">{doc.paymentExchangeNotes || doc.paymentMethod}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-bold text-xs text-slate-800 block">
                          {doc.currency} ${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="font-mono font-bold text-xs text-emerald-600 block">
                          ≈ {baseCurrency} ${conv.homeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-slate-400 block">
                          @ {conv.effectiveRate.toFixed(4)} {baseCurrency}/{doc.currency}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Inward TT Ledger Entries */}
            {foreignTransactions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bank transactions</h4>
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToTab('services');
                    }}
                    className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                  >
                    Open bookkeeping <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2">
                  {foreignTransactions.map(tx => (
                    <div key={tx.id} className="p-3 bg-sky-50/60 border border-sky-100 rounded-2xl flex items-center justify-between">
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[11px] text-sky-950 truncate">{tx.description}</span>
                          <span className="bg-emerald-100 text-emerald-800 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                            Foreign
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Date: {tx.date} • Bank: {tx.bankName || 'BSP Fiji'} • Category: {tx.category}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-sky-900 font-mono block">
                          +{baseCurrency} ${(tx.netReceived || tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {tx.originalAmount && (
                          <span className="text-[9.5px] font-mono text-slate-500 block">
                            (from {tx.currency || 'AUD'} ${tx.originalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Amounts shown in {baseCurrency}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onNavigateToTab('services');
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                Go to bookkeeping
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
