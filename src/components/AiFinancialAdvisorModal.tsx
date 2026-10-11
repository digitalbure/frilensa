import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, X, Bot, TrendingUp, DollarSign, ShieldAlert, ArrowRight, 
  Send, Calculator, FileCheck, Check, RefreshCw, ChevronRight, HelpCircle
} from 'lucide-react';
import { CRMData, Transaction, ExpenseRecord } from '../types';
import MarkdownText from './MarkdownText';

interface AiFinancialAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CRMData;
  pnlStats: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    outputVat: number;
    inputVat: number;
    netVatPayable: number;
    topExpenseCategory: string;
    periodLabel: string;
  };
  onOpenFullAssistant?: (initialPrompt?: string) => void;
}

export default function AiFinancialAdvisorModal({
  isOpen,
  onClose,
  data,
  pnlStats,
  onOpenFullAssistant
}: AiFinancialAdvisorModalProps) {
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reply, setReply] = useState<{ text: string; isFallback?: boolean; failed?: boolean } | null>(null);

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;

  const quickPrompts = [
    {
      title: 'Review profit and margin',
      prompt: `Analyze our current financial performance for ${activeBusiness?.name || 'our business'}. Total Revenue is FJD $${pnlStats.totalRevenue.toFixed(2)}, Operating Expenses are FJD $${pnlStats.totalExpenses.toFixed(2)}, Net Profit is FJD $${pnlStats.netProfit.toFixed(2)} (${pnlStats.profitMargin.toFixed(1)}% margin). Give 3 specific ways to improve profit.`
    },
    {
      title: 'VAT position',
      prompt: `Review our Fiji VAT position for ${pnlStats.periodLabel}. Output VAT collected: FJD $${pnlStats.outputVat.toFixed(2)}. Claimable Input VAT on expenses: FJD $${pnlStats.inputVat.toFixed(2)}. Net VAT Payable to FRCS: FJD $${pnlStats.netVatPayable.toFixed(2)}. What should we know about filing, and how do we check our input credits?`
    },
    {
      title: 'Cut costs',
      prompt: `Our highest business spending category is currently "${pnlStats.topExpenseCategory}". How can a Fiji freelancer or agency reduce costs in this area, and which of these costs are usually tax-deductible?`
    },
    {
      title: 'Tax deductions',
      prompt: `Which business expenses can I deduct under the Fiji Income Tax Act for a home office, internet, software subscriptions and vehicle use?`
    }
  ];

  const handleAskQuestion = async (customPrompt?: string) => {
    const textToAsk = customPrompt || query;
    if (!textToAsk.trim()) return;

    setIsAnalyzing(true);
    setReply(null);

    const figures = [
      `Period: ${pnlStats.periodLabel}`,
      `Revenue: FJD ${pnlStats.totalRevenue.toFixed(2)}`,
      `Expenses: FJD ${pnlStats.totalExpenses.toFixed(2)}`,
      `Net profit: FJD ${pnlStats.netProfit.toFixed(2)} (${pnlStats.profitMargin.toFixed(1)}% margin)`,
      `Output VAT: FJD ${pnlStats.outputVat.toFixed(2)}, input VAT: FJD ${pnlStats.inputVat.toFixed(2)}, net VAT: FJD ${pnlStats.netVatPayable.toFixed(2)}`,
      `Largest expense category: ${pnlStats.topExpenseCategory}`
    ].join('\n');

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${textToAsk}\n\nMy figures from Frilensa:\n${figures}\n\nKeep the answer short and practical.`,
          history: [],
          memories: [],
          skipMemory: true,
          attachments: [],
          businessContext: {
            name: activeBusiness?.name,
            type: activeBusiness?.type,
            tin: activeBusiness?.tin,
            address: activeBusiness?.address,
            defaultVatRate: currentVatRate
          }
        })
      });
      const body = await res.json().catch(() => ({}));
      if (body?.unavailable) {
        setReply({ text: "The assistant isn't set up on this server yet.", failed: true });
        return;
      }
      if (!res.ok || typeof body.reply !== 'string') throw new Error(body?.error || 'No reply');
      setReply({ text: body.reply, isFallback: Boolean(body.isFallback) });
    } catch {
      setReply({ text: "The AI advisor didn't respond. Check your connection and try again.", failed: true });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-lg rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto text-slate-800"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-4 sm:p-5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center font-bold shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                  AI financial advisor
                </h3>
                <span className="bg-indigo-500/30 text-indigo-300 text-[8px] font-bold px-1.5 py-0.5 rounded border border-indigo-400/30">
                  P&L
                </span>
              </div>
              <p className="text-[10px] text-slate-300">
                Using figures from {activeBusiness?.name || 'your business'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real-time Financial Pulse Mini-Bar */}
        <div className="bg-slate-900 px-4 py-2.5 text-white text-[10px] grid grid-cols-3 gap-2 border-t border-b border-slate-800">
          <div>
            <span className="text-slate-400 block">Revenue</span>
            <strong className="font-mono text-emerald-400 text-xs">FJD ${pnlStats.totalRevenue.toFixed(2)}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Expenses</span>
            <strong className="font-mono text-rose-400 text-xs">FJD ${pnlStats.totalExpenses.toFixed(2)}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Net margin</span>
            <strong className="font-mono text-indigo-300 text-xs">{pnlStats.profitMargin.toFixed(1)}%</strong>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[60vh] overflow-y-auto text-left">
          
          {/* Quick 1-Tap Financial Questions */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">
              Quick questions
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAskQuestion(item.prompt)}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-left transition-all text-xs font-bold text-slate-800 flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate pr-2">{item.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* AI Response Window */}
          {isAnalyzing ? (
            <div className="p-6 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin" />
              <p className="text-xs font-bold text-indigo-900 animate-pulse">
                Working out your figures…
              </p>
            </div>
          ) : reply ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-fade-in">
              {reply.isFallback && (
                <p className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  The AI service isn't set up on the server, so this is a general answer.
                </p>
              )}
              <div className={reply.failed ? 'text-xs text-rose-700' : ''}>
                <MarkdownText text={reply.text} />
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenFullAssistant) {
                      onClose();
                      onOpenFullAssistant(query || 'Give me full financial advice on my business P&L');
                    }
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>Continue in AI advisor</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : null}

          {/* Custom Question Bar */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[9px] font-black uppercase text-slate-500 block">
              Ask any financial or tax question
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Can I claim VAT on fuel for client visits in Nadi?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAskQuestion();
                }}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
              />
              <button
                type="button"
                onClick={() => handleAskQuestion()}
                disabled={!query.trim() || isAnalyzing}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            General guidance, not tax advice
          </span>
          <button
            type="button"
            onClick={() => {
              if (onOpenFullAssistant) {
                onClose();
                onOpenFullAssistant();
              }
            }}
            className="text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
          >
            <span>Open AI advisor</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
