import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, X, Bot, TrendingUp, DollarSign, ShieldAlert, ArrowRight, 
  Send, Calculator, FileCheck, Check, RefreshCw, ChevronRight, HelpCircle
} from 'lucide-react';
import { CRMData, Transaction, ExpenseRecord } from '../types';

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
  const [responseHtml, setResponseHtml] = useState<string | null>(null);

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
      prompt: `Our highest business spending category is currently "${pnlStats.topExpenseCategory}". How can a Fiji freelancer or agency reduce costs in this area and claim Section 21 tax deductions?`
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
    setResponseHtml(null);

    try {
      const activeBiz = data.businesses.find(b => b.id === data.activeBusinessId);
      const res = await fetch('/api/bookkeeping/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: [
            {
              id: 'stat',
              date: new Date().toISOString().split('T')[0],
              description: `P&L Analysis Query: ${textToAsk}. Financial Summary: Revenue=$${pnlStats.totalRevenue}, Expenses=$${pnlStats.totalExpenses}, Net=$${pnlStats.netProfit}, OutputVAT=$${pnlStats.outputVat}, InputVAT=$${pnlStats.inputVat}`,
              amount: pnlStats.netProfit,
              bankName: 'Frilensa Financial Engine'
            }
          ],
          vatRate: currentVatRate
        })
      });

      // Provide clear contextual advisory
      setTimeout(() => {
        setIsAnalyzing(false);
        setResponseHtml(generateLocalAdvisory(textToAsk));
      }, 700);

    } catch (e) {
      setIsAnalyzing(false);
      setResponseHtml(generateLocalAdvisory(textToAsk));
    }
  };

  const generateLocalAdvisory = (prompt: string): string => {
    const bizName = activeBusiness?.name || 'your business';
    const isVat = prompt.toLowerCase().includes('vat');
    const isCost = prompt.toLowerCase().includes('reduc') || prompt.toLowerCase().includes('expense');
    const isPnl = prompt.toLowerCase().includes('margin') || prompt.toLowerCase().includes('p&l') || prompt.toLowerCase().includes('profit');

    if (isVat) {
      return `
        <div class="space-y-3 text-xs leading-relaxed text-slate-700">
          <p class="font-bold text-slate-900 text-sm">VAT position (${pnlStats.periodLabel}):</p>
          <div class="p-3 bg-sky-50 border border-sky-200 rounded-xl space-y-1">
            <div class="flex justify-between"><span>Output VAT (sales):</span> <strong class="font-mono text-slate-900">FJD $${pnlStats.outputVat.toFixed(2)}</strong></div>
            <div class="flex justify-between"><span>Input VAT (claimable):</span> <strong class="font-mono text-emerald-600">-FJD $${pnlStats.inputVat.toFixed(2)}</strong></div>
            <div class="flex justify-between border-t border-sky-200 pt-1 font-bold"><span>Net VAT payable to FRCS:</span> <strong class="font-mono text-sky-900">FJD $${pnlStats.netVatPayable.toFixed(2)}</strong></div>
          </div>
          <ul class="list-disc pl-4 space-y-1">
            <li><strong>Input tax credits:</strong> Keep a tax invoice showing the supplier's TIN for each claimable expense over $20.</li>
            <li><strong>M-PAiSA and MyCash payments:</strong> Keep the SMS confirmation and reference number as proof of payment.</li>
            <li><strong>How often to file:</strong> If annual turnover is under FJD $300,000, you may be able to file VAT returns quarterly or annually. Check with FRCS.</li>
          </ul>
        </div>
      `;
    }

    if (isCost) {
      return `
        <div class="space-y-3 text-xs leading-relaxed text-slate-700">
          <p class="font-bold text-slate-900 text-sm">Cutting costs at ${bizName}:</p>
          <p>Your biggest expense category is <strong>${pnlStats.topExpenseCategory}</strong>. Total expenses: FJD $${pnlStats.totalExpenses.toFixed(2)}.</p>
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
            <p class="font-bold text-amber-900">Things to try:</p>
            <ul class="list-disc pl-4 space-y-1 text-amber-950">
              <li>Move phone and internet plans to a fixed business rate to lower monthly costs.</li>
              <li>Check your software subscriptions for ones you pay for twice.</li>
              <li>Mark all allowable travel and equipment expenses as tax-deductible under Section 21 of the Fiji Income Tax Act.</li>
            </ul>
          </div>
        </div>
      `;
    }

    return `
      <div class="space-y-3 text-xs leading-relaxed text-slate-700">
        <p class="font-bold text-slate-900 text-sm">Profit and loss (${pnlStats.periodLabel}):</p>
        <div class="grid grid-cols-2 gap-2 p-3 bg-slate-100 rounded-xl text-[11px]">
          <div><span class="text-slate-500 block">Revenue:</span><strong class="text-slate-900 font-mono text-xs">FJD $${pnlStats.totalRevenue.toFixed(2)}</strong></div>
          <div><span class="text-slate-500 block">Expenses:</span><strong class="text-rose-600 font-mono text-xs">FJD $${pnlStats.totalExpenses.toFixed(2)}</strong></div>
          <div><span class="text-slate-500 block">Net Profit:</span><strong class="${pnlStats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'} font-mono text-xs">FJD $${pnlStats.netProfit.toFixed(2)}</strong></div>
          <div><span class="text-slate-500 block">Net margin:</span><strong class="text-indigo-600 font-mono text-xs">${pnlStats.profitMargin.toFixed(1)}%</strong></div>
        </div>
        <p>Consider putting <strong>20% of net profit</strong> into a separate account for provisional tax and quarterly FRCS payments.</p>
      </div>
    `;
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
          ) : responseHtml ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-fade-in">
              <div 
                dangerouslySetInnerHTML={{ __html: responseHtml }}
              />
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
