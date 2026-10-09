import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, X, Check, ArrowRight, Tag, ShieldCheck, HelpCircle, 
  RefreshCw, FileText, Briefcase, Plus, AlertCircle, Search, Layers,
  ChevronRight, Building2, Wrench, Film, Code, Scale, HardHat
} from 'lucide-react';
import { CRMData, ExpenseRecord, Transaction } from '../types';

interface AiExpenseCategorizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onOpenExpenseModalWithData?: (partialExpense: Partial<ExpenseRecord>) => void;
}

export default function AiExpenseCategorizationModal({
  isOpen,
  onClose,
  data,
  onUpdateData,
  onOpenExpenseModalWithData
}: AiExpenseCategorizationModalProps) {
  // Active internal view: 'sandbox' (Test/Predict) | 'batch_audit' (Audit existing ledger) | 'industry_guide' (Rules reference)
  const [activeTab, setActiveTab] = useState<'sandbox' | 'batch_audit' | 'industry_guide'>('sandbox');

  // Sandbox inputs
  const [testDescription, setTestDescription] = useState<string>('Cinema prime lens rental for coastal tourism film shoot');
  const [testVendor, setTestVendor] = useState<string>('Suva Camera & Lighting Hire');
  const [testAmount, setTestAmount] = useState<string>('450.00');
  const [testProjectId, setTestProjectId] = useState<string>('');
  const [testSector, setTestSector] = useState<string>('film_audio_av');
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState<boolean>(false);
  const [suggestionResult, setSuggestionResult] = useState<{
    category: string;
    confidence: number;
    reason: string;
    isVatClaimable: boolean;
    isTaxDeductible: boolean;
    recommendedVatRate?: number;
    suggestedTags?: string[];
    alternativeCategories?: string[];
    isFallback?: boolean;
  } | null>(null);

  // Batch audit states
  const [isAuditingBatch, setIsAuditingBatch] = useState<boolean>(false);
  const [auditResults, setAuditResults] = useState<Array<{
    txId: string;
    originalDesc: string;
    originalCategory: string;
    suggestedCategory: string;
    confidence: number;
    reason: string;
    applied: boolean;
  }>>([]);

  const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;

  // Preset example queries across multi-industry services
  const examplePresets = [
    {
      sector: 'film_audio_av',
      label: '🎬 Film / AV Gear',
      desc: 'Arri Alexa Mini LF camera & anamorphic lens package hire for 3-day commercial shoot',
      vendor: 'Pacific Cinema Gear Suva',
      amount: '1850.00'
    },
    {
      sector: 'web_digital',
      label: '💻 SaaS & Cloud',
      desc: 'AWS Production Kubernetes cluster hosting and monthly database snapshot storage',
      vendor: 'Amazon Web Services',
      amount: '380.00'
    },
    {
      sector: 'legal_medical_pro',
      label: '⚖️ Legal & Tax Filing',
      desc: 'Fiji High Court commercial contract stamp duty and affidavit notarization filing fees',
      vendor: 'High Court of Fiji / FRCS',
      amount: '350.00'
    },
    {
      sector: 'automotive_mechanics',
      label: '🚗 Auto Replacement Parts',
      desc: 'Genuine Toyota Hilux brake pads, engine oil filter, and hydraulic clutch fluid',
      vendor: 'Asco Motors Suva',
      amount: '620.00'
    },
    {
      sector: 'construction_trades',
      label: '🔨 Construction Supplies',
      desc: 'Treated pine structural timber framing, galvanized roofing screws, and bag cement',
      vendor: 'Vinod Patel Hardware',
      amount: '940.00'
    },
    {
      sector: 'creative_agency',
      label: '🎨 Event Catering & Hospitality',
      desc: 'Client hospitality dinner and refreshment catering during branding campaign presentation',
      vendor: 'Grand Pacific Hotel Suva',
      amount: '295.00'
    }
  ];

  const handleRunAiSuggestion = async () => {
    if (!testDescription.trim() && !testVendor.trim()) return;

    setIsLoadingSuggestion(true);
    try {
      const selectedProject = data.projects.find(p => p.id === testProjectId);
      const res = await fetch('/api/bookkeeping/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: testDescription.trim(),
          vendor: testVendor.trim(),
          projectName: selectedProject?.name || '',
          projectType: testSector || (selectedProject as any)?.industrySector || '',
          serviceType: (selectedProject as any)?.serviceCategory || '',
          amount: parseFloat(testAmount) || 0,
          businessType: data.userProfile.businessType || 'studio',
          vatRate: currentVatRate
        })
      });

      if (res.ok) {
        const json = await res.json();
        setSuggestionResult(json);
      }
    } catch (e) {
      console.warn('AI suggestion error:', e);
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  // Run initial test suggestion on mount
  useEffect(() => {
    if (isOpen && !suggestionResult) {
      handleRunAiSuggestion();
    }
  }, [isOpen]);

  const handleApplyPreset = (preset: typeof examplePresets[0]) => {
    setTestSector(preset.sector);
    setTestDescription(preset.desc);
    setTestVendor(preset.vendor);
    setTestAmount(preset.amount);
    // Trigger suggestion directly
    setTimeout(() => {
      handleRunAiSuggestion();
    }, 100);
  };

  const handleLogAsExpense = () => {
    if (!suggestionResult) return;
    if (onOpenExpenseModalWithData) {
      onOpenExpenseModalWithData({
        vendor: testVendor.trim() || 'Business Vendor',
        description: testDescription.trim(),
        amount: Math.abs(parseFloat(testAmount) || 0),
        category: suggestionResult.category,
        isVatClaimable: suggestionResult.isVatClaimable,
        isTaxDeductible: suggestionResult.isTaxDeductible,
        projectId: testProjectId || undefined
      });
      onClose();
    }
  };

  // Batch Audit: scan transactions with 'Other Expense' or pending status and recommend categories
  const handleRunBatchAudit = async () => {
    setIsAuditingBatch(true);
    try {
      const candidateTransactions = (data.transactions || []).filter(
        t => t.category === 'Other Expense' || t.status === 'pending' || !t.category
      ).slice(0, 12);

      if (candidateTransactions.length === 0) {
        setAuditResults([]);
        setIsAuditingBatch(false);
        return;
      }

      const results = await Promise.all(
        candidateTransactions.map(async (t) => {
          try {
            const res = await fetch('/api/bookkeeping/suggest-category', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                description: t.description,
                amount: Math.abs(t.amount),
                businessType: data.userProfile.businessType || 'studio',
                vatRate: currentVatRate
              })
            });
            if (res.ok) {
              const resJson = await res.json();
              return {
                txId: t.id,
                originalDesc: t.description,
                originalCategory: t.category || 'Other Expense',
                suggestedCategory: resJson.category || 'Other Expense',
                confidence: resJson.confidence || 85,
                reason: resJson.reason || 'Classified by AI heuristic.',
                applied: false
              };
            }
          } catch {
            // fallback
          }
          return {
            txId: t.id,
            originalDesc: t.description,
            originalCategory: t.category || 'Other Expense',
            suggestedCategory: 'Other Expense',
            confidence: 70,
            reason: 'Standard classification.',
            applied: false
          };
        })
      );

      setAuditResults(results);
    } catch (e) {
      console.warn('Batch audit error:', e);
    } finally {
      setIsAuditingBatch(false);
    }
  };

  const handleApplyBatchItem = (txId: string, suggestedCategory: string) => {
    const updatedTx = (data.transactions || []).map(t => {
      if (t.id === txId) {
        return {
          ...t,
          category: suggestedCategory,
          status: 'reconciled' as const,
          confidence: 95
        };
      }
      return t;
    });

    onUpdateData({
      ...data,
      transactions: updatedTx
    });

    setAuditResults(prev => prev.map(r => r.txId === txId ? { ...r, applied: true } : r));
  };

  const handleApplyAllBatchItems = () => {
    const map = new Map<string, string>(auditResults.map(r => [r.txId, r.suggestedCategory]));
    const updatedTx: Transaction[] = (data.transactions || []).map(t => {
      if (map.has(t.id)) {
        return {
          ...t,
          category: map.get(t.id) || t.category,
          status: 'reconciled' as const,
          confidence: 95
        };
      }
      return t;
    });

    onUpdateData({
      ...data,
      transactions: updatedTx
    });

    setAuditResults(prev => prev.map(r => ({ ...r, applied: true })));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  AI Expense Categorization Studio
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  Gemini 3.7 Flash
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-industry expense classification, FRCS VAT alignment & tax reasonings
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1.5">
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'sandbox'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Interactive Categorizer Sandbox</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('batch_audit');
              if (auditResults.length === 0) handleRunBatchAudit();
            }}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'batch_audit'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-500" />
            <span>Batch Ledger Audit</span>
          </button>

          <button
            onClick={() => setActiveTab('industry_guide')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'industry_guide'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
            <span>Cross-Industry Guidelines</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'sandbox' && (
            <div className="space-y-4">
              {/* Quick Presets Carousel */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
                  Try Cross-Industry Preset Scenarios:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {examplePresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-amber-400 bg-white hover:bg-amber-50/30 transition-all text-xs group"
                    >
                      <span className="font-bold text-slate-800 group-hover:text-amber-700 block truncate">
                        {preset.label}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                        {preset.vendor}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Input Grid */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 block">
                      Industry Sector / Project Domain
                    </label>
                    <select
                      value={testSector}
                      onChange={(e) => setTestSector(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
                    >
                      <option value="film_audio_av">🎬 Film, Video, Audio & AV Production</option>
                      <option value="web_digital">💻 Web, Software, SaaS & Digital</option>
                      <option value="legal_medical_pro">⚖️ Legal, Medical & Professional Services</option>
                      <option value="automotive_mechanics">🚗 Automotive, Mechanics & Fleet</option>
                      <option value="construction_trades">🔨 Construction, Trades & Engineering</option>
                      <option value="creative_agency">🎨 Creative Studio, Events & Agency</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 block">
                      Vendor / Payee Name
                    </label>
                    <input
                      type="text"
                      value={testVendor}
                      onChange={(e) => setTestVendor(e.target.value)}
                      placeholder="e.g. Suva Camera Hire, TotalEnergies, Courts"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-500 block">
                    Service Description / Expense Purpose
                  </label>
                  <textarea
                    rows={2}
                    value={testDescription}
                    onChange={(e) => setTestDescription(e.target.value)}
                    placeholder="Enter detailed description of the expense or scope item..."
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-slate-900 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 block">
                      Linked Project (Optional)
                    </label>
                    <select
                      value={testProjectId}
                      onChange={(e) => setTestProjectId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
                    >
                      <option value="">No linked project (General Business)</option>
                      {data.projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 block">
                      Expense Amount (FJD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={testAmount}
                      onChange={(e) => setTestAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleRunAiSuggestion}
                    disabled={isLoadingSuggestion || (!testDescription.trim() && !testVendor.trim())}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isLoadingSuggestion ? 'animate-spin' : ''}`} />
                    <span>{isLoadingSuggestion ? 'Analyzing Service Scope...' : 'Run AI Categorization'}</span>
                  </button>
                </div>
              </div>

              {/* Suggestion Output Card */}
              {suggestionResult && (
                <div className="p-4 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-white border border-amber-200 rounded-2xl space-y-3.5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                          AI Recommended Category:
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-white font-extrabold text-xs shadow-xs">
                          {suggestionResult.category}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {suggestionResult.confidence}% Confidence
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium mt-2 leading-relaxed">
                        {suggestionResult.reason}
                      </p>
                    </div>

                    <button
                      onClick={handleLogAsExpense}
                      className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Log As Expense
                    </button>
                  </div>

                  {/* Tax & VAT Rules Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-200/60 text-xs">
                    <div className="p-2.5 bg-white/90 rounded-xl border border-slate-200">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">Fiji VAT Treatment</span>
                      <span className="font-bold text-slate-800 mt-0.5 block">
                        {suggestionResult.isVatClaimable 
                          ? `Claimable Input VAT (${suggestionResult.recommendedVatRate ?? currentVatRate}%)`
                          : '0% Non-VAT (Overseas/Exempt)'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-white/90 rounded-xl border border-slate-200">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">FRCS Income Tax</span>
                      <span className="font-bold text-emerald-700 mt-0.5 block flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 100% Tax Deductible
                      </span>
                    </div>

                    <div className="p-2.5 bg-white/90 rounded-xl border border-slate-200">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">Alternative Categories</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {suggestionResult.alternativeCategories && suggestionResult.alternativeCategories.length > 0 ? (
                          suggestionResult.alternativeCategories.map(alt => (
                            <span key={alt} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {alt}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400">None needed</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'batch_audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Unreconciled & Misc Expense Ledger Audit
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Automatically scans unclassified transactions and suggests precise bookkeeping categories.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunBatchAudit}
                    disabled={isAuditingBatch}
                    className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAuditingBatch ? 'animate-spin' : ''}`} />
                    <span>Re-scan Ledger</span>
                  </button>

                  {auditResults.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplyAllBatchItems}
                      className="text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept All AI Categories</span>
                    </button>
                  )}
                </div>
              </div>

              {isAuditingBatch ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <Sparkles className="w-6 h-6 text-sky-500 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-600">
                    Running AI heuristic categorization across your bank statement lines...
                  </p>
                </div>
              ) : auditResults.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <Check className="w-8 h-8 text-emerald-500 mx-auto" />
                  <h5 className="text-xs font-bold text-slate-800">Ledger is Clean & Categorized!</h5>
                  <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
                    No pending unclassified or 'Other Expense' ledger entries detected. All expenses are properly categorized.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {auditResults.map(item => (
                    <div
                      key={item.txId}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        item.applied 
                          ? 'bg-emerald-50/50 border-emerald-200' 
                          : 'bg-white hover:bg-slate-50/80 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {item.originalDesc}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            Current: {item.originalCategory}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {item.reason}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[9px] font-bold uppercase text-slate-400 block">AI Suggestion</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs font-black text-amber-700">
                              {item.suggestedCategory}
                            </span>
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800">
                              {item.confidence}%
                            </span>
                          </div>
                        </div>

                        {item.applied ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-xl">
                            <Check className="w-3 h-3" /> Categorized
                          </span>
                        ) : (
                          <button
                            onClick={() => handleApplyBatchItem(item.txId, item.suggestedCategory)}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] px-2.5 py-1 rounded-xl transition-colors shadow-xs"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'industry_guide' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <Film className="w-4 h-4 text-amber-600" />
                    <span>Film, Video & AV Production</span>
                  </div>
                  <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4">
                    <li><strong>Hardware & Equipment:</strong> Camera rigs, lenses, lighting, audio mics, drones, tripod systems.</li>
                    <li><strong>Subcontractors:</strong> Boom mic operators, colorists, second shooters, voice actors, gaffers.</li>
                    <li><strong>Meals & Hospitality:</strong> Crew catering on film sets (Fiji 12.5% VAT claimable with tax invoice).</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <Code className="w-4 h-4 text-sky-600" />
                    <span>Web, Digital & SaaS Services</span>
                  </div>
                  <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4">
                    <li><strong>Software SaaS:</strong> AWS, GitHub, Figma, Vercel, OpenAI API tokens (0% local VAT for overseas).</li>
                    <li><strong>Internet & Utilities:</strong> Telecom Fiji fibre, Vodafone/Digicel mobile data connections.</li>
                    <li><strong>Marketing & Ads:</strong> Meta ads, Google ads, domain registrations.</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <Scale className="w-4 h-4 text-purple-600" />
                    <span>Legal, Medical & Consulting</span>
                  </div>
                  <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4">
                    <li><strong>Tax & Licensing:</strong> High Court filing fees, business license renewal, FRCS TIN certification.</li>
                    <li><strong>Subcontractors:</strong> Senior counsel retainers, specialist medical diagnostics.</li>
                    <li><strong>Office Supplies:</strong> Legal stationery, certified binding, stamp paper.</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <Wrench className="w-4 h-4 text-rose-600" />
                    <span>Automotive, Mechanics & Fleet</span>
                  </div>
                  <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4">
                    <li><strong>Hardware & Equipment:</strong> Brake pads, filters, engine gaskets, OBD diagnostic scanners.</li>
                    <li><strong>Travel & Transport:</strong> Fuel, vehicle recovery towing, mobile workshop transport.</li>
                    <li><strong>Subcontractors:</strong> Specialized auto electricians, panel beaters.</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <HardHat className="w-4 h-4 text-emerald-600" />
                    <span>Construction, Trades & Carpentry</span>
                  </div>
                  <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4">
                    <li><strong>Hardware & Equipment:</strong> Timber framing, cement, scaffolding hire, power tools.</li>
                    <li><strong>Subcontractors:</strong> Registered master plumbers, certified electricians, tilers.</li>
                    <li><strong>Travel & Transport:</strong> Site haulage, delivery logistics.</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Fiji FRCS Tax & VAT Treatment</span>
                  </div>
                  <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4">
                    <li><strong>VAT Input Tax:</strong> 12.5% standard rate claimable on local VAT tax invoices.</li>
                    <li><strong>Digital Subscriptions:</strong> Foreign software providers are exempt from Fiji VAT input credit.</li>
                    <li><strong>Deductibility:</strong> All ordinary business operating expenses reduce assessable income.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            Frilensa AI Financial Architecture &copy; Fiji
          </span>

          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
