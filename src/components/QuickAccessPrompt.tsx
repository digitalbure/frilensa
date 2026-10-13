import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, FileText, Plus, Receipt, Users, FolderKanban, Globe, 
  Bot, ArrowRight, X, CheckCircle2, Clock, TrendingUp, DollarSign,
  AlertCircle, ChevronRight, Zap, ShieldCheck
} from 'lucide-react';
import { CRMData, CRMDocument } from '../types';

interface QuickAccessPromptProps {
  data: CRMData;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab: (
    tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'catalogue' | 'settings' | 'projects' | 'assistant', 
    docActionId?: string
  ) => void;
}

export default function QuickAccessPrompt({
  data,
  isOpen,
  onClose,
  onNavigateToTab
}: QuickAccessPromptProps) {
  const [autoOpenPreference, setAutoOpenPreference] = useState<boolean>(() => {
    const saved = localStorage.getItem('frilensa_quick_pulse_auto') ?? localStorage.getItem('toulele_quick_pulse_auto');
    return saved !== 'false';
  });

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const userCurrency = data.userProfile.defaultCurrency || 'FJD';
  const userName = data.userProfile.name?.split(' ')[0] || 'there';

  // Calculate recent documents & metrics for active business
  const bizDocs = data.documents.filter(d => !d.businessId || d.businessId === data.activeBusinessId);
  const recentDocs = [...bizDocs].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()).slice(0, 3);
  
  const pendingInvoices = bizDocs.filter(d => d.type === 'invoice' && (d.status === 'sent' || d.status === 'draft'));
  const paidInvoices = bizDocs.filter(d => d.type === 'invoice' && d.status === 'paid');
  const totalCollected = paidInvoices.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const totalOutstanding = pendingInvoices.reduce((acc, curr) => acc + (curr.total || 0), 0);

  const activeProjects = (data.projects || []).filter(p => !p.businessId || p.businessId === data.activeBusinessId);
  const ongoingProjectsCount = activeProjects.filter(p => p.status === 'in_progress' || p.status === 'not_started').length;

  const totalClientsCount = data.clients.length;

  const handleToggleAutoOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    setAutoOpenPreference(newVal);
    localStorage.setItem('frilensa_quick_pulse_auto', newVal ? 'true' : 'false');
  };

  const handleAction = (
    tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'catalogue' | 'settings' | 'projects' | 'assistant',
    docId?: string
  ) => {
    onClose();
    onNavigateToTab(tab, docId);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
          className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header Gradient */}
          <div className="bg-gradient-to-r from-sky-700 via-sky-600 to-teal-600 p-5 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/15 transition-all cursor-pointer"
              title="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1 text-sky-100 text-[11px] font-bold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Welcome back</span>
            </div>

            <h2 className="text-xl font-black tracking-tight text-white">
              Bula vinaka, {userName}
            </h2>
            <p className="text-xs text-sky-100/90 mt-0.5">
              Here's what's been happening at <span className="font-bold text-white">{activeBusiness?.name || 'your workspace'}</span>.
            </p>
          </div>

          {/* Body Content */}
          <div className="p-5 overflow-y-auto space-y-4 text-left">
            
            {/* 1. Quick Financial & Operational Pulse */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-emerald-50/80 border border-emerald-200/70 rounded-2xl p-3 text-emerald-950">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 block">Collected</span>
                <p className="text-sm font-black mt-0.5 font-mono text-emerald-900 truncate">
                  {userCurrency} {totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <span className="text-[9px] text-emerald-600 mt-0.5 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> {paidInvoices.length} paid
                </span>
              </div>

              <div className="bg-amber-50/80 border border-amber-200/70 rounded-2xl p-3 text-amber-950">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700 block">Pending</span>
                <p className="text-sm font-black mt-0.5 font-mono text-amber-900 truncate">
                  {userCurrency} {totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <span className="text-[9px] text-amber-600 mt-0.5 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" /> {pendingInvoices.length} awaiting
                </span>
              </div>

              <div className="bg-sky-50/80 border border-sky-200/70 rounded-2xl p-3 text-sky-950">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-sky-700 block">Projects</span>
                <p className="text-sm font-black mt-0.5 font-mono text-sky-900 truncate">
                  {ongoingProjectsCount} active
                </p>
                <span className="text-[9px] text-sky-600 mt-0.5 flex items-center gap-0.5">
                  <FolderKanban className="w-2.5 h-2.5" /> {totalClientsCount} clients
                </span>
              </div>
            </div>

            {/* 2. Recent Documents Activity */}
            {recentDocs.length > 0 && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-sky-600" /> Recent documents
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAction('billing')}
                    className="text-[10px] text-sky-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    View all ({bizDocs.length}) <ChevronRight className="w-2.5 h-2.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {recentDocs.map((doc) => {
                    const client = data.clients.find(c => c.id === doc.clientId);
                    return (
                      <div
                        key={doc.id}
                        onClick={() => handleAction('billing', doc.id)}
                        className="bg-white p-2 rounded-xl border border-slate-200/70 hover:border-sky-300 hover:bg-sky-50/30 transition-all flex items-center justify-between cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono ${
                            doc.type === 'quote' ? 'bg-amber-100 text-amber-800' :
                            doc.type === 'receipt' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                          }`}>
                            {doc.type}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 truncate text-[11px]">
                              {doc.documentNumber} • {client?.name || 'Client'}
                            </p>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {doc.issueDate}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 text-[11px]">
                            {userCurrency} {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                            doc.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            doc.status === 'sent' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                            doc.status === 'draft' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {doc.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. "What would you like to do next?" Quick Action Grid */}
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> What next?
              </span>

              <div className="grid grid-cols-2 gap-2">
                {/* Action 1: Create Invoice / Quote */}
                <button
                  type="button"
                  onClick={() => handleAction('billing')}
                  className="p-3 bg-white hover:bg-sky-50 border border-slate-200/90 hover:border-sky-300 rounded-2xl transition-all text-left flex items-start gap-2.5 group shadow-2xs cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs font-bold text-slate-800 block group-hover:text-sky-700">
                      New document
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      Tax invoice, quote or receipt
                    </span>
                  </div>
                </button>

                {/* Action 2: Log Expense / AI Scan */}
                <button
                  type="button"
                  onClick={() => handleAction('services')}
                  className="p-3 bg-white hover:bg-emerald-50 border border-slate-200/90 hover:border-emerald-300 rounded-2xl transition-all text-left flex items-start gap-2.5 group shadow-2xs cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs font-bold text-slate-800 block group-hover:text-emerald-700">
                      Log an expense
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      Scan a receipt, track VAT
                    </span>
                  </div>
                </button>

                {/* Action 3: Add Client */}
                <button
                  type="button"
                  onClick={() => handleAction('clients')}
                  className="p-3 bg-white hover:bg-indigo-50 border border-slate-200/90 hover:border-indigo-300 rounded-2xl transition-all text-left flex items-start gap-2.5 group shadow-2xs cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs font-bold text-slate-800 block group-hover:text-indigo-700">
                      Clients
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      Details and portal links
                    </span>
                  </div>
                </button>

                {/* Action 4: Fiji Directory & Bookings */}
                <button
                  type="button"
                  onClick={() => handleAction('directory')}
                  className="p-3 bg-white hover:bg-teal-50 border border-slate-200/90 hover:border-teal-300 rounded-2xl transition-all text-left flex items-start gap-2.5 group shadow-2xs cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs font-bold text-slate-800 block group-hover:text-teal-700">
                      Directory
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      Find businesses, see bookings
                    </span>
                  </div>
                </button>
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <label className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={autoOpenPreference}
                onChange={handleToggleAutoOpen}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
              />
              <span>Show this when I sign in</span>
            </label>

            <button
              type="button"
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl transition-all text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
