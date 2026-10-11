import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Landmark, RefreshCw, Upload, Plus, Search, DollarSign, Tag, Trash2, X, 
  AlertCircle, AlertTriangle, HelpCircle, ArrowUpRight, ArrowDownLeft, Check, Percent, 
  Calculator, FileText, Sparkles, TrendingUp, Calendar, Filter, Briefcase, ChevronRight, Edit3,
  Camera, Receipt, PieChart, ShieldCheck, ArrowRightLeft, Globe, Building2, RotateCcw, History
} from 'lucide-react';
import { CRMData, Transaction, RateRule, ProductService, ExpenseRecord } from '../types';
import { getVentureConfig, VENTURE_MODELS } from '../lib/ventureModels';
import DateInput from './DateInput';
import ExpenseLoggingModal from './ExpenseLoggingModal';
import VatReturnView from './VatReturnView';
import ProfitLossOverview from './ProfitLossOverview';
import AiFinancialAdvisorModal from './AiFinancialAdvisorModal';
import AiExpenseCategorizationModal from './AiExpenseCategorizationModal';
import ExchangeRateCalculatorModal from './ExchangeRateCalculatorModal';
import { BankStatementImportModal } from './BankStatementImportModal';
import { DuplicateAuditModal } from './DuplicateAuditModal';
import { LedgerHistoryModal } from './LedgerHistoryModal';
import { findDuplicatesInLedger, checkTransactionDuplicate, deduplicateLedger } from '../lib/transactionDeduplication';
import { saveLedgerRestorePoint, getLatestLedgerRestorePoint, rollbackLedgerState, LedgerRestorePoint } from '../lib/ledgerHistory';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, getDocumentHomeValues } from '../lib/currencies';

interface BookkeepingViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onNavigateToTab?: (tab: 'dashboard' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant', options?: any) => void;
}

