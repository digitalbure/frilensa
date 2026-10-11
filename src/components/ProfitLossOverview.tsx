import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, TrendingDown, DollarSign, Plus, Camera, Sparkles, Filter, 
  Search, Calendar, Download, Printer, Eye, Trash2, Edit3, ArrowUpRight, 
  ArrowDownRight, CheckCircle2, AlertCircle, Building, Receipt, 
  Layers, ChevronRight, X, PieChart, BarChart3, HelpCircle, ShieldCheck
} from 'lucide-react';
import { CRMData, Transaction, ExpenseRecord } from '../types';
import { lineTotals } from '../lib/invoiceTotals';
import { getDocumentHomeValues } from '../lib/currencies';

interface ProfitLossOverviewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onOpenExpenseModal: (expense?: ExpenseRecord | null, mode?: 'manual' | 'camera_ocr') => void;
  onOpenAiAdvisor: () => void;
  onOpenAiCategorizer?: () => void;
}

export default function ProfitLossOverview({
  data,
  onUpdateData,
  onOpenExpenseModal,
  onOpenAiAdvisor,
  onOpenAiCategorizer
}: ProfitLossOverviewProps) {
  // Filters
  const [periodFilter, setPeriodFilter] = useState<'this_month' | 'last_month' | 'quarter' | 'ytd' | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Modals & Lightbox
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;

  // Extract all expenses (from both explicit data.expenses and negative transactions)
  const allExpenses: ExpenseRecord[] = useMemo(() => {
    const list: ExpenseRecord[] = [];
    const seenIds = new Set<string>();

    // 1. Explicit expenses in CRMData
    if (data.expenses && data.expenses.length > 0) {
      data.expenses.forEach(e => {
        if (!data.activeBusinessId || e.businessId === data.activeBusinessId || !e.businessId) {
          list.push(e);
          seenIds.add(e.id);
        }
      });
    }

    // 2. Map negative transactions that aren't already represented as explicit expenses
    if (data.transactions && data.transactions.length > 0) {
      data.transactions.forEach(tx => {
        if (tx.amount < 0 && !seenIds.has(tx.id)) {
          if (!data.activeBusinessId || tx.businessId === data.activeBusinessId || !tx.businessId) {
            const cost = Math.abs(tx.amount);
            const calculatedVat = tx.vatAmount !== undefined ? tx.vatAmount : (cost - (cost / (1 + currentVatRate / 100)));
            list.push({
              id: tx.id,
              date: tx.date,
              vendor: tx.vendor || tx.description.split(' - ')[0] || tx.description,
              description: tx.description,
              amount: cost,
              category: tx.category || 'Other Expense',
              paymentMethod: tx.paymentMethod || tx.bankName || 'Cash',
              vatAmount: calculatedVat,
              isTaxDeductible: tx.isTaxDeductible !== false,
              isVatClaimable: tx.isVatClaimable !== false,
              receiptImage: tx.receiptImage,
              receiptFileName: tx.receiptFileName,
              notes: tx.notes,
              businessId: tx.businessId,
              projectId: tx.projectId,
              clientId: tx.clientId
            });
            seenIds.add(tx.id);
          }
        }
      });
    }

    // Sort newest first
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.expenses, data.transactions, data.activeBusinessId, currentVatRate]);

  // Whether a YYYY-MM-DD date falls in the selected period (used for income and expenses alike).
  const inPeriod = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return (dateStr: string | undefined) => {
      if (periodFilter === 'all') return true;
      const itemDate = new Date(dateStr || '');
      if (isNaN(itemDate.getTime())) return false;
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth();
      if (periodFilter === 'this_month') return itemYear === currentYear && itemMonth === currentMonth;
      if (periodFilter === 'last_month') {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return itemYear === lastMonthYear && itemMonth === lastMonth;
      }
      if (periodFilter === 'quarter') return itemYear === currentYear && Math.floor(itemMonth / 3) === Math.floor(currentMonth / 3);
      if (periodFilter === 'ytd') return itemYear === currentYear;
      return true;
    };
  }, [periodFilter]);

  // Date filtering logic
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return allExpenses.filter(item => {
      const itemDate = new Date(item.date);
      const itemYear = itemDate.getFullYear();
      const itemMonth = itemDate.getMonth();

      // Period filter
      if (periodFilter === 'this_month') {
        if (itemYear !== currentYear || itemMonth !== currentMonth) return false;
      } else if (periodFilter === 'last_month') {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        if (itemYear !== lastMonthYear || itemMonth !== lastMonth) return false;
      } else if (periodFilter === 'quarter') {
        const currentQuarter = Math.floor(currentMonth / 3);
        const itemQuarter = Math.floor(itemMonth / 3);
        if (itemYear !== currentYear || itemQuarter !== currentQuarter) return false;
      } else if (periodFilter === 'ytd') {
        if (itemYear !== currentYear) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Payment method filter
      if (selectedPaymentMethod !== 'all' && item.paymentMethod !== selectedPaymentMethod) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matches = 
          item.vendor.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          (item.notes && item.notes.toLowerCase().includes(query));
        if (!matches) return false;
      }

      return true;
    });
  }, [allExpenses, periodFilter, selectedCategory, selectedPaymentMethod, searchQuery]);

  // Calculate Inflow / Revenue with Multi-Currency Normalization
  const revenueSummary = useMemo(() => {
    let totalRevenue = 0;
    let outputVat = 0;
    let reimbursed = 0;
    const paidDocIds = new Set<string>();

    // From Invoices and Receipts (normalized to base currency)
    const baseCurrency = data.userProfile?.defaultCurrency || 'FJD';
    (data.documents || []).forEach(doc => {
      if (!data.activeBusinessId || doc.businessId === data.activeBusinessId) {
        if ((doc.type === 'invoice' && doc.status === 'paid') || (doc.type === 'receipt' && !doc.originalInvoiceId)) {
          paidDocIds.add(doc.id);
          if (!inPeriod(doc.type === 'invoice' ? (doc.paymentDate || doc.issueDate) : doc.issueDate)) return;
          const conv = getDocumentHomeValues(doc, baseCurrency, undefined, data.transactions);
          // Costs passed on to the client are recovered, not earned: they're left out of income,
          // and the matching expenses are left out of expenses below.
          const recovered = doc.total > 0 ? lineTotals(doc.items || []).recoveredCost * (conv.homeTotal / doc.total) : 0;
          reimbursed += recovered;
          totalRevenue += conv.homeTotal - recovered;
          outputVat += conv.vatHome;
        }
      }
    });

    // Also include positive bank ledger transactions that aren't already represented by paid documents
    (data.transactions || []).forEach(tx => {
      if (tx.amount > 0) {
        if (!data.activeBusinessId || tx.businessId === data.activeBusinessId) {
          const isLinkedToPaidDoc = tx.documentId && tx.documentId.split(',').some(dId => paidDocIds.has(dId.trim()));
          if (!isLinkedToPaidDoc && inPeriod(tx.date)) {
            totalRevenue += (tx.netReceived ?? tx.amount);
            if (tx.vatAmount) outputVat += tx.vatAmount;
          }
        }
      }
    });

    return { totalRevenue, outputVat, reimbursed, paidDocIds };
  }, [data.documents, data.transactions, data.activeBusinessId, data.userProfile?.defaultCurrency, inPeriod]);

  // Calculate P&L aggregates
  const pnlStats = useMemo(() => {
    const recoveredExpenses = filteredExpenses.filter(item => item.billedDocumentId && revenueSummary.paidDocIds.has(item.billedDocumentId));
    const recoveredExpenseTotal = recoveredExpenses.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = filteredExpenses.reduce((sum, item) => sum + item.amount, 0) - recoveredExpenseTotal;
    const inputVat = filteredExpenses
      .filter(item => item.isVatClaimable !== false)
      .reduce((sum, item) => sum + (item.vatAmount || 0), 0);
    
    const taxDeductibleTotal = filteredExpenses
      .filter(item => item.isTaxDeductible !== false)
      .reduce((sum, item) => sum + item.amount, 0);

    const totalRevenue = revenueSummary.totalRevenue;
    const outputVat = revenueSummary.outputVat;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const netVatPayable = Math.max(0, outputVat - inputVat);

    // Group expenses by category
    const categoryTotals: Record<string, number> = {};
    filteredExpenses.forEach(item => {
      categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.amount;
    });

    // Top expense category
    let topCat = 'None';
    let topCatAmt = 0;
    Object.entries(categoryTotals).forEach(([cat, amt]) => {
      if (amt > topCatAmt) {
        topCat = cat;
        topCatAmt = amt;
      }
    });

    // Top vendors
    const vendorTotals: Record<string, number> = {};
    filteredExpenses.forEach(item => {
      vendorTotals[item.vendor] = (vendorTotals[item.vendor] || 0) + item.amount;
    });

    const topVendors = Object.entries(vendorTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const periodLabels: Record<string, string> = {
      this_month: 'This month',
      last_month: 'Last month',
      quarter: 'This quarter',
      ytd: `${new Date().getFullYear()} year to date`,
      all: 'All time'
    };

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      outputVat,
      inputVat,
      netVatPayable,
      taxDeductibleTotal,
      categoryTotals,
      topExpenseCategory: topCat,
      topVendors,
      reimbursed: revenueSummary.reimbursed,
      recoveredExpenseTotal,
      periodLabel: periodLabels[periodFilter] || 'Selected period'
    };
  }, [filteredExpenses, revenueSummary, periodFilter]);

  // Handle Delete Expense
  const handleDeleteExpense = (id: string) => {
    if (!confirm('Delete this expense?')) return;

    // Update data.expenses
    const updatedExpenses = (data.expenses || []).filter(e => e.id !== id);

    // Also clean from data.transactions if present
    const updatedTransactions = (data.transactions || []).filter(t => t.id !== id);

    onUpdateData({
      ...data,
      expenses: updatedExpenses,
      transactions: updatedTransactions
    });
  };

  const allCategories = [
    'Office Supplies', 'Internet & Utilities', 'Software SaaS', 'Travel & Transport', 
    'Meals & Entertainment', 'Electricity & Utilities', 'Hardware & Equipment', 
    'Tax & Licensing', 'Subcontractors', 'Marketing & Ads', 'Other Expense'
  ];

  return (
    <div className="space-y-5 text-slate-800">
      
      {/* Top Banner with Quick Actions & AI Co-Pilot Icon */}
      <div className="bg-slate-900 rounded-3xl p-4 sm:p-5 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-8 -top-8 w-40 h-40 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-widest text-sky-400 font-extrabold px-2 py-0.5 rounded-md bg-sky-950 border border-sky-800">
                  Bookkeeping
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  Fiji VAT
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight mt-1 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Profit and loss
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {onOpenAiCategorizer && (
                <button
                  onClick={onOpenAiCategorizer}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 text-xs font-bold px-3 py-2 rounded-2xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Categorise expenses with AI"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI categories</span>
                </button>
              )}

              {/* AI Advisor Icon Button */}
              <button
                onClick={onOpenAiAdvisor}
                className="bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-black px-3.5 py-2 rounded-2xl shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer border border-white/20 group"
                title="Ask the AI advisor"
              >
                <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
                <span>AI advisor</span>
              </button>
            </div>
          </div>

          {/* Key Metric Highlight Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            {/* Revenue */}
            <div className="bg-slate-950/70 backdrop-blur-md p-3 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
                <span>Income</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-sm sm:text-base font-black font-mono text-emerald-400">
                ${pnlStats.totalRevenue.toFixed(2)}
              </p>
              {pnlStats.reimbursed > 0 && (
                <p className="text-[9px] text-slate-400">Excludes ${pnlStats.reimbursed.toFixed(2)} of costs clients reimbursed</p>
              )}
              <span className="text-[8.5px] text-slate-400 block truncate">Paid invoices and receipts</span>
            </div>

            {/* Expenses */}
            <div className="bg-slate-950/70 backdrop-blur-md p-3 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
                <span>Expenses</span>
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <p className="text-sm sm:text-base font-black font-mono text-rose-400">
                ${pnlStats.totalExpenses.toFixed(2)}
              </p>
              <span className="text-[8.5px] text-slate-400 block truncate">{filteredExpenses.length} items</span>
            </div>

            {/* Net Profit */}
            <div className="bg-slate-950/70 backdrop-blur-md p-3 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
                <span>Net profit</span>
                <DollarSign className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <p className={`text-sm sm:text-base font-black font-mono ${pnlStats.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                ${pnlStats.netProfit.toFixed(2)}
              </p>
              <span className="text-[8.5px] text-indigo-300 font-bold block truncate">
                Margin: {pnlStats.profitMargin.toFixed(1)}%
              </span>
            </div>

            {/* Fiji VAT Net Position */}
            <div className="bg-slate-950/70 backdrop-blur-md p-3 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
                <span>Net VAT</span>
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <p className="text-sm sm:text-base font-black font-mono text-sky-300">
                ${pnlStats.netVatPayable.toFixed(2)}
              </p>
              <span className="text-[8.5px] text-slate-400 block truncate">
                Input: -${pnlStats.inputVat.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Bar: Log Expense & Camera Snap */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
            <button
              onClick={() => onOpenExpenseModal(null)}
              className="flex-1 bg-white hover:bg-slate-100 text-slate-900 py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-900" />
              <span>Add expense</span>
            </button>

            <button
              onClick={() => onOpenExpenseModal(null, 'camera_ocr')}
              className="bg-rose-600 hover:bg-rose-500 text-white py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Scan a receipt with your camera"
            >
              <Camera className="w-4 h-4" />
              <span>Scan receipt</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              title="Print profit and loss statement"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">P&L statement</span>
            </button>
          </div>
        </div>
      </div>

      {/* Period Filter Selector */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 overflow-x-auto scrollbar-none">
        {(['all', 'ytd', 'quarter', 'this_month', 'last_month'] as const).map(period => {
          const labels = {
            all: 'All time',
            ytd: '2026 YTD',
            quarter: 'This quarter',
            this_month: 'This month',
            last_month: 'Last month'
          };
          const isActive = periodFilter === period;
          return (
            <button
              key={period}
              onClick={() => setPeriodFilter(period)}
              className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-bold tracking-tight transition-all shrink-0 cursor-pointer ${
                isActive 
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {labels[period]}
            </button>
          );
        })}
      </div>

      {/* Category Expense Breakdown Visualizer */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
              Expenses by category
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-400">
            Total: ${pnlStats.totalExpenses.toFixed(2)}
          </span>
        </div>

        {pnlStats.totalExpenses === 0 ? (
          <div className="py-6 text-center text-slate-400 space-y-2">
            <Receipt className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">No expenses in this period.</p>
            <button
              onClick={() => onOpenExpenseModal(null)}
              className="text-xs font-bold text-sky-600 hover:underline cursor-pointer"
            >
              + Add an expense
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(Object.entries(pnlStats.categoryTotals) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([catName, amount]) => {
                const percent = pnlStats.totalExpenses > 0 ? (amount / pnlStats.totalExpenses) * 100 : 0;
                return (
                  <div key={catName} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-700">{catName}</span>
                      <span className="font-mono text-slate-900">
                        ${amount.toFixed(2)} <span className="text-[10px] text-slate-400 font-sans">({percent.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Itemized Expenses & Search / Filters */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden space-y-3">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-sky-600" />
              Expenses
            </h3>
            <p className="text-[10px] text-slate-400">
              Every expense with its VAT and receipt
            </p>
          </div>

          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-xl">
            {filteredExpenses.length} records
          </span>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-4 sm:px-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search vendor or description"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900"
            >
              <option value="all">All categories</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900"
            >
              <option value="all">All payment methods</option>
              <option value="Vodafone M-PAiSA">Vodafone M-PAiSA</option>
              <option value="Digicel MyCash">Digicel MyCash</option>
              <option value="Cash">Cash</option>
              <option value="Westpac Fiji">Westpac Fiji</option>
              <option value="ANZ Fiji">ANZ Fiji</option>
              <option value="BSP Fiji">BSP Fiji</option>
              <option value="Credit Card">Credit card</option>
            </select>
          </div>
        </div>

        {/* Expenses List */}
        <div className="p-4 sm:p-5 pt-0 space-y-2.5">
          {filteredExpenses.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Receipt className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No expenses match these filters.</p>
              <p className="text-[10px] text-slate-400">Try a different search or period.</p>
            </div>
          ) : (
            filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                {/* Left info */}
                <div className="flex items-start gap-3 overflow-hidden">
                  {/* Receipt thumbnail or category badge */}
                  {expense.receiptImage ? (
                    <button
                      type="button"
                      onClick={() => setLightboxImage({ url: expense.receiptImage!, title: expense.vendor })}
                      className="relative w-11 h-11 rounded-xl overflow-hidden border border-slate-300 shrink-0 group/img cursor-pointer"
                      title="View full receipt"
                    >
                      <img 
                        src={expense.receiptImage} 
                        alt="Receipt" 
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" 
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  )}

                  <div className="space-y-0.5 overflow-hidden">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-xs font-black text-slate-900 truncate">
                        {expense.vendor}
                      </h4>
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {expense.category}
                      </span>
                      {expense.isVatClaimable !== false && (
                        <span className="text-[8.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                          VAT claimable
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600 truncate">
                      {expense.description}
                    </p>

                    <div className="flex items-center gap-2 text-[9.5px] text-slate-400 font-mono">
                      <span>{expense.date}</span>
                      <span>•</span>
                      <span>{expense.paymentMethod}</span>
                      {expense.vatAmount ? (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 font-bold">
                            VAT: ${expense.vatAmount.toFixed(2)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right Amount & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <span className="text-xs sm:text-sm font-black font-mono text-rose-600 block">
                      -FJD ${expense.amount.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      {expense.isTaxDeductible !== false ? '✓ Tax deductible' : 'Not deductible'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onOpenExpenseModal(expense)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                      title="Edit expense"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                      title="Delete expense"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Receipt Photo Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-60 animate-fade-in">
          <div className="bg-slate-900 text-white rounded-3xl p-4 max-w-lg w-full space-y-3 shadow-2xl border border-slate-800">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 truncate">
                Receipt: {lightboxImage.title}
              </h4>
              <button
                onClick={() => setLightboxImage(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] flex items-center justify-center overflow-hidden rounded-2xl bg-black">
              <img 
                src={lightboxImage.url} 
                alt="Full receipt" 
                className="max-h-[68vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Formal Printable Fiji P&L Statement Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-60 animate-fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto text-slate-800">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-sky-400" />
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                  Profit and loss statement
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Statement Document */}
            <div className="p-6 sm:p-8 space-y-6 text-left font-sans max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible">
              
              {/* Business Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    {activeBusiness?.name || 'Frilensa Freelancer Studio'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeBusiness?.address || 'Suva, Fiji Islands'}
                  </p>
                  <p className="text-xs font-mono text-slate-600 mt-1">
                    TIN: <strong>{data.userProfile.tin || activeBusiness?.tin || 'Not set'}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black uppercase text-slate-400 tracking-widest block">
                    Profit and loss
                  </span>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">
                    Period: {pnlStats.periodLabel}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Printed: {new Date().toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>

              {/* 1. Revenue Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-100 p-2 rounded-lg">
                  1. Income
                </h4>
                <div className="space-y-1.5 px-2 text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span>Invoiced and other income</span>
                    <span className="font-mono font-bold">${pnlStats.totalRevenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5">
                    <span>Total income (FJD)</span>
                    <span className="font-mono text-emerald-600">${pnlStats.totalRevenue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 2. Operating Expenses Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-100 p-2 rounded-lg">
                  2. Expenses
                </h4>
                <div className="space-y-1.5 px-2 text-xs">
                  {(Object.entries(pnlStats.categoryTotals) as [string, number][]).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-slate-700">
                      <span>{cat}</span>
                      <span className="font-mono">${amt.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5">
                    <span>Total expenses (FJD)</span>
                    <span className="font-mono text-rose-600">${pnlStats.totalExpenses.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 3. Net Profit / (Loss) */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-sm font-black">
                  <span>Net profit / (loss) before tax</span>
                  <span className={`font-mono text-base ${pnlStats.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    FJD ${pnlStats.netProfit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Profit margin</span>
                  <span className="font-mono font-bold text-indigo-700">{pnlStats.profitMargin.toFixed(1)}%</span>
                </div>
              </div>

              {/* 4. Fiji FRCS VAT Summary */}
              <div className="space-y-2 text-xs">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-100 p-2 rounded-lg">
                  3. VAT summary ({currentVatRate}%)
                </h4>
                <div className="space-y-1 px-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Output VAT on sales</span>
                    <span className="font-mono">${pnlStats.outputVat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Less input VAT on purchases</span>
                    <span className="font-mono text-emerald-600">-${pnlStats.inputVat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                    <span>Net VAT payable / (credit)</span>
                    <span className="font-mono text-sky-800">${pnlStats.netVatPayable.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signature / Declaration */}
              <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-[10px] text-slate-500">
                <div>
                  <p className="font-bold text-slate-700">Prepared by</p>
                  <p className="mt-6 border-t border-slate-300 pt-1">
                    {data.userProfile.name || activeBusiness?.name}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-slate-700">Date</p>
                  <p className="mt-6 border-t border-slate-300 pt-1">
                    {new Date().toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