export default function BookkeepingView({ data, onUpdateData, onNavigateToTab }: BookkeepingViewProps) {
  // Navigation tabs inside Bookkeeping Center: 'pnl' (Default) | 'reconciler' | 'ledger' | 'rates'
  const [activeSubTab, setActiveSubTab] = useState<'pnl' | 'vat' | 'reconciler' | 'ledger' | 'rates'>('pnl');

  // Expense Logging Modal State
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [expenseModalMode, setExpenseModalMode] = useState<'manual' | 'camera_ocr'>('manual');

  // AI Financial Advisor Modal State
  const [showAiFinancialAdvisor, setShowAiFinancialAdvisor] = useState<boolean>(false);

  // FX Currency Converter Calculator Modal State
  const [showFxCalcModal, setShowFxCalcModal] = useState<boolean>(false);

  // AI Expense Categorizer Modal State
  const [showAiCategorizerModal, setShowAiCategorizerModal] = useState<boolean>(false);
  const [reconcileAiHint, setReconcileAiHint] = useState<{ category: string; confidence: number; reason: string } | null>(null);
  const [isReconcileAiLoading, setIsReconcileAiLoading] = useState<boolean>(false);
  const [isManualAiLoading, setIsManualAiLoading] = useState<boolean>(false);

  // Reconciler specific state
  const [reconcileSearch, setReconcileSearch] = useState('');
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [reconcileCategory, setReconcileCategory] = useState('Consulting Revenue');
  const [reconcileClientId, setReconcileClientId] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [autoMatchLogs, setAutoMatchLogs] = useState<string[]>([]);
  const [showAutoMatchModal, setShowAutoMatchModal] = useState(false);
  const [reconciledCountInSession, setReconciledCountInSession] = useState(0);

  // Ledger state & filters
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [bankFilter, setBankFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'income' | 'expense'

  // Form states for manual transaction
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualDesc, setManualDesc] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCategory, setManualCategory] = useState('Consulting Revenue');
  const [manualBank, setManualBank] = useState('BSP Fiji');
  const [manualType, setManualType] = useState<'income' | 'expense'>('expense');

  // Paste statement text state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [statementText, setStatementText] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [reassuranceMessage, setReassuranceMessage] = useState('');

  // Human-in-the-loop review queue for parsed transactions
  const [reviewQueue, setReviewQueue] = useState<Transaction[]>([]);

  // Deduplication & Undo / Recovery States
  const [showDuplicateAuditModal, setShowDuplicateAuditModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [undoToast, setUndoToast] = useState<{
    pointId: string;
    title: string;
    message: string;
  } | null>(null);

  // Rates module states
  const [showAddService, setShowAddService] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);

  // Form state for services
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [srvName, setSrvName] = useState('');
  const [srvDesc, setSrvDesc] = useState('');
  const [srvRate, setSrvRate] = useState(100);
  const [srvUnit, setSrvUnit] = useState('Hour');
  const [srvType, setSrvType] = useState<'service' | 'saas'>('service');
  const [srvInterval, setSrvInterval] = useState<'one-time' | 'monthly' | 'annual'>('one-time');

  // Form state for rate modifiers
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<'surcharge' | 'discount' | 'multiplier'>('multiplier');
  const [ruleValue, setRuleValue] = useState(1.5);
  const [ruleUnit, setRuleUnit] = useState<'percent' | 'flat' | 'multiplier'>('multiplier');
  const [ruleApplies, setRuleApplies] = useState<'all' | 'weekend' | 'rush' | 'after-hours'>('weekend');
  const [ruleDesc, setRuleDesc] = useState('');

  // Rate playground interactive states
  const [selectedPlaygroundSrv, setSelectedPlaygroundSrv] = useState<string>(data.services[0]?.id || '');
  const [playgroundHours, setPlaygroundHours] = useState(10);
  const [activePlaygroundRules, setActivePlaygroundRules] = useState<string[]>(['rule-1', 'rule-2']);

  // Category options
  const categoryOptions = [
    "Consulting Revenue",
    "Software SaaS",
    "Internet & Utilities",
    "Office Supplies",
    "Travel & Transport",
    "Meals & Entertainment",
    "Bank Fees & Charges",
    "Director Loan & Drawings",
    "Subcontractors & Crew",
    "Tax & Licensing",
    "Other Expense"
  ];

  // Helper getters
  const transactions: Transaction[] = data.transactions || [];
  const rateRules: RateRule[] = data.rateRules || [];

  const totalIncome = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netProfit = totalIncome - totalExpense;

  // Fiji Standard VAT Component liability: dynamic rate (e.g. 12.5% standard) is included in standard Fiji-based amounts
  const totalVatLiability = transactions.reduce((sum, t) => sum + (t.vatAmount || 0), 0);

  const userEmail = data.userProfile?.email || 'user';

  // Compute duplicate clusters present in the ledger
  const duplicateClusters = useMemo(() => {
    return findDuplicatesInLedger(transactions);
  }, [transactions]);

  const totalDuplicatesCount = useMemo(() => {
    return duplicateClusters.reduce((sum, c) => sum + (c.items.length - 1), 0);
  }, [duplicateClusters]);

  // Check if reviewQueue items duplicate existing transactions
  const reviewQueueDuplicates = useMemo(() => {
    return reviewQueue.filter(item => {
      const check = checkTransactionDuplicate(item, transactions);
      return check.isDuplicate;
    });
  }, [reviewQueue, transactions]);

  const triggerUndoToast = (pointId: string, title: string, message: string) => {
    setUndoToast({ pointId, title, message });
  };

  useEffect(() => {
    if (undoToast) {
      const timer = setTimeout(() => {
        setUndoToast(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [undoToast]);

  // Rollback ledger to snapshot
  const handleRollbackState = (restoredTransactions: Transaction[], restoredPoint: LedgerRestorePoint) => {
    onUpdateData({
      ...data,
      transactions: restoredTransactions
    });

    triggerUndoToast(
      '',
      'Ledger restored',
      `Restored to "${restoredPoint.actionTitle}" (${restoredTransactions.length} entries)`
    );
  };

  // Quick Undo Last Action
  const handleQuickUndo = () => {
    if (undoToast?.pointId) {
      const res = rollbackLedgerState(userEmail, undoToast.pointId, transactions);
      if (res) {
        handleRollbackState(res.restoredTransactions, res.restoredPoint);
        setUndoToast(null);
      }
    } else {
      const latest = getLatestLedgerRestorePoint(userEmail);
      if (latest) {
        const res = rollbackLedgerState(userEmail, latest.id, transactions);
        if (res) {
          handleRollbackState(res.restoredTransactions, res.restoredPoint);
        }
      }
    }
  };

  // Batch resolve / clean duplicates
  const handleResolveDuplicates = (cleanTransactions: Transaction[], removedCount: number) => {
    const point = saveLedgerRestorePoint(
      userEmail,
      `Duplicate removal (${removedCount} removed)`,
      'deduplicate',
      transactions,
      cleanTransactions,
      `Removed ${removedCount} duplicate entries`
    );

    onUpdateData({
      ...data,
      transactions: cleanTransactions
    });

    triggerUndoToast(
      point.id,
      'Duplicates removed',
      `Removed ${removedCount} duplicate entries.`
    );
  };

  // Synchronize reconcileNotes when a transaction is selected
  useEffect(() => {
    if (selectedTxId) {
      const tx = transactions.find(t => t.id === selectedTxId);
      setReconcileNotes(tx?.notes || '');
    } else {
      setReconcileNotes('');
    }
  }, [selectedTxId, transactions]);

  // Open statement importer
  const handleOpenStatementImporter = () => {
    setShowUploadModal(true);
  };

  // Classify raw statement paste
  const handleClassifyStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statementText.trim()) return;

    setIsClassifying(true);
    setReassuranceMessage('Reading the statement…');

    try {
      const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
      const res = await fetch('/api/bookkeeping/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textStatement: statementText, vatRate: currentVatRate })
      });
      const parsed = await res.json();

      const itemsWithIds: Transaction[] = parsed.categorized.map((item: any, i: number) => ({
        id: `upload-${Date.now()}-${i}`,
        date: item.date || new Date().toISOString().split('T')[0],
        description: item.description,
        amount: item.amount,
        category: item.category,
        status: 'pending',
        confidence: item.confidence || 85,
        bankName: item.bankName || 'BSP Fiji',
        vatAmount: item.vatAmount || 0
      }));

      setReviewQueue(prev => [...prev, ...itemsWithIds]);
      setShowUploadModal(false);
      setStatementText('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsClassifying(false);
    }
  };

  // Submit base64 receipt file for AI OCR extraction
  const handleReceiptOcrSubmit = async (fileData: string, fileName: string) => {
    setIsClassifying(true);
    setReassuranceMessage('Reading the receipt…');
    setShowReceiptModal(false);

    try {
      const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
      const res = await fetch('/api/bookkeeping/receipt-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, fileName, vatRate: currentVatRate })
      });
      const parsed = await res.json();

      if (!res.ok && !parsed.extracted) {
        throw new Error(parsed.error || `Couldn't read the receipt (${res.status})`);
      }

      const item = parsed.extracted;
      if (!item) {
        throw new Error(parsed.error || 'No details found in this file');
      }

      const rawAmount = Number(item.amount) || 0;
      // In bank transactions ledger, expenses are represented as negative amounts
      const expenseAmount = rawAmount > 0 ? -rawAmount : (rawAmount < 0 ? rawAmount : -10.00);
      const desc = item.description || (item.vendor ? `${item.vendor} purchase` : 'Scanned Invoice / Receipt');

      const ocrItem: Transaction = {
        id: `ocr-${Date.now()}`,
        date: item.date || new Date().toISOString().split('T')[0],
        description: desc,
        amount: expenseAmount,
        category: item.category || 'Office Supplies',
        status: 'pending',
        confidence: item.confidence || 90,
        bankName: item.bankName || 'BSP Fiji',
        vatAmount: item.vatAmount || 0
      };

      setReviewQueue(prev => [ocrItem, ...prev]);
    } catch (e: any) {
      console.error('OCR failed:', e);
      alert("Couldn't read this document: " + (e.message || 'check the file or enter the details yourself.'));
    } finally {
      setIsClassifying(false);
    }
  };

  // Handle manual file browse upload (supports PDF, PNG, JPG, WebP)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      handleReceiptOcrSubmit(base64, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Add approved items from human-in-the-loop review queue to permanent ledger
  const handleApproveAllReview = (skipDuplicates: boolean = false) => {
    let itemsToApprove = reviewQueue.map(item => ({ ...item, status: 'reconciled' as const }));
    let skippedCount = 0;

    if (skipDuplicates) {
      const clean = itemsToApprove.filter(item => !checkTransactionDuplicate(item, transactions).isDuplicate);
      skippedCount = itemsToApprove.length - clean.length;
      itemsToApprove = clean;
    }

    const updatedTransactions = [...itemsToApprove, ...transactions];

    const point = saveLedgerRestorePoint(
      userEmail,
      `Approval of ${itemsToApprove.length} imported entries`,
      'approve_review',
      transactions,
      updatedTransactions,
      skippedCount > 0 ? `${skippedCount} duplicates skipped` : undefined
    );

    onUpdateData({
      ...data,
      transactions: updatedTransactions
    });
    setReviewQueue([]);

    triggerUndoToast(
      point.id,
      'Entries added',
      `Added ${itemsToApprove.length} transactions to the ledger${skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ''}`
    );
  };

  const handleApproveSingle = (id: string) => {
    const approvedItem = reviewQueue.find(item => item.id === id);
    if (approvedItem) {
      const updatedTransactions = [{ ...approvedItem, status: 'reconciled' as const }, ...transactions];
      const point = saveLedgerRestorePoint(
        userEmail,
        `Approval of "${approvedItem.description}"`,
        'approve_review',
        transactions,
        updatedTransactions
      );
      onUpdateData({
        ...data,
        transactions: updatedTransactions
      });
      setReviewQueue(prev => prev.filter(item => item.id !== id));
      triggerUndoToast(point.id, 'Entry added', `Added "${approvedItem.description}" to the ledger`);
    }
  };

  const handleRemoveSingleReview = (id: string) => {
    setReviewQueue(prev => prev.filter(item => item.id !== id));
  };

  // ==========================================
  // AI RECONCILER COMPONENT HANDLERS
  // ==========================================

  // Find candidates for matching a transaction
  const getMatchCandidates = (tx: any) => {
    const candidates: Array<{
      id: string;
      type: 'invoice' | 'subscription';
      title: string;
      detail: string;
      amount: number;
      score: number;
      refObject: any;
    }> = [];

    const absAmount = Math.abs(tx.amount);
    const lowercaseDesc = tx.description.toLowerCase();

    // 1. Search Invoices
    const docs = data.documents || [];
    docs.forEach(doc => {
      if (doc.type === 'invoice') {
        let score = 0;
        
        // Multi-currency aware amount matching
        const docConv = getDocumentHomeValues(doc, data.userProfile.defaultCurrency || 'FJD', undefined, data.transactions);
        const homeAmtMatch = Math.abs(docConv.homeTotal - absAmount) < 0.50;
        const rawAmtMatch = Math.abs(doc.total - absAmount) < 0.01;
        const origAmtMatch = tx.originalAmount && Math.abs(doc.total - tx.originalAmount) < 0.01;
        
        if (homeAmtMatch || rawAmtMatch || origAmtMatch) {
          score += 65;
        } else if (Math.abs(docConv.homeTotal - absAmount) < (absAmount * 0.15) || Math.abs(doc.total - absAmount) < (absAmount * 0.15)) {
          // within 15% range
          score += 30;
        }

        // Multi-currency keyword detection (e.g. AUD, TT, remittance)
        if (doc.currency && doc.currency !== (data.userProfile.defaultCurrency || 'FJD') && lowercaseDesc.includes(doc.currency.toLowerCase())) {
          score += 20;
        }

        // Search for Invoice number in description
        if (lowercaseDesc.includes(doc.documentNumber.toLowerCase())) {
          score += 35;
        }

        // Match client name
        const client = data.clients.find(c => c.id === doc.clientId);
        if (client) {
          const clientNameLower = client.name.toLowerCase();
          const words = clientNameLower.split(' ');
          const hasWordMatch = words.some(w => w.length > 3 && lowercaseDesc.includes(w));
          if (hasWordMatch || lowercaseDesc.includes(clientNameLower)) {
            score += 15;
          }
        }

        // Boost open invoices
        if (doc.status === 'sent') {
          score += 10;
        } else if (doc.status === 'draft') {
          score += 5;
        } else if (doc.status === 'paid') {
          score -= 40; // penalty for already paid
        }

        if (score >= 30) {
          candidates.push({
            id: doc.id,
            type: 'invoice',
            title: `Invoice ${doc.documentNumber}`,
            detail: `Client: ${client?.name || 'Unknown'} | Date: ${doc.issueDate}`,
            amount: doc.total,
            score: Math.min(100, score),
            refObject: doc
          });
        }
      }
    });

    // 2. Search SaaS Client Subscriptions
    const clients = data.clients || [];
    clients.forEach(client => {
      const subs = client.subscriptions || [];
      subs.forEach(sub => {
        let score = 0;
        if (Math.abs(sub.price - absAmount) < 0.01) {
          score += 50;
        }

        const clientNameLower = client.name.toLowerCase();
        const words = clientNameLower.split(' ');
        const hasWordMatch = words.some(w => w.length > 3 && lowercaseDesc.includes(w));
        if (hasWordMatch || lowercaseDesc.includes(clientNameLower)) {
          score += 25;
        }

        if (sub.status === 'active') {
          score += 10;
        }

        if (score >= 40) {
          const service = data.services.find(s => s.id === sub.serviceId);
          candidates.push({
            id: sub.id,
            type: 'subscription',
            title: `${service?.name || 'Plan'} subscription`,
            detail: `Client: ${client.name} | Billed: ${sub.billingInterval}`,
            amount: sub.price,
            score: Math.min(100, score),
            refObject: { sub, client }
          });
        }
      });
    });

    // Sort by confidence score descending
    return candidates.sort((a, b) => b.score - a.score);
  };

  // Trigger Bula AI automated matching algorithm
  const handleTriggerAutoMatch = () => {
    setIsAutoMatching(true);
    setAutoMatchLogs([]);
    setShowAutoMatchModal(true);

    const pendingTxList = transactions.filter(t => t.status === 'pending');
    if (pendingTxList.length === 0) {
      setTimeout(() => {
        setAutoMatchLogs(["No pending transactions to reconcile."]);
        setIsAutoMatching(false);
      }, 800);
      return;
    }

    const matchesFound: string[] = [];
    const logs = ["Matching pending transactions to invoices and subscriptions…"];

    setTimeout(() => {
      pendingTxList.forEach(tx => {
        const candidates = getMatchCandidates(tx);
        const bestCandidate = candidates[0];
        
        if (bestCandidate && bestCandidate.score >= 75) {
          matchesFound.push(tx.id);
          logs.push(`✓ Matched "${tx.description}" (FJD $${Math.abs(tx.amount)}) to ${bestCandidate.title} (${bestCandidate.score}% match)`);
        } else {
          logs.push(`⚆ No match: "${tx.description}" (FJD $${Math.abs(tx.amount)}) needs you to reconcile it.`);
        }
      });

      logs.push(`\nDone. ${matchesFound.length} of ${pendingTxList.length} transactions matched.`);
      setAutoMatchLogs(logs);
      setIsAutoMatching(false);
    }, 1200);
  };

  const handleApproveAllAutoMatches = () => {
    const pendingTxList = transactions.filter(t => t.status === 'pending');
    let updatedTx = [...transactions];
    let updatedDocs = [...(data.documents || [])];
    let matchedCount = 0;

    pendingTxList.forEach(tx => {
      const candidates = getMatchCandidates(tx);
      const bestCandidate = candidates[0];

      if (bestCandidate && bestCandidate.score >= 75) {
        // Mark transaction as reconciled
        updatedTx = updatedTx.map(t => 
          t.id === tx.id ? { ...t, status: 'reconciled' as const, confidence: 100 } : t
        );

        if (bestCandidate.type === 'invoice') {
          // Update invoice status to paid
          updatedDocs = updatedDocs.map(d => 
            d.id === bestCandidate.id 
              ? { ...d, status: 'paid' as const, paymentMethod: tx.bankName } 
              : d
          );
        }
        matchedCount++;
      }
    });

    if (matchedCount > 0) {
      onUpdateData({
        ...data,
        transactions: updatedTx,
        documents: updatedDocs
      });
      setReconciledCountInSession(prev => prev + matchedCount);
      setSelectedTxId(null);
    }
    setShowAutoMatchModal(false);
  };

  // Reconcile a transaction using a matched candidate
  const handleReconcileWithMatch = (txId: string, candidate: any) => {
    let updatedTx = [...transactions];
    let updatedDocs = [...(data.documents || [])];

    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    // 1. Mark transaction as reconciled
    updatedTx = updatedTx.map(t => 
      t.id === txId 
        ? { 
            ...t, 
            status: 'reconciled' as const, 
            confidence: 100,
            notes: reconcileNotes.trim() ? reconcileNotes.trim() : t.notes
          } 
        : t
    );

    // 2. Handle invoice or subscription specific business logic
    if (candidate.type === 'invoice') {
      updatedDocs = updatedDocs.map(d => 
        d.id === candidate.id 
          ? { ...d, status: 'paid' as const, paymentMethod: tx.bankName } 
          : d
      );
    }

    onUpdateData({
      ...data,
      transactions: updatedTx,
      documents: updatedDocs
    });

    setReconciledCountInSession(prev => prev + 1);
    setSelectedTxId(null);
  };

  // AI Suggest Category for Reconciler
  const handleSuggestForReconcile = async (tx: Transaction) => {
    setIsReconcileAiLoading(true);
    try {
      const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
      const res = await fetch('/api/bookkeeping/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: tx.description,
          vendor: tx.vendor || tx.bankName,
          amount: Math.abs(tx.amount),
          businessType: data.userProfile.businessType || 'studio',
          vatRate: currentVatRate
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.category) {
          setReconcileCategory(json.category);
          setReconcileAiHint({
            category: json.category,
            confidence: json.confidence || 90,
            reason: json.reason || 'Suggested from the description.'
          });
        }
      }
    } catch (e) {
      console.warn('AI Reconcile suggest failed:', e);
    } finally {
      setIsReconcileAiLoading(false);
    }
  };

  // AI Suggest Category for Manual Log
  const handleSuggestForManualLog = async () => {
    if (!manualDesc.trim()) return;
    setIsManualAiLoading(true);
    try {
      const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
      const res = await fetch('/api/bookkeeping/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: manualDesc.trim(),
          amount: Math.abs(parseFloat(manualAmount) || 0),
          businessType: data.userProfile.businessType || 'studio',
          vatRate: currentVatRate
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.category) {
          setManualCategory(json.category);
        }
      }
    } catch (e) {
      console.warn('AI Manual suggest failed:', e);
    } finally {
      setIsManualAiLoading(false);
    }
  };

  // Reconcile a transaction directly using manual allocations
  const handleDirectReconcile = (txId: string) => {
    let updatedTx = [...transactions];

    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    // Reconcile transaction with user-specified category
    updatedTx = updatedTx.map(t => 
      t.id === txId 
        ? { 
            ...t, 
            status: 'reconciled' as const, 
            category: reconcileCategory,
            confidence: 100,
            notes: reconcileNotes.trim() ? reconcileNotes.trim() : t.notes
          } 
        : t
    );

    onUpdateData({
      ...data,
      transactions: updatedTx
    });

    setReconciledCountInSession(prev => prev + 1);
    setSelectedTxId(null);
  };

  // Manual transaction submit
  const handleAddManualTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDesc || !manualAmount) return;

    const numericAmount = Math.abs(parseFloat(manualAmount)) * (manualType === 'expense' ? -1 : 1);
    
    // Auto-calculate VAT components for Fiji (standard is 12.5% or profile default)
    const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
    const vatDivisor = 1 + (currentVatRate / 100);
    // For foreign SaaS subscriptions, set to 0.
    const isForeignSaaS = manualCategory === "Software SaaS";
    const calculatedVat = isForeignSaaS ? 0 : Number((numericAmount - (numericAmount / vatDivisor)).toFixed(2));

    const newTx: Transaction = {
      id: `tx-m-${Date.now()}`,
      date: manualDate,
      description: manualDesc,
      amount: numericAmount,
      category: manualCategory,
      status: 'reconciled',
      confidence: 100,
      bankName: manualBank,
      vatAmount: calculatedVat
    };

    onUpdateData({
      ...data,
      transactions: [newTx, ...transactions]
    });

    // Reset form
    setManualDesc('');
    setManualAmount('');
    setShowAddManual(false);
  };

  // Toggle transaction reconciliation status
  const handleToggleReconciliation = (id: string) => {
    const updated = transactions.map(t => 
      t.id === id 
        ? { ...t, status: (t.status === 'reconciled' ? 'pending' : 'reconciled') as any }
        : t
    );
    onUpdateData({
      ...data,
      transactions: updated
    });
  };

  // Delete transaction
  const handleDeleteTransaction = (id: string) => {
    if (confirm('Delete this ledger entry?')) {
      const txToDelete = transactions.find(t => t.id === id);
      const updated = transactions.filter(t => t.id !== id);
      const point = saveLedgerRestorePoint(
        userEmail,
        `Deletion of "${txToDelete?.description || 'transaction'}"`,
        'delete_entry',
        transactions,
        updated,
        `Removed entry of FJD $${Math.abs(txToDelete?.amount || 0).toFixed(2)}`
      );
      onUpdateData({
        ...data,
        transactions: updated
      });
      triggerUndoToast(
        point.id,
        'Entry deleted',
        `"${txToDelete?.description || 'Transaction'}" was removed from the ledger`
      );
    }
  };

  // Create or edit service/product catalog item
  const handleOpenAddService = () => {
    setEditingServiceId(null);
    setSrvName('');
    setSrvDesc('');
    setSrvRate(100);
    setSrvUnit('Hour');
    setSrvType('service');
    setSrvInterval('one-time');
    setShowAddService(true);
  };

  const handleOpenEditService = (srv: ProductService) => {
    setEditingServiceId(srv.id);
    setSrvName(srv.name);
    setSrvDesc(srv.description);
    setSrvRate(srv.rate);
    setSrvUnit(srv.unit);
    setSrvType(srv.type || 'service');
    setSrvInterval(srv.billingInterval || 'one-time');
    setShowAddService(true);
  };

  const handleSubmitService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!srvName || srvRate <= 0) return;

    if (editingServiceId) {
      // Edit
      const updated = data.services.map(s => 
        s.id === editingServiceId
          ? { ...s, name: srvName, description: srvDesc, rate: Number(srvRate), unit: srvUnit, type: srvType, billingInterval: srvInterval }
          : s
      );
      onUpdateData({ ...data, services: updated });
    } else {
      // Add
      const newSrv: ProductService = {
        id: `srv-${Date.now()}`,
        name: srvName,
        description: srvDesc,
        rate: Number(srvRate),
        unit: srvUnit,
        type: srvType,
        billingInterval: srvInterval,
        businessId: data.activeBusinessId
      };
      onUpdateData({ ...data, services: [...data.services, newSrv] });
      if (!selectedPlaygroundSrv) setSelectedPlaygroundSrv(newSrv.id);
    }
    setShowAddService(false);
  };

  const handleDeleteService = (id: string) => {
    if (confirm('Delete this item from the catalog?')) {
      onUpdateData({
        ...data,
        services: data.services.filter(s => s.id !== id)
      });
    }
  };

  // Create a new rate rule (Weekend, Rush, Discount)
  const handleAddRateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName || ruleValue === 0) return;

    const newRule: RateRule = {
      id: `rule-${Date.now()}`,
      name: ruleName,
      type: ruleType,
      value: Number(ruleValue),
      unit: ruleUnit,
      appliesTo: ruleApplies,
      description: ruleDesc || `${ruleName} custom rule`,
      isActive: true
    };

    onUpdateData({
      ...data,
      rateRules: [...rateRules, newRule]
    });

    // Reset and close
    setRuleName('');
    setRuleDesc('');
    setShowAddRule(false);
    setActivePlaygroundRules(prev => [...prev, newRule.id]);
  };

  const handleToggleRuleActive = (id: string) => {
    const updated = rateRules.map(r => 
      r.id === id ? { ...r, isActive: !r.isActive } : r
    );
    onUpdateData({
      ...data,
      rateRules: updated
    });
  };

  const handleDeleteRule = (id: string) => {
    if (confirm('Delete this rate rule?')) {
      onUpdateData({
        ...data,
        rateRules: rateRules.filter(r => r.id !== id)
      });
      setActivePlaygroundRules(prev => prev.filter(rid => rid !== id));
    }
  };

  // Filter Transactions logic
  const filteredLedger = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(ledgerSearch.toLowerCase()) || 
                          t.category.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
                          t.bankName.toLowerCase().includes(ledgerSearch.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesBank = bankFilter === 'all' || t.bankName === bankFilter;
    const matchesType = typeFilter === 'all' || 
                        (typeFilter === 'income' && t.amount > 0) || 
                        (typeFilter === 'expense' && t.amount < 0);

    return matchesSearch && matchesCategory && matchesBank && matchesType;
  });

  // Calculate live dynamic rates based on chosen options
  const selectedService = data.services.find(s => s.id === selectedPlaygroundSrv) || data.services[0];
  
  const calculatePlaygroundRate = () => {
    if (!selectedService) return { baseRate: 0, subtotal: 0, surcharges: 0, discounts: 0, multiplierLabel: '', rawTotal: 0, vatAmount: 0, totalRate: 0, breakdownSteps: [] as string[] };

    let currentRate = selectedService.rate;
    let baseRate = selectedService.rate;
    let subtotal = currentRate * (selectedService.unit === 'Hour' ? playgroundHours : 1);
    let surcharges = 0;
    let discounts = 0;
    let multiplierMultiplier = 1;
    const steps: string[] = [`Base rate: FJD $${baseRate.toFixed(2)} per ${selectedService.unit.toLowerCase()}`];

    // Read active rules selected in checklist
    activePlaygroundRules.forEach(ruleId => {
      const rule = rateRules.find(r => r.id === ruleId);
      if (rule && rule.isActive) {
        if (rule.type === 'multiplier') {
          multiplierMultiplier *= rule.value;
          steps.push(`${rule.name}: ${rule.value}x`);
        } else if (rule.type === 'surcharge') {
          if (rule.unit === 'flat') {
            surcharges += rule.value;
            steps.push(`${rule.name}: +FJD $${rule.value.toFixed(2)}`);
          } else {
            const surchargeAmt = (baseRate * rule.value) / 100;
            surcharges += surchargeAmt;
            steps.push(`${rule.name}: +${rule.value}% (+FJD $${surchargeAmt.toFixed(2)})`);
          }
        } else if (rule.type === 'discount') {
          if (rule.unit === 'flat') {
            discounts += Math.abs(rule.value);
            steps.push(`${rule.name}: -FJD $${Math.abs(rule.value).toFixed(2)}`);
          } else {
            const discountAmt = (baseRate * Math.abs(rule.value)) / 100;
            discounts += discountAmt;
            steps.push(`${rule.name}: -${Math.abs(rule.value)}% (-FJD $${discountAmt.toFixed(2)})`);
          }
        }
      }
    });

    // Multipliers affect base hourly/flat rate first
    const rateWithMultiplier = baseRate * multiplierMultiplier;
    const finalRatePerUnit = rateWithMultiplier + surcharges - discounts;
    const rawTotal = finalRatePerUnit * (selectedService.unit === 'Hour' ? playgroundHours : 1);

    // standard VAT included component (default 12.5% or configured)
    const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
    const vatDivisor = 1 + (currentVatRate / 100);
    const vatIncluded = rawTotal - (rawTotal / vatDivisor);

    return {
      baseRate,
      finalRatePerUnit,
      rawTotal,
      vatAmount: vatIncluded,
      breakdownSteps: steps
    };
  };

  const ratePlaygroundResults = calculatePlaygroundRate();

  // Save / Update logged expense and keep transactions ledger synchronized
  const handleSaveExpense = (expense: ExpenseRecord) => {
    const currentExpenses = data.expenses || [];
    const existingIdx = currentExpenses.findIndex(e => e.id === expense.id);
    let updatedExpenses: ExpenseRecord[];

    if (existingIdx >= 0) {
      updatedExpenses = [...currentExpenses];
      updatedExpenses[existingIdx] = expense;
    } else {
      updatedExpenses = [expense, ...currentExpenses];
    }

    // Synchronize into transactions ledger
    const currentTxs = data.transactions || [];
    const txIdx = currentTxs.findIndex(t => t.id === expense.id);
    const fxTag = expense.originalCurrency && expense.originalAmount
      ? ` [${expense.originalCurrency} ${expense.originalAmount.toFixed(2)}]`
      : '';
    const correspondingTx: Transaction = {
      id: expense.id,
      date: expense.date,
      description: (expense.description || `${expense.vendor} expense`) + (!expense.description?.includes(expense.originalCurrency || '') ? fxTag : ''),
      amount: -Math.abs(expense.amount),
      category: expense.category,
      status: 'reconciled',
      confidence: 100,
      bankName: expense.paymentMethod || 'Cash',
      vatAmount: expense.vatAmount,
      vendor: expense.vendor,
      paymentMethod: expense.paymentMethod,
      receiptImage: expense.receiptImage,
      receiptFileName: expense.receiptFileName,
      isTaxDeductible: expense.isTaxDeductible,
      isVatClaimable: expense.isVatClaimable,
      notes: expense.notes,
      businessId: expense.businessId,
      projectId: expense.projectId,
      clientId: expense.clientId
    };

    let updatedTxs: Transaction[];
    if (txIdx >= 0) {
      updatedTxs = [...currentTxs];
      updatedTxs[txIdx] = correspondingTx;
    } else {
      updatedTxs = [correspondingTx, ...currentTxs];
    }

    onUpdateData({
      ...data,
      expenses: updatedExpenses,
      transactions: updatedTxs
    });
  };

  // Compute live P&L stats for the AI Financial Advisor popup
  const pnlStatsForAdvisor = React.useMemo(() => {
    let totalRevenue = 0;
    let outputVat = 0;
    const paidDocIds = new Set<string>();
    const baseCurr = data.userProfile.defaultCurrency || 'FJD';

    (data.documents || []).forEach(doc => {
      if (!data.activeBusinessId || doc.businessId === data.activeBusinessId) {
        if ((doc.type === 'invoice' && doc.status === 'paid') || doc.type === 'receipt') {
          paidDocIds.add(doc.id);
          const conv = getDocumentHomeValues(doc, baseCurr, undefined, data.transactions);
          totalRevenue += conv.homeTotal;
          outputVat += conv.vatHome;
        }
      }
    });

    (data.transactions || []).forEach(tx => {
      if (tx.amount > 0) {
        if (!data.activeBusinessId || tx.businessId === data.activeBusinessId) {
          const isLinkedToPaidDoc = tx.documentId && tx.documentId.split(',').some(dId => paidDocIds.has(dId.trim()));
          if (!isLinkedToPaidDoc) {
            totalRevenue += (tx.netReceived ?? tx.amount);
            if (tx.vatAmount) outputVat += tx.vatAmount;
          }
        }
      }
    });

    const allExp = data.expenses || [];
    const totalExpenses = allExp.reduce((sum, e) => sum + e.amount, 0);
    const inputVat = allExp
      .filter(e => e.isVatClaimable !== false)
      .reduce((sum, e) => sum + (e.vatAmount || 0), 0);

    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const netVatPayable = Math.max(0, outputVat - inputVat);

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      outputVat,
      inputVat,
      netVatPayable,
      topExpenseCategory: allExp[0]?.category || 'Office Supplies',
      periodLabel: '2026 financial year'
    };
  }, [data]);

  const activeBiz = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const activeVentureConfig = getVentureConfig(activeBiz?.type || 'studio');

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto pb-24 font-sans select-none">
      
      {/* Header Banner with AI Advisor & AI Expense Categorizer Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium block">Bookkeeping</span>
            <span className={`text-[8.5px] font-extrabold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 ${activeVentureConfig.badgeBg} ${activeVentureConfig.badgeText} border ${activeVentureConfig.badgeBorder}`}>
              <Briefcase className="w-2.5 h-2.5" />
              <span>{activeVentureConfig.shortLabel} ({activeBiz?.name || 'Current business'})</span>
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-display font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5 mt-0.5">
            <Landmark className="w-5 h-5 text-sky-600" /> Bookkeeping
          </h2>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10.5px] text-zinc-400 font-medium">Typical expenses:</span>
            {activeVentureConfig.expenseFocus.map((focusTag) => (
              <span key={focusTag} className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md border border-zinc-200/60 font-medium">
                {focusTag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Scan Receipt Action Button */}
          <button
            type="button"
            onClick={() => {
              setEditingExpense(null);
              setExpenseModalMode('camera_ocr');
              setShowExpenseModal(true);
            }}
            className="bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-rose-700 text-xs font-black px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Scan a receipt to fill in the vendor, amount and date"
          >
            <Camera className="w-3.5 h-3.5 text-rose-600" />
            <span>Scan receipt</span>
          </button>

          {/* AI Expense Categorizer Call-up Button */}
          <button
            type="button"
            onClick={() => setShowAiCategorizerModal(true)}
            className="bg-sky-50 hover:bg-sky-100 border border-sky-200/80 text-sky-700 text-xs font-black px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Suggest expense categories with AI"
          >
            <Tag className="w-3.5 h-3.5 text-sky-600" />
            <span>AI categories</span>
          </button>

          {/* AI Advisor Call-up Icon */}
          <button
            type="button"
            onClick={() => setShowAiFinancialAdvisor(true)}
            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-700 text-xs font-black px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Ask the AI advisor"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            <span>AI advisor</span>
          </button>

          {/* International FX & Currency Converter Button */}
          <button
            type="button"
            onClick={() => setShowFxCalcModal(true)}
            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 text-emerald-700 text-xs font-black px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Convert between currencies"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600" />
            <span>Currency converter</span>
          </button>
        </div>
      </div>

      {/* Main Mode Sub-Navigation Slider */}
      <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
        <button
          onClick={() => setActiveSubTab('pnl')}
          className={`flex-1 py-2 text-[10px] font-extrabold tracking-tight rounded-lg transition-all ${
            activeSubTab === 'pnl'
              ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/40'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          P&L and expenses
        </button>
        <button
          onClick={() => setActiveSubTab('vat')}
          className={`flex-1 py-2 text-[10px] font-extrabold tracking-tight rounded-lg transition-all ${
            activeSubTab === 'vat'
              ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/40'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          VAT return
        </button>
        <button
          onClick={() => setActiveSubTab('reconciler')}
          className={`flex-1 py-2 text-[10px] font-extrabold tracking-tight rounded-lg transition-all ${
            activeSubTab === 'reconciler'
              ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/40'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          Reconcile
        </button>
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`flex-1 py-2 text-[10px] font-extrabold tracking-tight rounded-lg transition-all ${
            activeSubTab === 'ledger'
              ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/40'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          Ledger
        </button>
        <button
          onClick={() => setActiveSubTab('rates')}
          className={`flex-1 py-2 text-[10px] font-extrabold tracking-tight rounded-lg transition-all ${
            activeSubTab === 'rates'
              ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/40'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          Rates
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'vat' ? (
          <motion.div
            key="vat-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            <VatReturnView data={data} />
          </motion.div>
        ) : activeSubTab === 'pnl' ? (
          <motion.div
            key="pnl-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            <ProfitLossOverview
              data={data}
              onUpdateData={onUpdateData}
              onOpenExpenseModal={(exp, mode) => {
                setEditingExpense(exp || null);
                setExpenseModalMode(mode || 'manual');
                setShowExpenseModal(true);
              }}
              onOpenAiAdvisor={() => setShowAiFinancialAdvisor(true)}
              onOpenAiCategorizer={() => setShowAiCategorizerModal(true)}
            />
          </motion.div>
        ) : activeSubTab === 'reconciler' ? (
          <motion.div
            key="reconciler-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4 text-left"
          >
            {/* Reconciliation Progress Meter */}
            {(() => {
              const pendingCount = transactions.filter(t => t.status === 'pending').length;
              const reconciledCount = transactions.filter(t => t.status === 'reconciled').length;
              const totalCount = transactions.length;
              const progressPct = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;

              return (
                <div className="bg-white border border-zinc-100 p-4 rounded-2xl shadow-sm space-y-3.5">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-zinc-800">
                        Bank reconciliation
                      </h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Match bank transactions to invoices and subscriptions
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-zinc-900 font-mono">{progressPct}%</span>
                      <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Matched</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center border-t border-zinc-50/85">
                    <div className="bg-zinc-50/50 p-2 rounded-xl">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Pending</span>
                      <span className="text-xs font-black text-amber-600 font-mono mt-0.5 block">{pendingCount} items</span>
                    </div>
                    <div className="bg-zinc-50/50 p-2 rounded-xl">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Reconciled</span>
                      <span className="text-xs font-black text-emerald-600 font-mono mt-0.5 block">{reconciledCount} items</span>
                    </div>
                    <div className="bg-zinc-50/50 p-2 rounded-xl">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Total</span>
                      <span className="text-xs font-black text-sky-600 font-mono mt-0.5 block">{totalCount} items</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Bula AI Smart Audit Core */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-4 rounded-2xl shadow-md border border-zinc-700/40 space-y-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-500/30">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </span>
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-400">Auto-match</h4>
                  <p className="text-[9.5px] text-zinc-300">Match pending bank transactions to your invoices and subscriptions.</p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={handleTriggerAutoMatch}
                  className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-extrabold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Find matches</span>
                </button>
                <button
                  onClick={() => setShowAiCategorizerModal(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-white font-extrabold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI categories</span>
                </button>
              </div>
            </div>

            {/* Reconciled Congratulations Toast Notification */}
            {reconciledCountInSession > 0 && (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-left">
                  <span className="p-1 bg-emerald-500 text-white rounded-full">
                    <Check className="w-3 h-3" />
                  </span>
                  <p className="text-xs font-bold">
                    Reconciled {reconciledCountInSession} transaction{reconciledCountInSession > 1 ? 's' : ''}
                  </p>
                </div>
                <button 
                  onClick={() => setReconciledCountInSession(0)}
                  className="text-emerald-500 hover:text-emerald-700 font-bold text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Main Reconciler Focus Area */}
            {(() => {
              const pendingTx = transactions.filter(t => t.status === 'pending');
              const filteredPending = pendingTx.filter(t => 
                t.description.toLowerCase().includes(reconcileSearch.toLowerCase()) ||
                t.bankName.toLowerCase().includes(reconcileSearch.toLowerCase()) ||
                t.category.toLowerCase().includes(reconcileSearch.toLowerCase())
              );

              if (pendingTx.length === 0) {
                return (
                  <div className="bg-white border border-zinc-100 p-8 rounded-3xl text-center space-y-3.5 shadow-sm">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100/50">
                      <Check className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase text-zinc-800 tracking-tight">All reconciled</h4>
                      <p className="text-xs text-zinc-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
                        Every imported bank transaction has been matched or categorised.
                      </p>
                    </div>
                    <div className="pt-2">
                      <button
                        onClick={() => setActiveSubTab('ledger')}
                        className="bg-zinc-950 text-white px-4 py-2 rounded-xl text-xs font-extrabold hover:bg-zinc-900 transition-all cursor-pointer"
                      >
                        View ledger
                      </button>
                    </div>
                  </div>
                );
              }

              // Selected Transaction Matchmaker View
              if (selectedTxId) {
                const tx = transactions.find(t => t.id === selectedTxId);
                if (!tx) {
                  return null;
                }

                const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
                const vatDivisor = 1 + (currentVatRate / 100);
                const candidates = getMatchCandidates(tx);
                const vatAmt = tx.vatAmount !== undefined ? tx.vatAmount : (tx.amount - (tx.amount / vatDivisor));

                return (
                  <div className="space-y-4 text-left">
                    {/* Back Button */}
                    <button
                      onClick={() => setSelectedTxId(null)}
                      className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 cursor-pointer bg-zinc-100 py-1.5 px-3 rounded-lg border border-zinc-200"
                    >
                      ← Back to pending transactions
                    </button>

                    {/* Prominent Focused Transaction Card */}
                    <div className={`p-4 rounded-2xl border text-white relative overflow-hidden ${
                      tx.bankName === 'M-Paisa' ? 'bg-gradient-to-br from-red-600 to-red-700 border-red-500' :
                      tx.bankName === 'BSP Fiji' ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 border-emerald-500' :
                      tx.bankName === 'ANZ Fiji' ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500' :
                      'bg-gradient-to-br from-zinc-700 to-zinc-800 border-zinc-600'
                    }`}>
                      <div className="absolute right-4 top-4 bg-white/10 px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider">
                        {tx.bankName}
                      </div>
                      <span className="text-[9px] opacity-85 uppercase font-bold">{tx.date}</span>
                      <h3 className="text-sm font-black leading-snug mt-1 max-w-[85%]">{tx.description}</h3>
                      
                      <div className="flex justify-between items-end mt-4 pt-4 border-t border-white/10">
                        <div>
                          <span className="text-[9px] opacity-80 uppercase block">VAT ({currentVatRate}%)</span>
                          <span className="text-xs font-bold font-mono text-white/95">
                            FJD ${Math.abs(Number(vatAmt)).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] opacity-80 uppercase block">Amount</span>
                          <span className="text-base font-black font-mono">
                            FJD ${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* AI Suggested Matches Section */}
                    <div className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black uppercase text-zinc-800 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-sky-500 animate-pulse" /> Possible matches
                        </h4>
                        <span className="text-[9px] bg-zinc-100 px-2 py-0.5 rounded-full text-zinc-500 font-bold">
                          {candidates.length} found
                        </span>
                      </div>

                      {candidates.length === 0 ? (
                        <div className="text-center py-6 bg-zinc-50/50 rounded-xl border border-zinc-100 text-zinc-400">
                          <AlertCircle className="w-5 h-5 mx-auto text-zinc-300 mb-1" />
                          <p className="text-[10px] leading-relaxed max-w-[240px] mx-auto">
                            No open invoice or subscription matches FJD ${Math.abs(tx.amount).toLocaleString()}.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 text-left">
                          {candidates.map((c) => (
                            <div 
                              key={c.id} 
                              className="border border-zinc-100 hover:border-zinc-200 bg-zinc-50/40 p-3 rounded-xl flex justify-between items-center gap-3 transition-colors"
                            >
                              <div className="space-y-1 truncate text-left">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                    c.score >= 85 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {c.score}% match
                                  </span>
                                  <span className="text-[10px] font-extrabold text-zinc-700 truncate">{c.title}</span>
                                </div>
                                <p className="text-[9.5px] text-zinc-400 truncate">{c.detail}</p>
                              </div>

                              <div className="text-right shrink-0 flex flex-col items-end">
                                <span className="text-xs font-black text-zinc-900 font-mono">
                                  FJD ${c.amount.toLocaleString()}
                                </span>
                                <button
                                  onClick={() => handleReconcileWithMatch(tx.id, c)}
                                  className="mt-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[9.5px] py-1 px-2.5 rounded-lg flex items-center gap-0.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                >
                                  <Check className="w-3 h-3" /> Reconcile
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Manual Categorize / Allocation Section */}
                    <div className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm space-y-3 text-left">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-black uppercase text-zinc-800">
                            Categorise it yourself
                          </h4>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            Pick a category and add this transaction to the ledger.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSuggestForReconcile(tx)}
                          disabled={isReconcileAiLoading}
                          className="text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className={`w-3 h-3 text-amber-600 ${isReconcileAiLoading ? 'animate-spin' : ''}`} />
                          <span>{isReconcileAiLoading ? 'Thinking…' : 'Suggest with AI'}</span>
                        </button>
                      </div>

                      {/* AI Recommendation Banner if available */}
                      {reconcileAiHint && (
                        <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-amber-900 flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                              Suggested: {reconcileAiHint.category}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              {reconcileAiHint.confidence}% confident
                            </span>
                          </div>
                          <p className="text-[10px] text-amber-800/90 leading-tight">
                            {reconcileAiHint.reason}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-zinc-400 tracking-wider block">Category</label>
                          <select
                            value={reconcileCategory}
                            onChange={(e) => setReconcileCategory(e.target.value)}
                            className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-400 focus:bg-white rounded-xl py-1.5 px-2.5 text-xs text-zinc-700 font-semibold focus:outline-none"
                          >
                            {categoryOptions.map((opt, oIdx) => (
                              <option key={oIdx} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-zinc-400 tracking-wider block">Client</label>
                          <select
                            value={reconcileClientId}
                            onChange={(e) => setReconcileClientId(e.target.value)}
                            className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-400 focus:bg-white rounded-xl py-1.5 px-2.5 text-xs text-zinc-700 font-semibold focus:outline-none"
                          >
                            <option value="">No linked client</option>
                            {data.clients.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Notes section right at the bottom of the popover */}
                      <div className="space-y-1 pt-2 border-t border-zinc-100">
                        <label className="text-[8px] font-black uppercase text-zinc-400 tracking-wider block">
                          Notes
                        </label>
                        <textarea
                          rows={2}
                          value={reconcileNotes}
                          onChange={(e) => setReconcileNotes(e.target.value)}
                          placeholder="e.g. vendor TIN, cheque number"
                          className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-400 focus:bg-white rounded-xl py-1.5 px-2.5 text-xs text-zinc-700 font-medium focus:outline-none resize-none"
                        />
                      </div>

                      <button
                        onClick={() => handleDirectReconcile(tx.id)}
                        className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-xs py-2 rounded-xl text-center cursor-pointer transition-all active:scale-95 shadow-sm mt-1"
                      >
                        ✓ Add to ledger
                      </button>
                    </div>
                  </div>
                );
              }

              // Standard Pending Bank Statement List
              return (
                <div className="space-y-3 text-left">
                  {/* Search Bar */}
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search description, bank or category"
                      value={reconcileSearch}
                      onChange={(e) => setReconcileSearch(e.target.value)}
                      className="w-full bg-white border border-zinc-100 hover:border-zinc-200 rounded-2xl py-2.5 pl-9 pr-3 text-xs text-zinc-800 placeholder-zinc-400 transition-colors focus:outline-none shadow-xs"
                    />
                  </div>

                  {/* List header */}
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Pending ({filteredPending.length})
                    </span>
                    <span className="text-[9px] text-zinc-400 italic">
                      Tap a transaction to see matches
                    </span>
                  </div>

                  {/* Pending Transactions Stack */}
                  {filteredPending.length === 0 ? (
                    <div className="text-center py-8 bg-white rounded-2xl border border-zinc-100 text-zinc-400 text-[11px]">
                      No pending items match "{reconcileSearch}".
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                      {filteredPending.map((tx) => {
                        const candidates = getMatchCandidates(tx);
                        const hasStrongMatch = candidates[0] && candidates[0].score >= 75;

                        return (
                          <div
                            key={tx.id}
                            onClick={() => setSelectedTxId(tx.id)}
                            className="bg-white hover:border-zinc-300 border border-zinc-100 rounded-2xl p-3.5 shadow-sm transition-all hover:shadow-md cursor-pointer text-left space-y-2 relative"
                          >
                            <div className="flex justify-between items-start gap-3">
                              <div className="space-y-0.5 truncate text-left">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono ${
                                    tx.bankName === 'M-Paisa' ? 'bg-red-50 text-red-700 border border-red-100/50' :
                                    tx.bankName === 'BSP Fiji' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/50' :
                                    tx.bankName === 'ANZ Fiji' ? 'bg-blue-50 text-blue-700 border border-blue-100/50' :
                                    'bg-zinc-50 text-zinc-700'
                                  }`}>
                                    {tx.bankName}
                                  </span>
                                  <span className="text-[9px] font-bold text-zinc-400">{tx.date}</span>
                                </div>
                                <h4 className="text-xs font-black text-zinc-800 truncate leading-snug mt-1">{tx.description}</h4>
                              </div>

                              <div className="text-right shrink-0">
                                <span className={`text-xs font-black font-mono ${tx.amount > 0 ? 'text-emerald-600' : 'text-zinc-900'}`}>
                                  {tx.amount > 0 ? '+' : '-'} FJD ${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>

                            {/* Matching Preview Strip */}
                            <div className="flex justify-between items-center pt-2 border-t border-zinc-50/85">
                              {hasStrongMatch ? (
                                <div className="flex items-center gap-1 text-[9.5px] text-emerald-600 font-bold">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Likely match ({candidates[0].score}%)</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-[9.5px] text-zinc-400 font-medium">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>Manual review needed</span>
                                </div>
                              )}

                              <span className="text-[10px] text-sky-600 font-black uppercase tracking-wider flex items-center gap-0.5 hover:underline">
                                Reconcile →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        ) : activeSubTab === 'ledger' ? (
          <motion.div
            key="ledger-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Financial Bento Matrix Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-zinc-100 p-3.5 rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute right-3 top-3 bg-emerald-50 text-emerald-600 p-1.5 rounded-xl">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">Income</span>
                <p className="text-base font-black text-zinc-900 mt-1 font-mono">FJD ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-bold uppercase">All accounts</span>
                </div>
              </div>

              <div className="bg-white border border-zinc-100 p-3.5 rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute right-3 top-3 bg-rose-50 text-rose-600 p-1.5 rounded-xl">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">Expenses</span>
                <p className="text-base font-black text-rose-600 mt-1 font-mono">FJD ${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[8px] bg-rose-100 text-rose-800 px-1 py-0.5 rounded font-bold uppercase">All accounts</span>
                </div>
              </div>

              <div className="bg-white border border-zinc-100 p-3.5 rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute right-3 top-3 bg-sky-50 text-sky-600 p-1.5 rounded-xl">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">Net profit</span>
                <p className="text-base font-black text-zinc-900 mt-1 font-mono">FJD ${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>

              <div className="bg-white border border-zinc-100 p-3.5 rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute right-3 top-3 bg-indigo-50 text-indigo-600 p-1.5 rounded-xl">
                  <Percent className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">VAT</span>
                <p className="text-base font-black text-indigo-600 mt-1 font-mono">FJD ${totalVatLiability.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[8px] text-zinc-500 font-bold">VAT at {data.userProfile.defaultVatRate ?? 12.5}%, included in amounts</span>
                </div>
              </div>
            </div>

            {/* Live Bank Statement Reconciliation & Receipt OCR */}
            <div className="bg-zinc-900 text-white rounded-2xl p-4 shadow-md space-y-3 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 bg-sky-500/10 w-24 h-24 rounded-full blur-xl" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                    <Building2 className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold">Import transactions</h4>
                    <p className="text-[9px] text-zinc-400">Import a bank statement or scan a receipt.</p>
                  </div>
                </div>
                <span className="text-[8.5px] bg-emerald-500/20 text-emerald-300 font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono uppercase tracking-wider">
                  CSV or photo
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-extrabold py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 cursor-pointer"
                  title="Upload or paste a bank statement"
                >
                  <Upload className="w-4 h-4 text-white" />
                  <span>Import statement</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingExpense(null);
                    setExpenseModalMode('camera_ocr');
                    setShowExpenseModal(true);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white text-[11px] font-extrabold py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
                  title="Scan or upload a receipt"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Scan receipt</span>
                </button>
              </div>
            </div>

            {/* Human-In-The-Loop AI Review Queue (If exists) */}
            {reviewQueue.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-amber-900">To review</span>
                    <span className="text-[9px] bg-amber-200/70 text-amber-900 font-bold px-1.5 py-0.5 rounded-full font-mono">
                      {reviewQueue.length} pending
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setReviewQueue([])}
                      className="text-[9px] text-zinc-600 hover:text-rose-700 font-bold px-2 py-1 rounded-lg border border-amber-200 hover:bg-rose-50 transition-all cursor-pointer"
                      title="Discard everything waiting for review"
                    >
                      Discard all
                    </button>
                    {reviewQueueDuplicates.length > 0 && (
                      <button
                        onClick={() => handleApproveAllReview(true)}
                        className="text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                        title="Add only new entries and skip duplicates"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>Add new only ({reviewQueue.length - reviewQueueDuplicates.length})</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleApproveAllReview(false)}
                      className="text-[9px] bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg font-bold transition-all shadow-xs cursor-pointer"
                    >
                      Add all ({reviewQueue.length})
                    </button>
                  </div>
                </div>

                {reviewQueueDuplicates.length > 0 && (
                  <div className="bg-amber-100/90 border border-amber-300 rounded-xl p-2.5 text-[10px] text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      <strong>Possible duplicates:</strong> {reviewQueueDuplicates.length} of {reviewQueue.length} items look like entries already in your ledger. Use "Add new only" so they aren't counted twice.
                    </span>
                  </div>
                )}

                <p className="text-[9.5px] text-amber-800 leading-normal">
                  Check the categories, accounts and VAT before adding these to the ledger. AI estimates can be wrong.
                </p>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {reviewQueue.map((item) => {
                    const dupCheck = checkTransactionDuplicate(item, transactions);
                    return (
                      <div 
                        key={item.id} 
                        className={`bg-white border p-2.5 rounded-xl flex items-start gap-2 relative transition-all ${
                          dupCheck.isDuplicate ? 'border-amber-300 ring-1 ring-amber-200' : 'border-amber-150'
                        }`}
                      >
                        <div className="mt-0.5">
                          {item.amount > 0 ? (
                            <span className="p-1 bg-emerald-50 text-emerald-600 rounded-lg block"><ArrowUpRight className="w-3 h-3" /></span>
                          ) : (
                            <span className="p-1 bg-rose-50 text-rose-600 rounded-lg block"><ArrowDownLeft className="w-3 h-3" /></span>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-1">
                            <h5 className="text-[10px] font-bold text-zinc-900 truncate leading-snug">{item.description}</h5>
                            <span className={`text-[10px] font-black font-mono shrink-0 ${
                              item.amount > 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}>
                              {item.amount > 0 ? `+FJD $${item.amount.toFixed(2)}` : `-FJD $${Math.abs(item.amount).toFixed(2)}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[8px] font-mono text-zinc-400">{item.date}</span>
                            <span className="text-[8px] font-semibold bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded uppercase">
                              {item.bankName}
                            </span>
                            <span className="text-[8px] bg-sky-50 text-sky-800 border border-sky-100 font-bold uppercase px-1 rounded">
                              {item.category}
                            </span>
                            {item.vatAmount !== 0 && (
                              <span className="text-[8px] bg-indigo-50 text-indigo-700 font-bold px-1 rounded">
                                VAT: FJD ${item.vatAmount?.toFixed(2)}
                              </span>
                            )}
                            {item.balance !== undefined && (
                              <span className="text-[8px] bg-emerald-50 text-emerald-700 font-mono font-semibold px-1 rounded">
                                Bal: FJD ${item.balance.toFixed(2)}
                              </span>
                            )}
                            {dupCheck.isDuplicate && (
                              <span className="text-[8px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1 py-0.5 rounded flex items-center gap-0.5" title={dupCheck.reason}>
                                Possible duplicate
                              </span>
                            )}
                            <span className="text-[8px] font-bold text-amber-700">
                              {item.confidence}% confidence
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleApproveSingle(item.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all cursor-pointer"
                            title="Add to ledger"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveSingleReview(item.id)}
                            className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                            title="Discard"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Permanent Ledger List with Advanced Filtering */}
            <div className="bg-white border border-zinc-150 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-zinc-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Ledger</h3>
                    <span className="text-[10px] bg-zinc-100 text-zinc-600 font-mono font-bold px-2 py-0.5 rounded-full">
                      {transactions.length} entries
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Duplicate Audit Button */}
                    <button
                      type="button"
                      onClick={() => setShowDuplicateAuditModal(true)}
                      className={`text-[9.5px] font-extrabold px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 border cursor-pointer ${
                        totalDuplicatesCount > 0 
                          ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm' 
                          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                      }`}
                      title="Find and remove duplicate entries"
                    >
                      <AlertTriangle className={`w-3.5 h-3.5 ${totalDuplicatesCount > 0 ? 'text-white' : 'text-amber-600'}`} />
                      <span>Duplicates</span>
                      {totalDuplicatesCount > 0 && (
                        <span className="bg-white text-amber-700 font-black px-1.5 py-0.2 rounded-full text-[8.5px] font-mono">
                          {totalDuplicatesCount}
                        </span>
                      )}
                    </button>

                    {/* History & Undo Button */}
                    <button
                      type="button"
                      onClick={() => setShowHistoryModal(true)}
                      className="text-[9.5px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 font-extrabold px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      title="See restore points and undo changes"
                    >
                      <History className="w-3.5 h-3.5 text-zinc-600" />
                      <span>History</span>
                    </button>

                    {/* Manual Log Button */}
                    <button
                      type="button"
                      onClick={() => setShowAddManual(!showAddManual)}
                      className="text-[9.5px] bg-zinc-900 hover:bg-zinc-850 text-white font-extrabold px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add entry</span>
                    </button>
                  </div>
                </div>

                {/* Duplicate Alert Banner when duplicates exist in the ledger */}
                {totalDuplicatesCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-950 animate-fade-in shadow-xs">
                    <div className="flex items-start sm:items-center gap-2.5">
                      <div className="p-1.5 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <span className="font-black text-amber-950 block text-xs">Possible duplicates</span>
                        <p className="text-[10px] text-amber-800 leading-snug">
                          <strong>{totalDuplicatesCount} transaction{totalDuplicatesCount > 1 ? 's' : ''}</strong> may have been imported twice, which would count income or expenses twice.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowDuplicateAuditModal(true)}
                        className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Review ({totalDuplicatesCount})</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Manual Log Inputs collapsible */}
                {showAddManual && (
                  <form onSubmit={handleAddManualTransaction} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-3 text-zinc-800 animate-fade-in">
                    <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider block">Add ledger entry</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <DateInput
                        label="Date"
                        required
                        value={manualDate}
                        onChange={setManualDate}
                        placeholder="Select date"
                        inputClassName="bg-white py-1.5"
                        customPresets={[
                          { label: 'Today', special: 'today' },
                          { label: 'Yesterday', daysOffset: -1 },
                        ]}
                      />
                      <div className="space-y-1 min-w-0">
                        <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Type</label>
                        <div className="grid grid-cols-2 gap-1 bg-zinc-200 p-0.5 rounded-lg text-center font-bold">
                          <button
                            type="button"
                            onClick={() => setManualType('income')}
                            className={`py-1 text-[9px] rounded-md transition-all ${manualType === 'income' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500'}`}
                          >
                            Income
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualType('expense')}
                            className={`py-1 text-[9px] rounded-md transition-all ${manualType === 'expense' ? 'bg-white text-rose-600 shadow-xs' : 'text-zinc-500'}`}
                          >
                            Expense
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Description</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Suva Stationery"
                          value={manualDesc}
                          onChange={(e) => setManualDesc(e.target.value)}
                          className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Amount (FJD)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={manualAmount}
                          onChange={(e) => setManualAmount(e.target.value)}
                          className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Category</label>
                          <button
                            type="button"
                            onClick={handleSuggestForManualLog}
                            disabled={isManualAiLoading || !manualDesc.trim()}
                            className="text-[8px] font-extrabold text-amber-700 hover:text-amber-900 flex items-center gap-0.5 cursor-pointer disabled:opacity-40"
                          >
                            <Sparkles className={`w-2.5 h-2.5 ${isManualAiLoading ? 'animate-spin' : ''}`} />
                            <span>Suggest</span>
                          </button>
                        </div>
                        <select
                          value={manualCategory}
                          onChange={(e) => setManualCategory(e.target.value)}
                          className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                        >
                          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Account</label>
                        <select
                          value={manualBank}
                          onChange={(e) => setManualBank(e.target.value)}
                          className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                        >
                          <option value="BSP Fiji">BSP Fiji</option>
                          <option value="ANZ Fiji">ANZ Fiji</option>
                          <option value="Westpac Fiji">Westpac Fiji</option>
                          <option value="M-Paisa">M-PAiSA</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddManual(false)}
                        className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-[10px] font-bold px-3 py-1.5 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-zinc-900 hover:bg-zinc-850 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg"
                      >
                        Add entry
                      </button>
                    </div>
                  </form>
                )}

                {/* Filter and Search Bar */}
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-zinc-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search description, bank or category"
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-1.5 pl-9 pr-4 text-[11px] text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:bg-white"
                    />
                  </div>

                  {/* Horizontal pill filters */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 text-[9px] font-bold scrollbar-none">
                    <div className="flex items-center gap-1 shrink-0 bg-zinc-100 px-2 py-1 rounded-lg">
                      <Filter className="w-2.5 h-2.5 text-zinc-500" />
                      <span className="text-zinc-500">Filters:</span>
                    </div>

                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="bg-zinc-100 hover:bg-zinc-200 border-none rounded-lg px-2 py-1 text-zinc-700 font-bold outline-none cursor-pointer"
                    >
                      <option value="all">All types</option>
                      <option value="income">Income</option>
                      <option value="expense">Expenses</option>
                    </select>

                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-zinc-100 hover:bg-zinc-200 border-none rounded-lg px-2 py-1 text-zinc-700 font-bold outline-none cursor-pointer max-w-[120px]"
                    >
                      <option value="all">All categories</option>
                      {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select
                      value={bankFilter}
                      onChange={(e) => setBankFilter(e.target.value)}
                      className="bg-zinc-100 hover:bg-zinc-200 border-none rounded-lg px-2 py-1 text-zinc-700 font-bold outline-none cursor-pointer"
                    >
                      <option value="all">All accounts</option>
                      <option value="BSP Fiji">BSP Fiji</option>
                      <option value="ANZ Fiji">ANZ Fiji</option>
                      <option value="Westpac Fiji">Westpac Fiji</option>
                      <option value="M-Paisa">M-PAiSA</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Transactions List */}
              <div className="max-h-[350px] overflow-y-auto divide-y divide-zinc-100">
                {filteredLedger.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400">
                    <LANDMARK_DECORATOR />
                    <p className="text-[10px] font-bold uppercase tracking-wider mt-2">No transactions</p>
                    <p className="text-[8.5px] max-w-[200px] mx-auto leading-normal mt-0.5">Import a statement or tap Add entry above.</p>
                  </div>
                ) : (
                  filteredLedger.map((tx) => (
                    <div 
                      key={tx.id} 
                      className={`p-3.5 flex items-start gap-3 hover:bg-zinc-50 transition-all group ${
                        tx.status === 'pending' ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <button
                        onClick={() => handleToggleReconciliation(tx.id)}
                        className={`mt-0.5 p-1 rounded-lg border transition-all shrink-0 ${
                          tx.status === 'reconciled'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                            : 'bg-white border-zinc-200 text-zinc-300 hover:text-zinc-500'
                        }`}
                        title={tx.status === 'reconciled' ? 'Mark as pending' : 'Mark as reconciled'}
                      >
                        <Check className="w-3 h-3" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                          <span className="text-[10.5px] font-bold text-zinc-800 line-clamp-2 leading-tight">
                            {tx.description}
                          </span>
                          <span className={`text-[11px] font-black font-mono shrink-0 ${
                            tx.amount > 0 ? 'text-emerald-600' : 'text-zinc-900'
                          }`}>
                            {tx.amount > 0 ? '+' : ''}FJD ${tx.amount.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[8px] font-mono text-zinc-400">{tx.date}</span>
                          <span className="text-[8px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-extrabold uppercase tracking-tight">
                            {tx.bankName}
                          </span>
                          <span className="text-[8px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-extrabold uppercase tracking-tight">
                            {tx.category}
                          </span>
                          {tx.vatAmount !== 0 && (
                            <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1 rounded font-bold">
                              VAT: ${(tx.vatAmount || 0).toFixed(2)}
                            </span>
                          )}
                          {tx.balance !== undefined && (
                            <span className="text-[8px] bg-emerald-50 text-emerald-700 px-1 rounded font-mono font-semibold">
                              Bal: ${(tx.balance || 0).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteTransaction(tx.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all shrink-0 self-center"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="rates-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Products & Services Catalog Section */}
            <div className="bg-white border border-zinc-150 rounded-2xl p-4 shadow-sm space-y-3.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-4.5 h-4.5 text-zinc-700" />
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">Services and products</h3>
                </div>
                <button
                  onClick={handleOpenAddService}
                  className="text-[9.5px] bg-zinc-900 hover:bg-zinc-850 text-white font-extrabold px-2 py-1 rounded-lg flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add item
                </button>
              </div>

              <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                {data.services.length === 0 ? (
                  <p className="text-center text-[10px] text-zinc-400 py-6">No services yet. Add one to use it on quotes and invoices.</p>
                ) : (
                  data.services.map((srv) => (
                    <div key={srv.id} className="p-2.5 bg-zinc-50 border border-zinc-150/70 rounded-xl flex justify-between items-center group">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-[10.5px] font-extrabold text-zinc-900 truncate leading-snug">{srv.name}</h4>
                          <span className={`text-[7.5px] font-black uppercase px-1 rounded-md tracking-tight ${
                            srv.type === 'saas' ? 'bg-indigo-100 text-indigo-800' : 'bg-zinc-200 text-zinc-800'
                          }`}>
                            {srv.type || 'service'}
                          </span>
                        </div>
                        <p className="text-[9.5px] text-zinc-400 truncate mt-0.5">{srv.description}</p>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10.5px] font-black text-zinc-800 font-mono">
                          FJD ${srv.rate}/{srv.unit === 'Hour' ? 'hr' : srv.unit === 'Flat Fee' ? 'flat' : srv.unit}
                        </span>
                        
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => handleOpenEditService(srv)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-150"
                            title="Edit"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteService(srv.id)}
                            className="p-1 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Dynamic Rate Modifiers Builder Section */}
            <div className="bg-white border border-zinc-150 rounded-2xl p-4 shadow-sm space-y-3.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Percent className="w-4.5 h-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider font-sans">Rate rules</h3>
                </div>
                <button
                  onClick={() => setShowAddRule(!showAddRule)}
                  className="text-[9.5px] bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-2 py-1 rounded-lg flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add rule
                </button>
              </div>

              {/* Form to add custom RateRule */}
              {showAddRule && (
                <form onSubmit={handleAddRateRule} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-3 text-zinc-800 animate-fade-in">
                  <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider block">New rate rule</span>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Night shift"
                        value={ruleName}
                        onChange={(e) => setRuleName(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Applies to</label>
                      <select
                        value={ruleApplies}
                        onChange={(e) => setRuleApplies(e.target.value as any)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                      >
                        <option value="weekend">Weekends</option>
                        <option value="rush">Rush jobs</option>
                        <option value="after-hours">After hours</option>
                        <option value="all">All work</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Type</label>
                      <select
                        value={ruleType}
                        onChange={(e) => {
                          setRuleType(e.target.value as any);
                          if (e.target.value === 'multiplier') {
                            setRuleUnit('multiplier');
                            setRuleValue(1.5);
                          } else {
                            setRuleUnit('flat');
                            setRuleValue(50);
                          }
                        }}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                      >
                        <option value="multiplier">Multiplier (e.g. 1.5x)</option>
                        <option value="surcharge">Surcharge</option>
                        <option value="discount">Discount</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Value</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={ruleValue}
                        onChange={(e) => setRuleValue(Number(e.target.value))}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Unit</label>
                      <select
                        value={ruleUnit}
                        onChange={(e) => setRuleUnit(e.target.value as any)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                      >
                        {ruleType === 'multiplier' ? (
                          <option value="multiplier">Multiplier (x)</option>
                        ) : (
                          <>
                            <option value="flat">Fixed amount (FJD)</option>
                            <option value="percent">Percentage (%)</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Weekend rates apply"
                        value={ruleDesc}
                        onChange={(e) => setRuleDesc(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddRule(false)}
                      className="bg-zinc-200 text-zinc-700 text-[10px] font-bold px-3 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg animate-pulse"
                    >
                      Save rule
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2.5">
                {rateRules.map((rule) => (
                  <div key={rule.id} className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl flex items-center justify-between group">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="p-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
                          {rule.type === 'multiplier' ? '✖' : rule.type === 'surcharge' ? '➕' : '➖'}
                        </span>
                        <h4 className="text-[10.5px] font-black text-zinc-800 truncate leading-snug">{rule.name}</h4>
                        <span className="text-[7.5px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-1 rounded">
                          {rule.appliesTo}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-zinc-400 mt-1 leading-normal">{rule.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono font-black text-zinc-900">
                        {rule.type === 'multiplier' 
                          ? `${rule.value}x` 
                          : `${rule.value > 0 ? '+' : ''}FJD $${Math.abs(rule.value).toFixed(2)}${rule.unit === 'percent' ? '%' : ''}`
                        }
                      </span>
                      
                      <button
                        onClick={() => handleToggleRuleActive(rule.id)}
                        className={`text-[8.5px] font-extrabold px-2 py-1 rounded-lg transition-all ${
                          rule.isActive 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-zinc-200 text-zinc-500'
                        }`}
                      >
                        {rule.isActive ? 'On' : 'Off'}
                      </button>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-600 rounded transition-all"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* International Working Currencies & FX Rates Card */}
            <div className="bg-white border border-zinc-150 rounded-2xl p-4 shadow-sm space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase text-zinc-900 tracking-wider">
                      Currencies and exchange rates
                    </h3>
                    <p className="text-[9.5px] text-zinc-500">
                      For <span className="font-bold text-zinc-700">{activeBiz?.name}</span> (base currency: <span className="font-mono font-bold text-emerald-700">{activeBiz?.currency || 'FJD'}</span>)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFxCalcModal(true)}
                    className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Currency converter</span>
                  </button>
                  {onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('settings')}
                      className="text-[10px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
                      title="Change currencies in Settings"
                    >
                      Settings
                    </button>
                  )}
                </div>
              </div>

              {/* Working Currencies Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-1">
                {(activeBiz?.workingCurrencies || ['FJD', 'AUD', 'NZD', 'USD', 'EUR']).map((curCode) => {
                  const cfg = getCurrencyConfig(curCode);
                  const isBase = curCode === (activeBiz?.currency || 'FJD');
                  const customRate = activeBiz?.customExchangeRates?.[curCode];
                  const rate = customRate || cfg.approxFjdMultiplier || 1.0;

                  return (
                    <div
                      key={curCode}
                      className={`p-2.5 rounded-xl border transition-all ${
                        isBase 
                          ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' 
                          : 'bg-zinc-50 border-zinc-200/80 text-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base">{cfg.flag}</span>
                        <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.2 rounded ${
                          isBase ? 'bg-emerald-200 text-emerald-900 font-mono' : 'bg-zinc-200 text-zinc-700 font-mono'
                        }`}>
                          {curCode}
                        </span>
                      </div>
                      <p className="text-[10.5px] font-bold mt-1 truncate">{cfg.name}</p>
                      <div className="mt-1 flex items-baseline justify-between text-[9px]">
                        <span className="text-zinc-500 font-medium">{isBase ? 'Base' : '1 ' + curCode + ' ='}</span>
                        <span className="font-mono font-black text-zinc-900">
                          {isBase ? '1.0000' : `${rate.toFixed(3)} ${activeBiz?.currency || 'FJD'}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Dynamic Rate Playground Simulator */}
            <div className="bg-indigo-950 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden space-y-4">
              <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-800 text-sky-400 rounded-xl">
                  <Calculator className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">Rate calculator</h4>
                  <p className="text-[9px] text-zinc-300">See what a service costs with your rate rules applied.</p>
                </div>
              </div>

              {/* Selector */}
              <div className="space-y-3 pt-1 text-zinc-800">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-indigo-300 tracking-wider block">1. Service</label>
                  <select
                    value={selectedPlaygroundSrv}
                    onChange={(e) => setSelectedPlaygroundSrv(e.target.value)}
                    className="w-full bg-white border border-indigo-900 rounded-xl p-2 text-xs font-bold text-zinc-800 focus:outline-none"
                  >
                    {data.services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (FJD ${s.rate}/{s.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedService?.unit === 'Hour' && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[8px] font-black uppercase text-indigo-300 tracking-wider">2. Hours</label>
                      <span className="text-[10px] text-sky-400 font-mono font-bold">{playgroundHours} hrs</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="120"
                      value={playgroundHours}
                      onChange={(e) => setPlaygroundHours(Number(e.target.value))}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>
                )}

                {/* Modifiers checklist inside sandbox */}
                <div className="space-y-1 text-white">
                  <label className="text-[8px] font-black uppercase text-indigo-300 tracking-wider block">3. Rate rules</label>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {rateRules.map((rule) => {
                      const isRuleChecked = activePlaygroundRules.includes(rule.id) && rule.isActive;
                      return (
                        <button
                          key={rule.id}
                          type="button"
                          onClick={() => {
                            if (activePlaygroundRules.includes(rule.id)) {
                              setActivePlaygroundRules(prev => prev.filter(rid => rid !== rule.id));
                            } else {
                              setActivePlaygroundRules(prev => [...prev, rule.id]);
                            }
                          }}
                          className={`p-2 rounded-xl text-[9.5px] font-extrabold text-left transition-all border flex items-center justify-between ${
                            isRuleChecked 
                              ? 'bg-indigo-900/80 border-sky-400 text-white shadow-xs' 
                              : 'bg-indigo-950/40 border-indigo-900 text-zinc-400 hover:text-zinc-300'
                          }`}
                        >
                          <span className="truncate pr-1">{rule.name}</span>
                          <span className="font-mono text-[9px] text-sky-400">
                            {rule.type === 'multiplier' ? `${rule.value}x` : `${rule.value > 0 ? '+' : '-'}${Math.abs(rule.value)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Dynamic Rate Receipt Render */}
              <div className="bg-indigo-950/60 border border-indigo-900 rounded-2xl p-4 space-y-3 font-mono">
                <div className="flex justify-between items-center border-b border-indigo-900 pb-1.5">
                  <span className="text-[8px] font-extrabold text-indigo-300 uppercase tracking-widest">Breakdown</span>
                  <span className="text-[8px] bg-indigo-900 text-sky-400 px-1.5 py-0.5 rounded font-bold uppercase">Estimate</span>
                </div>

                <div className="space-y-1 text-zinc-300 text-[10px] leading-relaxed">
                  {ratePlaygroundResults.breakdownSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <ChevronRight className="w-3 h-3 text-sky-400 shrink-0" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-indigo-900 pt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Rate per unit</span>
                    <span>FJD ${ratePlaygroundResults.finalRatePerUnit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-indigo-300">
                    <span>VAT included ({data.userProfile.defaultVatRate ?? 12.5}%)</span>
                    <span>FJD ${ratePlaygroundResults.vatAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white font-black text-sm pt-1 border-t border-dashed border-indigo-900/50">
                    <span className="font-display">Total to client</span>
                    <span className="font-mono text-sky-400">FJD ${ratePlaygroundResults.rawTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload/Pasted text statement modal */}
      <BankStatementImportModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        existingTransactions={transactions}
        onImport={(importedTransactions) => {
          setReviewQueue(prev => [...prev, ...importedTransactions]);
          setShowUploadModal(false);
          triggerUndoToast(
            '',
            'Statement imported',
            `${importedTransactions.length} rows are waiting for review.`
          );
        }}
        defaultVatRate={data.userProfile.defaultVatRate ?? 12.5}
        categoryOptions={categoryOptions}
      />

      {/* Duplicate Transactions Audit & Clean Modal */}
      <DuplicateAuditModal
        isOpen={showDuplicateAuditModal}
        onClose={() => setShowDuplicateAuditModal(false)}
        transactions={transactions}
        onResolveDuplicates={handleResolveDuplicates}
      />

      {/* Ledger History & Rollback / Undo Modal */}
      <LedgerHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        userEmail={userEmail}
        currentTransactions={transactions}
        onRollback={handleRollbackState}
      />

      {/* Floating Undo Notification Toast */}
      {undoToast && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-up">
          <div className="bg-zinc-950 text-white rounded-2xl p-3.5 shadow-2xl border border-zinc-800 flex items-center gap-3 max-w-md">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h5 className="text-xs font-bold text-white truncate">{undoToast.title}</h5>
              <p className="text-[10.5px] text-zinc-400 leading-snug mt-0.5">{undoToast.message}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {undoToast.pointId && (
                <button
                  type="button"
                  onClick={handleQuickUndo}
                  className="bg-white hover:bg-zinc-100 text-zinc-900 font-extrabold text-[11px] px-3 py-1.5 rounded-xl transition-all active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setUndoToast(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt OCR Capture Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-zinc-100 shadow-2xl overflow-hidden text-zinc-700 animate-slide-up">
            <div className="bg-zinc-950 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide">Scan receipt</h3>
              </div>
              <button 
                onClick={() => setShowReceiptModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-[9.5px] text-zinc-500 leading-normal">
                Take a photo or upload a receipt. AI reads the vendor, date and amount, and works out the {data.userProfile.defaultVatRate ?? 12.5}% VAT (or no VAT for overseas software).
              </p>

              {/* Upload Drop Zone */}
              <label className="border-2 border-dashed border-zinc-200 hover:border-emerald-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-zinc-50 hover:bg-emerald-50/20 group">
                <input 
                  type="file" 
                  accept="image/*,application/pdf,.pdf" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-zinc-800 mt-2">Upload PDF or photo</span>
                <span className="text-[9px] text-zinc-400 mt-0.5">PDF, screenshot, JPEG or PNG, up to 25MB</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Global AI Processing overlay loading screen */}
      {isClassifying && (
        <div className="fixed inset-0 bg-zinc-900/75 backdrop-blur-md flex flex-col items-center justify-center p-6 z-55">
          <div className="bg-zinc-950 text-white p-6 rounded-3xl border border-white/10 max-w-xs text-center space-y-4 shadow-2xl">
            <div className="relative w-12 h-12 mx-auto">
              <div className="absolute inset-0 border-4 border-sky-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-t-sky-400 rounded-full animate-spin" />
            </div>
            
            <div className="space-y-1">
              <span className="text-[8px] font-black uppercase tracking-widest text-sky-400">Working</span>
              <h4 className="text-xs font-bold">{reassuranceMessage}</h4>
              <p className="text-[8.5px] text-zinc-400 leading-normal">AI reads each line, suggests a category and works out the {data.userProfile.defaultVatRate ?? 12.5}% VAT. You can check everything before it goes in the ledger.</p>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Service Catalog Modal */}
      {showAddService && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-zinc-100 shadow-2xl overflow-hidden text-zinc-700">
            <div className="bg-zinc-950 text-white p-4 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wide">
                {editingServiceId ? 'Edit service' : 'Add service'}
              </h3>
              <button onClick={() => setShowAddService(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitService} className="p-4 space-y-3.5">
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-zinc-400 block">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mobile app development"
                  value={srvName}
                  onChange={(e) => setSrvName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-zinc-400 block">Description</label>
                <textarea
                  rows={2}
                  placeholder="What's included"
                  value={srvDesc}
                  onChange={(e) => setSrvDesc(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-zinc-400 block">Rate (FJD)</label>
                  <input
                    type="number"
                    required
                    value={srvRate}
                    onChange={(e) => setSrvRate(Number(e.target.value))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-zinc-400 block">Unit</label>
                  <select
                    value={srvUnit}
                    onChange={(e) => setSrvUnit(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs focus:outline-none"
                  >
                    <option value="Hour">Hour</option>
                    <option value="Day">Day</option>
                    <option value="Flat Fee">Flat fee</option>
                    <option value="Project">Project</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-zinc-400 block">Type</label>
                  <select
                    value={srvType}
                    onChange={(e) => setSrvType(e.target.value as any)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs"
                  >
                    <option value="service">Service</option>
                    <option value="saas">Software subscription</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-zinc-400 block">Billing</label>
                  <select
                    value={srvInterval}
                    onChange={(e) => setSrvInterval(e.target.value as any)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs"
                  >
                    <option value="one-time">One-time</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddService(false)}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 py-2 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-zinc-900 hover:bg-zinc-850 text-white py-2 rounded-xl text-xs font-bold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bula AI Auto Match Result Modal */}
      {showAutoMatchModal && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-zinc-700">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-zinc-100 shadow-2xl overflow-hidden text-zinc-700">
            <div className="bg-zinc-950 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-1.5 font-sans">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide">Auto-match</h3>
              </div>
              <button 
                onClick={() => setShowAutoMatchModal(false)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 text-left font-sans">
              {isAutoMatching ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-3.5">
                  <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
                  <p className="text-xs font-bold text-zinc-500 animate-pulse text-center">
                    Looking for matches…
                  </p>
                </div>
              ) : (
                <div className="space-y-4 text-left">
                  <div className="bg-zinc-950 rounded-xl p-3 font-mono text-[9px] text-sky-400 space-y-1.5 max-h-[220px] overflow-y-auto border border-zinc-800">
                    {autoMatchLogs.map((log, idx) => (
                      <div key={idx} className={
                        log.startsWith('✓') ? 'text-emerald-400 font-bold' : 
                        log.startsWith('⚆') ? 'text-amber-400/95' : 'text-zinc-400'
                      }>
                        {log}
                      </div>
                    ))}
                  </div>

                  {/* Action block */}
                  {autoMatchLogs.some(log => log.includes('✓')) ? (
                    <div className="space-y-2 text-left">
                      <p className="text-[10px] text-zinc-400 leading-normal">
                        These bank transactions match open invoices or subscriptions. Reconciling them marks the matched invoices as paid.
                      </p>
                      <button
                        onClick={handleApproveAllAutoMatches}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Reconcile all matches</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-400 text-center leading-normal">
                      No strong matches found. Open each transaction to match or categorise it yourself.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expense Logging Modal (Camera + Manual Form) */}
      <ExpenseLoggingModal
        isOpen={showExpenseModal}
        onClose={() => {
          setShowExpenseModal(false);
          setEditingExpense(null);
          setExpenseModalMode('manual');
        }}
        data={data}
        onSaveExpense={handleSaveExpense}
        initialExpense={editingExpense}
        initialMode={expenseModalMode}
      />

      {/* AI Financial & P&L Advisor Quick Co-Pilot Modal */}
      <AiFinancialAdvisorModal
        isOpen={showAiFinancialAdvisor}
        onClose={() => setShowAiFinancialAdvisor(false)}
        data={data}
        pnlStats={pnlStatsForAdvisor}
        onOpenFullAssistant={(prompt) => {
          if (onNavigateToTab) {
            onNavigateToTab('assistant');
          }
        }}
      />

      {/* AI Expense Categorization Studio Modal */}
      <AiExpenseCategorizationModal
        isOpen={showAiCategorizerModal}
        onClose={() => setShowAiCategorizerModal(false)}
        data={data}
        onUpdateData={onUpdateData}
        onOpenExpenseModalWithData={(partialExpense) => {
          setEditingExpense(partialExpense as ExpenseRecord);
          setShowExpenseModal(true);
        }}
      />

      {/* Currency Conversion & Exchange Rate Calculator Modal */}
      <ExchangeRateCalculatorModal
        isOpen={showFxCalcModal}
        onClose={() => setShowFxCalcModal(false)}
        homeCurrency={activeBiz?.currency || data.userProfile?.defaultCurrency || 'FJD'}
        defaultTargetCurrency={
          activeBiz?.workingCurrencies?.find(c => c !== (activeBiz?.currency || 'FJD')) || 'AUD'
        }
        defaultAmount={500}
        workingCurrencies={activeBiz?.workingCurrencies || ['FJD', 'AUD', 'NZD', 'USD', 'EUR']}
        customExchangeRates={activeBiz?.customExchangeRates}
        data={data}
        mode="expense"
        onApplyExpenseWithFx={(params) => {
          const newExp: ExpenseRecord = {
            id: 'exp-' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            vendor: '',
            description: `${params.foreignCurrency} expense converted to ${activeBiz?.currency || 'FJD'}`,
            category: 'Software & Subscriptions',
            amount: params.homeAmount,
            vatAmount: 0,
            paymentMethod: 'Credit Card',
            notes: params.notes,
            isTaxDeductible: true,
            isVatClaimable: false,
            originalCurrency: params.foreignCurrency,
            originalAmount: params.foreignAmount,
            exchangeRate: params.exchangeRate,
            businessId: activeBiz?.id
          };
          setEditingExpense(newExp);
          setExpenseModalMode('manual');
          setShowExpenseModal(true);
        }}
      />

    </div>
  );
}

// Visual layout helper components
function LANDMARK_DECORATOR() {
  return (
    <div className="flex justify-center mb-1">
      <Landmark className="w-8 h-8 text-zinc-300 stroke-[1.5]" />
    </div>
  );
}
