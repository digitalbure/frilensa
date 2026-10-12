import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  FileText, Plus, Search, Filter, Calendar, DollarSign, ArrowRight, Check,
  Trash2, X, Share2, Printer, CheckCircle2, RefreshCw, Layers, Sparkles, AlertCircle,
  Waves, Briefcase, Building2, ShieldCheck, Clock, ChevronDown, ChevronUp, Play, Pause,
  TrendingUp, Send, Copy, FileCheck, Sliders, CalendarClock, ArrowUpRight, Globe, QrCode, ExternalLink, Zap,
  Ban, AlertTriangle, Edit3, MessageSquare, ToggleLeft, ToggleRight, RotateCcw, Calculator, Download, Mail, Paperclip
} from 'lucide-react';
import { CRMData, CRMDocument, Client, ProductService, DocumentItem, Business, RecurringInvoice, TaxConfig, FeeConfig, AppliedChargeItem, PlanTier, Transaction, PaymentAttachment } from '../types';
import DateInput from './DateInput';
import OnlineDocumentModal from './OnlineDocumentModal';
import SubscriptionPaywallModal from './SubscriptionPaywallModal';
import { suggestDocumentNumber as suggestNextDocumentNumber } from '../lib/documentNumbers';
import { documentPublicUrl, generateShareToken } from '../lib/documentLinks';
import { applyConfirmedPayment, addReceiptForInvoice, applyPartialPayment } from '../lib/payments';
import { runDueRetainers, generateRetainerNow, retainerVatRate, todayIn } from '../lib/retainers';
import { lineTotals, isReimbursement, reimbursementLines, linkBilledExpenses, recalcDocumentTotals } from '../lib/invoiceTotals';
import { openOwnFile } from '../lib/files';
import RecordPaymentModal from './RecordPaymentModal';
import ExchangeRateCalculatorModal from './ExchangeRateCalculatorModal';
import PdfExportModal from './PdfExportModal';
import PartialPaymentModal from './PartialPaymentModal';
import EmailDocumentModal from './EmailDocumentModal';
import PaymentAttachmentWidget from './PaymentAttachmentWidget';
import { downloadDocumentPdf, numberLabel } from '../lib/pdfGenerator';
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from '../lib/currencies';
import { documentDefaults, paymentTermsDays } from '../lib/documentTerms';
import { depositFor } from '../lib/bookings';
import { tradingAsLine } from '../lib/businessName';

interface BillingViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  selectedDocId?: string | null;
  onClearSelectedDocId?: () => void;
}

export default function BillingView({ data, onUpdateData, selectedDocId, onClearSelectedDocId }: BillingViewProps) {
  // Navigation & Filtering
  const [billingSubTab, setBillingSubTab] = useState<'documents' | 'retainers'>('documents');
  const [filterType, setFilterType] = useState<'all' | 'quote' | 'invoice' | 'receipt' | 'credit_note'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openStatusMenuDocId, setOpenStatusMenuDocId] = useState<string | null>(null);
  const [partialModalDoc, setPartialModalDoc] = useState<CRMDocument | null>(null);

  // Retainers subtab filtering & search
  const [retainerFilterStatus, setRetainerFilterStatus] = useState<'all' | 'active' | 'paused'>('all');
  const [retainerSearch, setRetainerSearch] = useState('');
  const [expandedRetainerId, setExpandedRetainerId] = useState<string | null>(null);

  // Recurring Retainer Editor State
  const [showRetainerEditor, setShowRetainerEditor] = useState(false);
  const [editingRetainer, setEditingRetainer] = useState<RecurringInvoice | null>(null);
  const [retClientId, setRetClientId] = useState('');
  const [retBusinessId, setRetBusinessId] = useState(data.activeBusinessId);
  const [retProjectId, setRetProjectId] = useState('');
  const [retProjectName, setRetProjectName] = useState('');
  const [retInterval, setRetInterval] = useState<'monthly' | 'quarterly' | 'bi-weekly' | 'annual'>('monthly');
  const [retBillingDay, setRetBillingDay] = useState(1);
  const [retPaymentTermsDays, setRetPaymentTermsDays] = useState(14);
  const [retAutoSendMode, setRetAutoSendMode] = useState<'draft' | 'sent'>('sent');
  const [retAutoGenerate, setRetAutoGenerate] = useState(true);
  const [retNotes, setRetNotes] = useState('Monthly retainer for ongoing consulting and maintenance.');
  const [retStartDate, setRetStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [retEndDate, setRetEndDate] = useState('');
  const [retStatus, setRetStatus] = useState<'active' | 'paused'>('active');
  const [retItems, setRetItems] = useState<DocumentItem[]>([]);
  const [autoGenNotification, setAutoGenNotification] = useState<string | null>(null);

  // Retainer item builder inputs
  const [retSelectedCatalogItemId, setRetSelectedCatalogItemId] = useState('');
  const [retItemName, setRetItemName] = useState('');
  const [retItemQty, setRetItemQty] = useState(1);
  const [retItemRate, setRetItemRate] = useState(0);

  // Document Creator/Editor modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingDoc, setEditingDoc] = useState<CRMDocument | null>(null);

  // Document Cancellation Modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [docToCancel, setDocToCancel] = useState<CRMDocument | null>(null);
  const [cancelReason, setCancelReason] = useState('Client cancelled the order');
  const [cancelNotes, setCancelNotes] = useState('');
  const [generateCreditNote, setGenerateCreditNote] = useState(true);

  // Toast / Share status feedback
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Document Viewer modal state
  const [selectedDoc, setSelectedDoc] = useState<CRMDocument | null>(null);
  const [showOnlineDocModal, setShowOnlineDocModal] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);

  // Creator Form States
  const [docType, setDocType] = useState<'quote' | 'invoice' | 'receipt' | 'credit_note'>('invoice');
  const [docNumber, setDocNumber] = useState('');
  const [clientId, setClientId] = useState('');
  const [docProjectId, setDocProjectId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [showExpensePicker, setShowExpensePicker] = useState(false);
  const [pickedExpenseIds, setPickedExpenseIds] = useState<string[]>([]);
  const [expenseMarkup, setExpenseMarkup] = useState(0);
  const [expenseChargeVat, setExpenseChargeVat] = useState(false);
  const [notes, setNotes] = useState('Vinaka vakalevu for your business!');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [docStatus, setDocStatus] = useState<'draft' | 'sent' | 'paid' | 'cancelled' | 'accepted'>('draft');

  // Tax Component ON / OFF Toggle
  const [isTaxExempt, setIsTaxExempt] = useState(false);

  // New Item Temporary Input in Document Builder
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemRate, setItemRate] = useState(0);
  const [customItemName, setCustomItemName] = useState('');

  // Dynamic Taxes and Fees selection in Document Creator
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>([]);
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [showTaxFeeDetails, setShowTaxFeeDetails] = useState(true);

  // Multi-Currency States
  const [docCurrency, setDocCurrency] = useState<string>(data.userProfile.defaultCurrency || 'FJD');
  const [retCurrency, setRetCurrency] = useState<string>(data.userProfile.defaultCurrency || 'FJD');
  const [paymentModalDoc, setPaymentModalDoc] = useState<CRMDocument | null>(null);
  const [pdfModalDoc, setPdfModalDoc] = useState<CRMDocument | null>(null);
  const [emailModalDoc, setEmailModalDoc] = useState<CRMDocument | null>(null);
  const [showFxCalculator, setShowFxCalculator] = useState<boolean>(false);

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const docBusiness = selectedDoc ? (data.businesses.find(b => b.id === selectedDoc.businessId) || activeBusiness) : null;

  // Intercept selection from Dashboard quick links
  useEffect(() => {
    if (selectedDocId) {
      if (selectedDocId === 'NEW_QUOTE') {
        handleNewDocument('quote');
      } else if (selectedDocId === 'NEW_INVOICE') {
        handleNewDocument('invoice');
      } else if (selectedDocId === 'NEW_RECEIPT') {
        handleNewDocument('receipt');
      } else if (selectedDocId === 'NEW_RETAINER') {
        setBillingSubTab('retainers');
        handleNewRetainer();
      } else if (selectedDocId === 'VIEW_RETAINERS') {
        setBillingSubTab('retainers');
      } else if (selectedDocId === 'FX_CALCULATOR' || selectedDocId === 'EXCHANGE_CALCULATOR') {
        setShowFxCalculator(true);
      } else if (selectedDocId.startsWith('NEW_INVOICE_FOR_PROJECT_')) {
        // Checked before NEW_INVOICE_FOR_, which would otherwise read the project id as a client id.
        const targetProjId = selectedDocId.replace('NEW_INVOICE_FOR_PROJECT_', '');
        const proj = (data.projects || []).find(p => p.id === targetProjId);
        if (proj) {
          handleNewDocument('invoice', proj.clientId || '', proj.id);
        }
      } else if (selectedDocId.startsWith('NEW_INVOICE_FOR_')) {
        const targetClientId = selectedDocId.replace('NEW_INVOICE_FOR_', '');
        handleNewDocument('invoice', targetClientId);
      } else if (selectedDocId.startsWith('NEW_QUOTE_FOR_PROJECT_')) {
        const targetProjId = selectedDocId.replace('NEW_QUOTE_FOR_PROJECT_', '');
        const proj = (data.projects || []).find(p => p.id === targetProjId);
        if (proj) {
          handleNewDocument('quote', proj.clientId || '', proj.id);
        }
      } else {
        // Find existing document
        const doc = data.documents.find(d => d.id === selectedDocId);
        if (doc) {
          setSelectedDoc(doc);
        }
      }
      // Clear parent trigger state
      onClearSelectedDocId?.();
    }
  }, [selectedDocId]);

  // Handle document auto-number helper
  const suggestDocumentNumber = (type: 'quote' | 'invoice' | 'receipt', targetBusinessId?: string) =>
    suggestNextDocumentNumber(data, type, targetBusinessId || activeBusiness?.id);

  const handleNewDocument = (type: 'quote' | 'invoice' | 'receipt' | 'credit_note', forcedClientId: string = '', forcedProjectId: string = '') => {
    setEditingDoc(null);
    setShowExpensePicker(false);
    setPickedExpenseIds([]);
    setExpenseMarkup(0);
    setExpenseChargeVat(false);
    setDocType(type);
    setDocNumber(suggestDocumentNumber(type === 'credit_note' ? 'invoice' : type).replace(/^INV-|^QT-|^REC-/, type === 'credit_note' ? 'CN-' : '$&'));
    const targetClientId = forcedClientId || (data.clients[0]?.id || '');
    setClientId(targetClientId);
    setDocProjectId(forcedProjectId);
    
    // Resolve currency from project or client or fallback to home currency
    const clientObj = data.clients.find(c => c.id === targetClientId);
    const projObj = data.projects?.find(p => p.id === forcedProjectId);
    setDocCurrency(projObj?.currency || clientObj?.currency || data.userProfile.defaultCurrency || 'FJD');

    const today = new Date().toISOString().split('T')[0];
    const defaults = documentDefaults(activeBusiness, type === 'quote' ? 'quote' : 'invoice', today);
    setIssueDate(today);
    setDueDate(defaults.dueDate);
    setItems([]);
    setNotes(
      type === 'receipt' ? 'Payment received. Vinaka vakalevu.' :
      type === 'credit_note' ? 'Credit note against the original invoice.' :
      defaults.notes
    );
    setPaymentMethod('Bank Transfer');
    setDocStatus(type === 'receipt' || type === 'credit_note' ? 'paid' : 'draft');
    setIsTaxExempt(data.userProfile.enableTax === false);
    
    // Reset item picker
    setSelectedCatalogItemId('');
    setItemQty(1);
    setItemRate(0);
    setCustomItemName('');

    // Pre-select active default platform & business taxes
    const defaultTaxIds = [
      ...(data.platformTaxes || []).filter(t => t.isActive && t.isDefault).map(t => t.id),
      ...(data.businessTaxes || []).filter(t => t.isActive && t.isDefault && (!t.businessId || t.businessId === data.activeBusinessId)).map(t => t.id)
    ];
    setSelectedTaxIds(defaultTaxIds.length > 0 ? defaultTaxIds : ['ptax-1']);

    // Pre-select active default platform & business fees
    const defaultFeeIds = [
      ...(data.platformFees || []).filter(f => f.isActive && f.isDefault).map(f => f.id),
      ...(data.businessFees || []).filter(f => f.isActive && f.isDefault && (!f.businessId || f.businessId === data.activeBusinessId)).map(f => f.id)
    ];
    setSelectedFeeIds(defaultFeeIds);

    setShowEditor(true);
  };

  // Populate editor with existing document (Full Document Editing)
  const handleEditDocument = (doc: CRMDocument) => {
    setEditingDoc(doc);
    setShowExpensePicker(false);
    setPickedExpenseIds([]);
    setExpenseMarkup(0);
    setExpenseChargeVat(false);
    setDocType(doc.type);
    setDocNumber(doc.documentNumber);
    setClientId(doc.clientId);
    setDocProjectId(doc.projectId || '');
    
    // Resolve project/client currency if doc doesn't have one explicitly set
    const linkedProj = doc.projectId ? (data.projects || []).find(p => p.id === doc.projectId) : undefined;
    const linkedClient = doc.clientId ? data.clients.find(c => c.id === doc.clientId) : undefined;
    const resolvedCur = doc.currency || linkedProj?.currency || linkedClient?.currency || data.userProfile.defaultCurrency || 'FJD';
    setDocCurrency(resolvedCur);
    setIssueDate(doc.issueDate);
    setDueDate(doc.dueDate || '');
    setItems(doc.items.map(it => ({ ...it })));
    setNotes(doc.notes || '');
    setPaymentMethod(doc.paymentMethod || 'Bank Transfer');
    setDocStatus(doc.status);
    setIsTaxExempt(doc.isTaxExempt || data.userProfile.enableTax === false);

    if (doc.appliedTaxes && doc.appliedTaxes.length > 0) {
      setSelectedTaxIds(doc.appliedTaxes.map(t => t.id));
    } else {
      setSelectedTaxIds(['ptax-1']);
    }

    if (doc.appliedFees && doc.appliedFees.length > 0) {
      setSelectedFeeIds(doc.appliedFees.map(f => f.id));
    } else {
      setSelectedFeeIds([]);
    }
    
    setSelectedDoc(null);
    setShowEditor(true);
  };

  // Inline updater for existing items
  const handleUpdateItemLine = (lineId: string, field: 'name' | 'quantity' | 'rate', value: any) => {
    setItems(items.map(it => {
      if (it.id === lineId) {
        const updated = { ...it, [field]: value };
        const q = field === 'quantity' ? Math.max(0, Number(value) || 0) : it.quantity;
        const r = field === 'rate' ? Math.max(0, Number(value) || 0) : it.rate;
        updated.total = q * r;
        return updated;
      }
      return it;
    }));
  };

  // Convert Quote -> Invoice or Invoice -> Receipt
  const handleQuickConvert = (doc: CRMDocument) => {
    if (doc.type === 'quote') {
      // Convert to a draft invoice with its own number and "view online" link, the business's
      // payment terms, and none of the quote's acceptance or payment history.
      const today = new Date().toISOString().split('T')[0];
      const business = data.businesses.find(b => b.id === doc.businessId) || activeBusiness;
      const defaults = documentDefaults(business, 'invoice', today);
      const now = new Date().toISOString();
      // Deposits already invoiced for this quote come off the final invoice.
      const deposits = data.documents.filter(d => d.type === 'invoice' && d.isDeposit && d.sourceQuoteId === doc.id && d.status !== 'cancelled');
      const finalItems = [...doc.items, ...deposits.map((dep, i) => ({
        id: `item-less-deposit-${Date.now()}-${i}`, name: `Less deposit (invoice #${dep.documentNumber})`, description: '',
        quantity: 1, rate: -dep.subtotal, total: -dep.subtotal
      }))];
      const finalTotals = deposits.length
        ? recalcDocumentTotals(doc, finalItems, data.userProfile.enableTax === false)
        : { items: doc.items, subtotal: doc.subtotal, vatRate: doc.vatRate, vatAmount: doc.vatAmount, appliedTaxes: doc.appliedTaxes, appliedFees: doc.appliedFees, taxTotal: doc.taxTotal, feeTotal: doc.feeTotal, total: doc.total };
      const newInv: CRMDocument = {
        isTaxExempt: doc.isTaxExempt,
        id: `doc-${Date.now()}`,
        type: 'invoice',
        documentNumber: suggestDocumentNumber('invoice', doc.businessId),
        businessId: doc.businessId,
        clientId: doc.clientId,
        projectId: doc.projectId,
        currency: doc.currency,
        issueDate: today,
        dueDate: defaults.dueDate,
        ...finalTotals,
        status: 'draft',
        notes: `${defaults.notes}\nFor quote #${doc.documentNumber}.${deposits.length ? ` Less the deposit${deposits.length > 1 ? 's' : ''} already invoiced.` : ''}`,
        paymentMethod: doc.paymentMethod,
        industrySector: doc.industrySector,
        jobRefLabel: doc.jobRefLabel, jobRefValue: doc.jobRefValue,
        secondaryRefLabel: doc.secondaryRefLabel, secondaryRefValue: doc.secondaryRefValue,
        customJobFields: doc.customJobFields,
        sourceQuoteId: doc.id,
        shareToken: generateShareToken(),
        updatedAt: now
      };
      Object.keys(newInv).forEach(k => (newInv as any)[k] === undefined && delete (newInv as any)[k]);

      onUpdateData({
        ...data,
        documents: [newInv, ...data.documents]
      });
      setSelectedDoc(newInv);
    } else if (doc.type === 'invoice') {
      // Convert to Receipt (shared builder: own number, own share link, linked to this invoice)
      const paidInvoiceData: CRMData = {
        ...data,
        documents: data.documents.map(d => d.id === doc.id ? { ...d, status: 'paid' as const, updatedAt: new Date().toISOString() } : d)
      };
      const { data: next, receipt } = addReceiptForInvoice(paidInvoiceData, doc.id, { paymentMethod: doc.paymentMethod });
      onUpdateData(next);
      if (receipt) setSelectedDoc(receipt);
    }
  };

  // A deposit invoice for a quote, from the business's (or services') deposit rules.
  const depositAmount = (quote: CRMDocument) => {
    const business = data.businesses.find(b => b.id === quote.businessId) || activeBusiness;
    return quote.type === 'quote' ? depositFor(business?.booking, quote.items) : null;
  };
  const handleCreateDepositInvoice = (quote: CRMDocument) => {
    const deposit = depositAmount(quote);
    if (!deposit) return;
    const business = data.businesses.find(b => b.id === quote.businessId) || activeBusiness;
    const today = new Date().toISOString().split('T')[0];
    const defaults = documentDefaults(business, 'invoice', today);
    const pct = quote.subtotal > 0 ? Math.round(deposit / quote.subtotal * 1000) / 10 : 0;
    const items = [{ id: `item-deposit-${Date.now()}`, name: `Deposit for quote #${quote.documentNumber}`, description: `${pct}% of ${quote.currency || data.userProfile.defaultCurrency || 'FJD'} ${quote.subtotal.toFixed(2)} before VAT`, quantity: 1, rate: deposit, total: deposit }];
    const totals = recalcDocumentTotals({ ...quote, appliedFees: undefined }, items, data.userProfile.enableTax === false);
    const inv: CRMDocument = {
      id: `doc-${Date.now()}`,
      type: 'invoice',
      documentNumber: suggestDocumentNumber('invoice', quote.businessId),
      businessId: quote.businessId,
      clientId: quote.clientId,
      projectId: quote.projectId,
      currency: quote.currency,
      issueDate: today,
      dueDate: defaults.dueDate,
      ...totals,
      isTaxExempt: quote.isTaxExempt,
      status: 'draft',
      notes: `Deposit to confirm the booking in quote #${quote.documentNumber}. The rest is invoiced later.`,
      sourceQuoteId: quote.id,
      isDeposit: true,
      shareToken: generateShareToken(),
      updatedAt: new Date().toISOString()
    };
    Object.keys(inv).forEach(k => (inv as any)[k] === undefined && delete (inv as any)[k]);
    onUpdateData({ ...data, documents: [inv, ...data.documents] });
    setSelectedDoc(inv);
    setShareToast(`Deposit invoice ${inv.documentNumber} created as a draft. Send it so the client can pay with Pay now.`);
    setTimeout(() => setShareToast(null), 5000);
  };

  // Direct Document Status Quick Change & Toggle
  const handleDirectStatusChange = (
    doc: CRMDocument, 
    newStatus: 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled' | 'accepted',
    customPartialAmount?: number
  ) => {
    if (newStatus === 'cancelled') {
      handleOpenCancelModal(doc);
      return;
    }
    if (newStatus === 'partial') {
      if (customPartialAmount !== undefined) {
        handleSavePartialPayment(
          doc.id,
          customPartialAmount,
          doc.paymentMethod || 'Vodafone M-PAiSA',
          new Date().toISOString().split('T')[0],
          'Part payment'
        );
      } else {
        setPartialModalDoc(doc);
      }
      return;
    }
    if (newStatus === 'paid' && doc.type === 'invoice' && doc.status !== 'paid') {
      // Record the payment properly: ledger entry and receipt.
      setPaymentModalDoc(doc);
      return;
    }
    const todayDate = new Date().toISOString().split('T')[0];
    const updated: CRMDocument = {
      ...doc,
      status: newStatus,
      paymentDate: newStatus === 'paid' ? (doc.paymentDate || todayDate) : (newStatus === 'draft' ? undefined : doc.paymentDate),
      paidAmountForeign: newStatus === 'paid' ? doc.total : (newStatus === 'draft' ? undefined : doc.paidAmountForeign),
      partiallyPaidAmount: newStatus === 'paid' ? undefined : (newStatus === 'draft' ? undefined : doc.partiallyPaidAmount),
      updatedAt: new Date().toISOString()
    };
    const updatedDocs = data.documents.map(d => d.id === doc.id ? updated : d);
    onUpdateData({
      ...data,
      documents: updatedDocs
    });
    if (selectedDoc && selectedDoc.id === doc.id) {
      setSelectedDoc(updated);
    }
    setShareToast(`Status changed to ${newStatus.toUpperCase()}`);
    setTimeout(() => setShareToast(null), 3000);
  };

  // Record & Save Partial Payment
  const handleSavePartialPayment = (
    docId: string,
    partialAmount: number,
    pmMethod: string,
    pmDate: string,
    notes: string,
    attachments?: PaymentAttachment[]
  ) => {
    const target = data.documents.find(d => d.id === docId);
    if (!target) return;

    const next = applyPartialPayment(data, docId, {
      amountSoFar: partialAmount, paymentMethod: pmMethod, paymentDate: pmDate, notes,
      paymentAttachments: attachments !== undefined ? attachments : target.paymentAttachments
    });
    onUpdateData(next);
    const updated = next.documents.find(d => d.id === docId)!;
    if (selectedDoc && selectedDoc.id === docId) {
      setSelectedDoc(updated);
    }
    setShareToast(`Part payment of ${target.currency || data.userProfile.defaultCurrency || 'FJD'} $${partialAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} recorded on #${target.documentNumber}`);
    setTimeout(() => setShareToast(null), 4000);
  };

  // Open Invoice Cancellation Workflow Modal
  const handleOpenCancelModal = (doc: CRMDocument) => {
    setDocToCancel(doc);
    setCancelReason('Client cancelled the order');
    setCancelNotes('');
    setGenerateCreditNote(true);
    setShowCancelModal(true);
  };

  // Confirm Invoice Cancellation & Generate Credit Note
  const handleConfirmCancelInvoice = () => {
    if (!docToCancel) return;

    const todayStr = new Date().toISOString().split('T')[0];
    // Next number in this business's credit note series (CN-YYYY-1000, 1001, …).
    const lastCreditNote = Math.max(999, ...data.documents
      .filter(d => d.type === 'credit_note' && d.businessId === docToCancel.businessId)
      .map(d => parseInt(String(d.documentNumber).split('-').pop() || '', 10))
      .filter(n => !isNaN(n)));
    const creditNoteNum = generateCreditNote
      ? `CN-${new Date().getFullYear()}-${lastCreditNote + 1}`
      : undefined;

    const updatedCancelledDoc: CRMDocument = {
      ...docToCancel,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: cancelReason + (cancelNotes.trim() ? ` — ${cancelNotes.trim()}` : ''),
      cancelledBy: data.userProfile.name || 'Account Admin',
      creditNoteNumber: creditNoteNum,
      updatedAt: new Date().toISOString()
    };

    let newDocs = data.documents.map(d => d.id === docToCancel.id ? updatedCancelledDoc : d);

    if (generateCreditNote && creditNoteNum) {
      const creditNoteDoc: CRMDocument = {
        id: `doc-cn-${Date.now()}`,
        type: 'credit_note',
        documentNumber: creditNoteNum,
        businessId: docToCancel.businessId,
        clientId: docToCancel.clientId,
        projectId: docToCancel.projectId,
        issueDate: todayStr,
        items: docToCancel.items.map(it => ({
          ...it,
          id: `cn-it-${Date.now()}-${it.id}`,
          rate: it.rate,
          total: it.total
        })),
        subtotal: docToCancel.subtotal,
        vatRate: docToCancel.vatRate,
        vatAmount: docToCancel.vatAmount,
        appliedTaxes: docToCancel.appliedTaxes,
        appliedFees: docToCancel.appliedFees,
        taxTotal: docToCancel.taxTotal,
        feeTotal: docToCancel.feeTotal,
        total: docToCancel.total,
        status: 'paid',
        notes: `Credit note for cancelled invoice #${docToCancel.documentNumber}.\nReason: ${cancelReason}${cancelNotes ? ` (${cancelNotes})` : ''}`,
        originalInvoiceId: docToCancel.id,
        isTaxExempt: docToCancel.isTaxExempt
      };
      newDocs = [creditNoteDoc, ...newDocs];
    }

    onUpdateData({
      ...data,
      documents: newDocs,
      // Expenses billed on the cancelled invoice can be billed again.
      expenses: linkBilledExpenses(data.expenses || [], docToCancel.id, null)
    });

    setSelectedDoc(updatedCancelledDoc);
    setShowCancelModal(false);
    setDocToCancel(null);
    setShareToast(`Invoice #${docToCancel.documentNumber} cancelled.${generateCreditNote ? ` Credit note ${creditNoteNum} issued.` : ''}`);
    setTimeout(() => setShareToast(null), 5000);
  };

  // Share Document via Web Share API or Clipboard Fallback
  const handleShareDoc = async (doc: CRMDocument) => {
    const docBiz = data.businesses.find(b => b.id === doc.businessId) || activeBusiness;
    const shareUrl = documentPublicUrl(doc);
    if (!shareUrl) {
      setShareToast('Save the document first to get its online link.');
      setTimeout(() => setShareToast(null), 3500);
      return;
    }
    if (doc.status === 'draft') {
      setShareToast('Drafts are hidden from clients. Mark it as sent so the link shows the document.');
      setTimeout(() => setShareToast(null), 5000);
    }
    
    const docTitle = doc.type === 'invoice' ? 'Tax Invoice' : 
                     doc.type === 'receipt' ? 'Receipt' :
                     doc.type === 'quote' ? 'Quote' : 'Credit Note';

    const shareData = {
      title: `${docTitle} #${doc.documentNumber} - ${docBiz.name}`,
      text: `Bula! Here is your ${docTitle} #${doc.documentNumber} from ${docBiz.name} (${data.userProfile.defaultCurrency} $${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast(`Link copied. Paste it into WhatsApp, Viber or an email.`);
      setTimeout(() => setShareToast(null), 4000);
    } catch (err) {
      setShareToast(`Share link: ${shareUrl}`);
      setTimeout(() => setShareToast(null), 5000);
    }
  };

  // Print Document Cleanly
  const handlePrintDoc = () => {
    window.print();
  };

  // PDF Generation & Download
  const handleOpenPdfModal = (doc: CRMDocument) => {
    setPdfModalDoc(doc);
  };

  const handleDirectDownloadPdf = (e: React.MouseEvent, doc: CRMDocument) => {
    e.stopPropagation();
    const docBiz = data.businesses.find(b => b.id === doc.businessId) || activeBusiness;
    const docClient = data.clients.find(c => c.id === doc.clientId);
    try {
      downloadDocumentPdf(doc, docBiz, docClient, data.userProfile);
      setShareToast(`PDF downloaded for #${doc.documentNumber}`);
      setTimeout(() => setShareToast(null), 3500);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setShareToast('Couldn\'t download the PDF directly. Opening PDF options…');
      setPdfModalDoc(doc);
      setTimeout(() => setShareToast(null), 2500);
    }
  };

  // Delete Document
  const handleDeleteDoc = (id: string) => {
    if (confirm('Delete this document? This can\'t be undone.')) {
      const updatedDocs = data.documents.filter(d => d.id !== id);
      onUpdateData({
        ...data,
        documents: updatedDocs,
        // Expenses billed on it can be billed again.
        expenses: linkBilledExpenses(data.expenses || [], id, null)
      });
      setSelectedDoc(null);
    }
  };

  // Record Payment Handler (multi-currency, FX conversions, deductions)
  const handleConfirmPayment = (
    docId: string,
    paymentDetails: {
      paymentMethod: string;
      paidAmountForeign?: number;
      paidAmountHome?: number;
      exchangeRate?: number;
      bankFeesDeduction?: number;
      netReceivedHome?: number;
      paymentExchangeNotes?: string;
      notes?: string;
      paymentDate?: string;
      autoLogTransaction?: boolean;
      paymentAttachments?: PaymentAttachment[];
    }
  ) => {
    const targetDoc = data.documents.find(d => d.id === docId);
    if (!targetDoc) return;
    const docCur = targetDoc.currency || data.userProfile.defaultCurrency || 'FJD';
    const finalPaymentDate = paymentDetails.paymentDate || new Date().toISOString().split('T')[0];
    const finalAttachments = paymentDetails.paymentAttachments || targetDoc.paymentAttachments || [];
    // Paying an invoice also issues its receipt (as confirming a client's payment report does).
    const paid = applyConfirmedPayment(data, docId, paymentDetails);
    const { data: withReceipt, receipt } = targetDoc.type === 'invoice'
      ? addReceiptForInvoice(paid, docId, { paymentMethod: paymentDetails.paymentMethod, paymentDate: finalPaymentDate })
      : { data: paid, receipt: null };
    onUpdateData(withReceipt);
    if (receipt) {
      setShareToast(`Payment recorded. Receipt ${receipt.documentNumber} was created.`);
      setTimeout(() => setShareToast(null), 4000);
    }

    setPaymentModalDoc(null);
    setSelectedDoc(prev => prev && prev.id === targetDoc.id ? {
      ...prev,
      status: 'paid' as const,
      paymentMethod: paymentDetails.paymentMethod,
      paymentDate: finalPaymentDate,
      paidAmountForeign: paymentDetails.paidAmountForeign,
      paidAmountHome: paymentDetails.paidAmountHome,
      exchangeRate: paymentDetails.exchangeRate,
      bankFeesDeduction: paymentDetails.bankFeesDeduction,
      netReceivedHome: paymentDetails.netReceivedHome,
      paymentExchangeNotes: paymentDetails.paymentExchangeNotes,
      paymentAttachments: finalAttachments,
      updatedAt: new Date().toISOString()
    } : null);

    setShareToast(`Payment of ${docCur} ${(paymentDetails.paidAmountForeign || targetDoc.total).toLocaleString(undefined, { minimumFractionDigits: 2 })} recorded`);
    setTimeout(() => setShareToast(null), 5000);
  };

  // Handler when user chooses to Draft Invoice with FX calculations from FX Calculator
  const handleCreateDocFromFx = ({
    currency,
    amount,
    exchangeRate,
    fjdEquivalent,
    notes: fxNotes
  }: {
    currency: string;
    amount: number;
    exchangeRate: number;
    fjdEquivalent: number;
    notes: string;
  }) => {
    setDocType('invoice');
    setDocCurrency(currency);
    const nextNum = suggestDocumentNumber('invoice');
    setDocNumber(nextNum);
    setDocStatus('draft');
    setEditingDoc(null);
    setItems([
      {
        id: `it-${Date.now()}`,
        name: `Professional Services (${currency})`,
        description: `Billed in ${currency} at 1 ${currency} = ${exchangeRate.toFixed(4)} FJD (about FJ$ ${fjdEquivalent.toFixed(2)})`,
        quantity: 1,
        rate: Number(amount.toFixed(2)),
        total: Number(amount.toFixed(2))
      }
    ]);
    setNotes(fxNotes || 'Vinaka vakalevu for your business!');
    setShowEditor(true);
    setShareToast(`Draft invoice filled in with ${currency} ${amount.toFixed(2)} at ${exchangeRate.toFixed(4)} FJD`);
    setTimeout(() => setShareToast(null), 4000);
  };

  // Handle Catalog Item Selection change in builder
  const handleCatalogSelect = (id: string) => {
    setSelectedCatalogItemId(id);
    if (id === 'custom') {
      setCustomItemName('');
      setItemRate(0);
    } else {
      const catalogItem = data.services.find(s => s.id === id);
      if (catalogItem) {
        setCustomItemName(catalogItem.name);
        setItemRate(catalogItem.rate);
      }
    }
  };

  // Add Item Line to current list
  const handleAddItemLine = () => {
    if (!customItemName || itemQty <= 0 || itemRate < 0) return;

    const newItem: DocumentItem = {
      id: `item-${Date.now()}`,
      itemId: selectedCatalogItemId !== 'custom' ? selectedCatalogItemId : undefined,
      name: customItemName,
      quantity: itemQty,
      rate: itemRate,
      total: itemQty * itemRate
    };

    setItems([...items, newItem]);
    
    // Reset inputs
    setSelectedCatalogItemId('');
    setCustomItemName('');
    setItemQty(1);
    setItemRate(0);
  };

  const handleRemoveItemLine = (lineId: string) => {
    setItems(items.filter(it => it.id !== lineId));
  };

  // Compute subtotal, itemized taxes, itemized fees, and grand total
  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, curr) => acc + curr.total, 0);
    // Reimbursable expenses are passed on without VAT or fees unless the line is marked taxable.
    const { taxableBase, reimbursementsNoVat } = lineTotals(items);

    const availableTaxes = [
      ...(data.platformTaxes || []),
      ...(data.businessTaxes || []).filter(t => !t.businessId || t.businessId === (editingDoc?.businessId || data.activeBusinessId))
    ];

    const availableFees = [
      ...(data.platformFees || []),
      ...(data.businessFees || []).filter(f => !f.businessId || f.businessId === (editingDoc?.businessId || data.activeBusinessId))
    ];

    const appliedFees: AppliedChargeItem[] = [];
    selectedFeeIds.forEach(feeId => {
      const fee = availableFees.find(f => f.id === feeId);
      if (fee) {
        const amount = fee.rateType === 'flat' ? fee.rate : taxableBase * (fee.rate / 100);
        appliedFees.push({
          id: fee.id,
          name: fee.name,
          type: 'fee',
          rate: fee.rate,
          rateType: fee.rateType,
          amount
        });
      }
    });

    const feeTotal = appliedFees.reduce((acc, f) => acc + f.amount, 0);

    // If tax component is disabled globally OR this document is tax-exempt
    if (isTaxExempt || data.userProfile.enableTax === false) {
      return {
        subtotal,
        appliedTaxes: [],
        appliedFees,
        taxTotal: 0,
        feeTotal,
        vatRate: 0,
        vatAmount: 0,
        total: subtotal + feeTotal,
        reimbursementsNoVat
      };
    }

    const appliedTaxes: AppliedChargeItem[] = [];
    selectedTaxIds.forEach(taxId => {
      const tax = availableTaxes.find(t => t.id === taxId);
      if (tax) {
        // If this is standard VAT, ensure rate matches userProfile's default VAT rate
        const isVat = tax.id === 'ptax-1' || tax.category === 'vat' || tax.name.toLowerCase().includes('vat');
        const effectiveRate = isVat ? (data.userProfile.defaultVatRate ?? tax.rate ?? 12.5) : tax.rate;
        const amount = tax.rateType === 'flat' ? effectiveRate : taxableBase * (effectiveRate / 100);
        appliedTaxes.push({
          id: tax.id,
          name: isVat ? `Fiji VAT (${effectiveRate}%)` : tax.name,
          type: 'tax',
          rate: effectiveRate,
          rateType: tax.rateType,
          amount
        });
      } else if (taxId === 'ptax-1') {
        const rate = data.userProfile.defaultVatRate ?? 12.5;
        appliedTaxes.push({
          id: 'ptax-1',
          name: `Fiji VAT (${rate}%)`,
          type: 'tax',
          rate,
          rateType: 'percentage',
          amount: taxableBase * (rate / 100)
        });
      }
    });

    const taxTotal = appliedTaxes.reduce((acc, t) => acc + t.amount, 0);

    // Primary Fiji VAT rate & amount
    const vatTax = appliedTaxes.find(t => t.id === 'ptax-1' || t.name.toLowerCase().includes('vat'));
    const vatRate = vatTax ? vatTax.rate : (data.userProfile.defaultVatRate ?? 12.5);
    const vatAmount = vatTax ? vatTax.amount : taxableBase * (vatRate / 100);

    const total = subtotal + taxTotal + feeTotal;

    return { 
      subtotal, 
      appliedTaxes, 
      appliedFees, 
      taxTotal, 
      feeTotal, 
      vatRate, 
      vatAmount, 
      total,
      reimbursementsNoVat
    };
  }, [items, selectedTaxIds, selectedFeeIds, isTaxExempt, data.userProfile.enableTax, data.platformTaxes, data.platformFees, data.businessTaxes, data.businessFees, data.userProfile.defaultVatRate, data.activeBusinessId, editingDoc]);

  // Form Submission for standard document
  const handleSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || items.length === 0) {
      alert('Choose a client and add at least one line item.');
      return;
    }

    const docPayload: CRMDocument = {
      id: editingDoc ? editingDoc.id : `doc-${Date.now()}`,
      type: docType,
      documentNumber: docNumber,
      businessId: editingDoc?.businessId || data.activeBusinessId,
      clientId,
      issueDate,
      dueDate: docType !== 'receipt' ? dueDate : undefined,
      items,
      subtotal: totals.subtotal,
      vatRate: totals.vatRate,
      vatAmount: totals.vatAmount,
      appliedTaxes: totals.appliedTaxes,
      appliedFees: totals.appliedFees,
      taxTotal: totals.taxTotal,
      feeTotal: totals.feeTotal,
      total: totals.total,
      status: docStatus,
      currency: docCurrency || data.userProfile.defaultCurrency || 'FJD',
      notes,
      paymentMethod: docType === 'receipt' ? paymentMethod : undefined,
      projectId: docProjectId || undefined,
      isTaxExempt: isTaxExempt || data.userProfile.enableTax === false,
      cancelledAt: editingDoc?.cancelledAt,
      cancellationReason: editingDoc?.cancellationReason,
      cancelledBy: editingDoc?.cancelledBy,
      creditNoteNumber: editingDoc?.creditNoteNumber,
      originalInvoiceId: editingDoc?.originalInvoiceId,
      updatedAt: new Date().toISOString()
    };

    let updatedDocs = [];
    if (editingDoc) {
      updatedDocs = data.documents.map(d => d.id === editingDoc.id ? docPayload : d);
    } else {
      updatedDocs = [docPayload, ...data.documents];
    }

    onUpdateData({
      ...data,
      documents: updatedDocs,
      expenses: linkBilledExpenses(data.expenses || [], docPayload.id, docPayload.items)
    });

    setShowEditor(false);
    setSelectedDoc(docPayload); // Open details preview of the newly saved document!
  };

  // =========================================================================
  // RECURRING INVOICE & RETAINER ENGINE (CALCULATIONS & GENERATION)
  // =========================================================================

  // Helper to calculate total from retainer line items
  const retCalculatedTotals = useMemo(() => {
    const subtotal = retItems.reduce((acc, it) => acc + (it.total || it.quantity * it.rate), 0);
    const vatRate = data.userProfile.defaultVatRate ?? 12.5;
    const vatAmount = subtotal * (vatRate / 100);
    const total = subtotal + vatAmount;
    return { subtotal, vatRate, vatAmount, total };
  }, [retItems, data.userProfile.defaultVatRate]);

  // Retainer item builder handlers
  const handleRetCatalogSelect = (id: string) => {
    setRetSelectedCatalogItemId(id);
    if (id === 'custom') {
      setRetItemName('');
      setRetItemRate(0);
    } else {
      const srv = data.services.find(s => s.id === id);
      if (srv) {
        setRetItemName(srv.name);
        setRetItemRate(srv.rate);
      }
    }
  };

  const handleAddRetItemLine = () => {
    if (!retItemName || retItemQty <= 0 || retItemRate < 0) return;
    const newItem: DocumentItem = {
      id: `ret-item-${Date.now()}`,
      itemId: retSelectedCatalogItemId !== 'custom' ? retSelectedCatalogItemId : undefined,
      name: retItemName,
      quantity: retItemQty,
      rate: retItemRate,
      total: retItemQty * retItemRate
    };
    setRetItems([...retItems, newItem]);
    setRetSelectedCatalogItemId('');
    setRetItemName('');
    setRetItemQty(1);
    setRetItemRate(0);
  };

  const handleRemoveRetItemLine = (id: string) => {
    setRetItems(retItems.filter(it => it.id !== id));
  };

  // Compute Next Billing Date and Days Remaining for any retainer schedule
  const getNextBillingSchedule = (ret: RecurringInvoice) => {
    if (ret.status === 'paused') {
      return { dateStr: 'Paused', daysRemaining: 9999, isDue: false, label: 'Paused' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const interval = ret.interval || 'monthly';
    const billingDay = Math.min(Math.max(ret.billingDay || 1, 1), 28);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    const currentDate = today.getDate();

    let nextDate: Date;

    if (interval === 'monthly') {
      if (ret.lastGeneratedDate) {
        const lastGen = new Date(ret.lastGeneratedDate);
        // If already generated this month, next is next month on billingDay
        if (lastGen.getFullYear() === currentYear && lastGen.getMonth() === currentMonth) {
          nextDate = new Date(currentYear, currentMonth + 1, billingDay);
        } else {
          // Has not been generated this month yet
          if (currentDate >= billingDay) {
            // Already due this month!
            nextDate = new Date(currentYear, currentMonth, billingDay);
          } else {
            nextDate = new Date(currentYear, currentMonth, billingDay);
          }
        }
      } else {
        // Never generated
        if (currentDate >= billingDay) {
          nextDate = new Date(currentYear, currentMonth, billingDay);
        } else {
          nextDate = new Date(currentYear, currentMonth, billingDay);
        }
      }
    } else if (interval === 'quarterly') {
      const baseDate = ret.lastGeneratedDate ? new Date(ret.lastGeneratedDate) : new Date(ret.startDate);
      nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 3);
    } else if (interval === 'bi-weekly') {
      const baseDate = ret.lastGeneratedDate ? new Date(ret.lastGeneratedDate) : new Date(ret.startDate);
      nextDate = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    } else { // annual
      const baseDate = ret.lastGeneratedDate ? new Date(ret.lastGeneratedDate) : new Date(ret.startDate);
      nextDate = new Date(baseDate);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }

    nextDate.setHours(0, 0, 0, 0);
    const diffMs = nextDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isDue = daysRemaining <= 0;

    const formattedDate = nextDate.toLocaleDateString('en-FJ', { month: 'short', day: 'numeric', year: 'numeric' });

    let label = '';
    if (isDue) {
      label = 'Due today';
    } else if (daysRemaining === 1) {
      label = 'Due tomorrow';
    } else {
      label = `In ${daysRemaining} days (${formattedDate})`;
    }

    return {
      dateStr: formattedDate,
      daysRemaining,
      isDue,
      label
    };
  };

  // Automated Retainer Billing Processor (same engine as the daily server job; see lib/retainers.ts)
  const processAutoRetainerBilling = (silent: boolean = false) => {
    const { data: next, created } = runDueRetainers(data, todayIn(), { onlyAutoGenerate: silent });
    if (created.length > 0) {
      const totalSpawnedValue = created.reduce((sum, d) => sum + d.total, 0);
      onUpdateData(next);
      setAutoGenNotification(`Created ${created.length} retainer invoice(s) totalling ${data.userProfile.defaultCurrency} $${totalSpawnedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
      setTimeout(() => setAutoGenNotification(null), 9000);
    } else if (!silent) {
      setAutoGenNotification("No retainer invoices are due today.");
      setTimeout(() => setAutoGenNotification(null), 5000);
    }
  };

  // Generate an immediate invoice for a specific retainer schedule on demand
  const handleTriggerRetainerInvoice = (ret: RecurringInvoice) => {
    const { data: next, invoice } = generateRetainerNow(data, ret, todayIn());
    onUpdateData(next);
    setAutoGenNotification(`Created tax invoice ${invoice.documentNumber} (${invoice.currency} $${invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}) for ${ret.projectName || 'this retainer'}.`);
    setTimeout(() => setAutoGenNotification(null), 6000);
  };

  // Convert an existing Invoice into a Recurring Retainer Schedule
  const handleConvertInvoiceToRetainer = (doc: CRMDocument) => {
    setEditingRetainer(null);
    setRetClientId(doc.clientId);
    setRetBusinessId(doc.businessId);
    setRetProjectId(doc.projectId || '');
    setRetCurrency(doc.currency || data.userProfile.defaultCurrency || 'FJD');
    
    const client = data.clients.find(c => c.id === doc.clientId);
    setRetProjectName(`${client?.name || 'Client'} retainer`);
    setRetInterval('monthly');
    setRetBillingDay(1);
    setRetPaymentTermsDays(paymentTermsDays(activeBusiness));
    setRetAutoSendMode('sent');
    setRetAutoGenerate(true);
    setRetStartDate(new Date().toISOString().split('T')[0]);
    setRetEndDate('');
    setRetStatus('active');
    setRetNotes(doc.notes || 'Monthly retainer. Tax invoice created automatically.');

    // Clone line items from invoice
    setRetItems(doc.items && doc.items.length > 0 ? [...doc.items] : [{
      id: `ret-item-${Date.now()}`,
      name: 'Monthly retainer',
      quantity: 1,
      rate: doc.subtotal,
      total: doc.subtotal
    }]);

    setSelectedDoc(null);
    setBillingSubTab('retainers');
    setShowRetainerEditor(true);
  };

  // Open Retainer Creator Modal
  const handleNewRetainer = () => {
    setEditingRetainer(null);
    const firstClient = data.clients[0];
    setRetClientId(firstClient?.id || '');
    setRetBusinessId(data.activeBusinessId);
    setRetProjectId('');
    setRetCurrency(firstClient?.currency || data.userProfile.defaultCurrency || 'FJD');
    setRetProjectName('');
    setRetInterval('monthly');
    setRetBillingDay(1);
    setRetPaymentTermsDays(paymentTermsDays(activeBusiness));
    setRetAutoSendMode('sent');
    setRetAutoGenerate(true);
    setRetStartDate(new Date().toISOString().split('T')[0]);
    setRetEndDate('');
    setRetStatus('active');
    setRetNotes('Monthly retainer for ongoing maintenance and support. Pay by bank transfer or M-PAiSA.');
    
    // Default initial line item
    setRetItems([{
      id: `ret-item-${Date.now()}`,
      name: 'Monthly consulting and maintenance retainer',
      quantity: 1,
      rate: 1200,
      total: 1200
    }]);

    // Reset item inputs
    setRetSelectedCatalogItemId('');
    setRetItemName('');
    setRetItemQty(1);
    setRetItemRate(0);

    setShowRetainerEditor(true);
  };

  // Open Retainer Editor for existing schedule
  const handleEditRetainer = (ret: RecurringInvoice) => {
    setEditingRetainer(ret);
    setRetClientId(ret.clientId);
    setRetBusinessId(ret.businessId || data.activeBusinessId);
    setRetProjectId(ret.projectId || '');
    const client = data.clients.find(c => c.id === ret.clientId);
    setRetCurrency(ret.currency || client?.currency || data.userProfile.defaultCurrency || 'FJD');
    setRetProjectName(ret.projectName || '');
    setRetInterval(ret.interval || 'monthly');
    setRetBillingDay(ret.billingDay || 1);
    setRetPaymentTermsDays(ret.paymentTermsDays || 14);
    setRetAutoSendMode(ret.autoSendMode || 'sent');
    setRetAutoGenerate(ret.autoGenerate);
    setRetStartDate(ret.startDate || new Date().toISOString().split('T')[0]);
    setRetEndDate(ret.endDate || '');
    setRetStatus(ret.status);
    setRetNotes(ret.notes || '');

    if (ret.items && ret.items.length > 0) {
      setRetItems([...ret.items]);
    } else {
      setRetItems([{
        id: `ret-item-${Date.now()}`,
        name: ret.projectName || 'Monthly retainer',
        quantity: 1,
        rate: ret.amount || 1000,
        total: ret.amount || 1000
      }]);
    }

    setRetSelectedCatalogItemId('');
    setRetItemName('');
    setRetItemQty(1);
    setRetItemRate(0);

    setShowRetainerEditor(true);
  };

  // Toggle active/paused status
  const handleToggleRetainerStatus = (ret: RecurringInvoice) => {
    const newStatus = ret.status === 'active' ? 'paused' : 'active';
    const updated = (data.recurringInvoices || []).map(r => 
      r.id === ret.id ? { ...r, status: newStatus as 'active' | 'paused' } : r
    );
    onUpdateData({
      ...data,
      recurringInvoices: updated
    });
  };

  // Toggle auto-generate toggle
  const handleToggleAutoGenerate = (ret: RecurringInvoice) => {
    const updated = (data.recurringInvoices || []).map(r => 
      r.id === ret.id ? { ...r, autoGenerate: !r.autoGenerate } : r
    );
    onUpdateData({
      ...data,
      recurringInvoices: updated
    });
  };

  // Delete Retainer schedule
  const handleDeleteRetainer = (id: string) => {
    if (confirm('Delete this retainer? No more invoices will be created from it.')) {
      const updated = (data.recurringInvoices || []).filter(r => r.id !== id);
      onUpdateData({
        ...data,
        recurringInvoices: updated
      });
    }
  };

  // Submit Retainer Schedule
  const handleSubmitRetainer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!retClientId || !retProjectName || retItems.length === 0) {
      alert('Choose a client, enter a retainer name and add at least one line item.');
      return;
    }

    const calculatedSubtotal = retItems.reduce((acc, it) => acc + (it.total || it.quantity * it.rate), 0);

    const payload: RecurringInvoice = {
      id: editingRetainer ? editingRetainer.id : `rec-${Date.now()}`,
      clientId: retClientId,
      businessId: retBusinessId || data.activeBusinessId,
      projectId: retProjectId || undefined,
      projectName: retProjectName,
      currency: retCurrency || data.userProfile.defaultCurrency || 'FJD',
      amount: calculatedSubtotal,
      billingDay: Number(retBillingDay),
      interval: retInterval,
      paymentTermsDays: Number(retPaymentTermsDays),
      autoSendMode: retAutoSendMode,
      status: retStatus,
      autoGenerate: retAutoGenerate,
      startDate: retStartDate,
      endDate: retEndDate || undefined,
      notes: retNotes,
      lastGeneratedDate: editingRetainer ? editingRetainer.lastGeneratedDate : undefined,
      generatedDocIds: editingRetainer ? editingRetainer.generatedDocIds : [],
      items: retItems
    };

    let updated = [];
    const currentRecs = data.recurringInvoices || [];
    if (editingRetainer) {
      updated = currentRecs.map(r => r.id === editingRetainer.id ? payload : r);
    } else {
      updated = [payload, ...currentRecs];
    }

    onUpdateData({
      ...data,
      recurringInvoices: updated
    });

    setShowRetainerEditor(false);
    setAutoGenNotification(`Retainer saved for ${retProjectName}. Billing on day ${retBillingDay} (${retInterval}).`);
    setTimeout(() => setAutoGenNotification(null), 6000);
  };

  // Background automated retainer billing check on component mount
  useEffect(() => {
    const timer = setTimeout(() => {
      processAutoRetainerBilling(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Compute Status & Overdue Metrics
  const todayStr = new Date().toISOString().split('T')[0];

  const documentStatusCounts = useMemo(() => {
    const bizDocs = data.documents.filter(d => d.businessId === data.activeBusinessId);
    let drafts = 0;
    let sent = 0;
    let partial = 0;
    let paid = 0;
    let overdue = 0;
    let overdueSum = 0;

    bizDocs.forEach(d => {
      const isOd = d.type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled' && !!d.dueDate && d.dueDate < todayStr;
      if (isOd) {
        overdue++;
        overdueSum += d.total;
      }
      if (d.status === 'draft') drafts++;
      else if (d.status === 'sent') sent++;
      else if (d.status === 'partial') partial++;
      else if (d.status === 'paid') paid++;
    });

    return {
      total: bizDocs.length,
      drafts,
      sent,
      partial,
      paid,
      overdue,
      overdueSum
    };
  }, [data.documents, data.activeBusinessId, todayStr]);

  // Quick One-Click Status Cycler (Draft -> Sent -> Partial -> Paid -> Draft)
  const handleCycleInvoiceStatus = (doc: CRMDocument) => {
    if (doc.status === 'draft') {
      handleDirectStatusChange(doc, 'sent');
    } else if (doc.status === 'sent') {
      setPartialModalDoc(doc);
    } else if (doc.status === 'partial') {
      handleDirectStatusChange(doc, 'paid');
    } else if (doc.status === 'paid') {
      handleDirectStatusChange(doc, 'draft');
    }
  };

  // Filter & Search Documents
  const filteredDocuments = data.documents.filter(doc => {
    if (doc.businessId !== data.activeBusinessId) return false;
    if (filterType !== 'all' && doc.type !== filterType) return false;

    const isOverdue = doc.type === 'invoice' && doc.status !== 'paid' && doc.status !== 'cancelled' && !!doc.dueDate && doc.dueDate < todayStr;
    const docStatus = isOverdue ? 'overdue' : doc.status;

    if (filterStatus !== 'all') {
      if (filterStatus === 'overdue') {
        if (!isOverdue) return false;
      } else if (filterStatus === 'sent') {
        if (doc.status !== 'sent') return false;
      } else if (filterStatus === 'partial') {
        if (doc.status !== 'partial') return false;
      } else if (filterStatus === 'draft') {
        if (doc.status !== 'draft') return false;
      } else if (filterStatus === 'paid') {
        if (doc.status !== 'paid') return false;
      } else {
        if (doc.status !== filterStatus) return false;
      }
    }

    const client = data.clients.find(c => c.id === doc.clientId);
    const matchClient = client ? client.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const matchNumber = doc.documentNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = docStatus.toLowerCase().includes(searchQuery.toLowerCase()) || doc.status.toLowerCase().includes(searchQuery.toLowerCase());

    return matchClient || matchNumber || matchStatus;
  });

  // Retainers filtered list and statistics for active business
  const businessRetainers = (data.recurringInvoices || []).filter(r => r.businessId === data.activeBusinessId);

  const filteredRetainers = businessRetainers.filter(ret => {
    if (retainerFilterStatus !== 'all' && ret.status !== retainerFilterStatus) return false;
    if (retainerSearch) {
      const client = data.clients.find(c => c.id === ret.clientId);
      const matchClient = client ? client.name.toLowerCase().includes(retainerSearch.toLowerCase()) : false;
      const matchProject = (ret.projectName || '').toLowerCase().includes(retainerSearch.toLowerCase());
      return matchClient || matchProject;
    }
    return true;
  });

  // Retainers MRR and Metrics
  const retainerMetrics = useMemo(() => {
    let activeCount = 0;
    let mrr = 0;
    let dueCount = 0;

    businessRetainers.forEach(ret => {
      if (ret.status === 'active') {
        activeCount++;
        const subtotal = ret.items && ret.items.length > 0 
          ? ret.items.reduce((sum, it) => sum + (it.total || it.quantity * it.rate), 0)
          : ret.amount;
        
        const vatRate = retainerVatRate(data);
        const total = subtotal * (1 + vatRate / 100);

        if (ret.interval === 'quarterly') {
          mrr += total / 3;
        } else if (ret.interval === 'bi-weekly') {
          mrr += total * 2.16;
        } else if (ret.interval === 'annual') {
          mrr += total / 12;
        } else {
          mrr += total; // monthly
        }

        const schedule = getNextBillingSchedule(ret);
        if (schedule.isDue) {
          dueCount++;
        }
      }
    });

    const arr = mrr * 12;
    return { activeCount, mrr, arr, dueCount };
  }, [businessRetainers, data.userProfile.defaultVatRate]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto pb-24 font-sans select-none text-left">
      
      {/* Header section with Creator buttons */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Invoices and retainers</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-1.5 font-display">
            <Layers className="w-5 h-5 text-sky-600" /> Billing
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFxCalculator(true)}
            title="Exchange rate calculator"
            className="bg-white hover:bg-sky-50 border border-slate-200 text-sky-700 font-bold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden sm:inline">FX calculator</span>
          </button>

          {billingSubTab === 'documents' ? (
            <button
              onClick={() => handleNewDocument('invoice')}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-1.5 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-sky-600/10 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New document
            </button>
          ) : (
            <button
              onClick={handleNewRetainer}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-1.5 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-sky-600/10 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New retainer
            </button>
          )}
        </div>
      </div>

      {/* Auto-generation Notification banner */}
      {autoGenNotification && (
        <div className="bg-sky-50 border border-sky-100 p-3 rounded-xl flex items-start gap-2 shadow-sm text-left animate-fade-in">
          <Sparkles className="w-4 h-4 text-sky-500 mt-0.5 shrink-0 animate-pulse" />
          <div className="flex-1">
            <h4 className="text-[11px] font-black uppercase text-sky-800">Retainer billing</h4>
            <p className="text-[10.5px] text-sky-700 mt-0.5 leading-normal">{autoGenNotification}</p>
          </div>
          <button 
            onClick={() => setAutoGenNotification(null)}
            className="text-sky-400 hover:text-sky-600 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-Tab Navigation Switcher */}
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setBillingSubTab('documents')}
          className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            billingSubTab === 'documents' 
              ? 'bg-white text-slate-800 shadow-xs' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-slate-600" /> Invoices and quotes
        </button>
        <button
          onClick={() => setBillingSubTab('retainers')}
          className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            billingSubTab === 'retainers' 
              ? 'bg-white text-slate-800 shadow-xs' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-sky-500" /> Retainers
          {retainerMetrics.dueCount > 0 && (
            <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full ml-0.5 animate-pulse">
              {retainerMetrics.dueCount}
            </span>
          )}
        </button>
      </div>

      {billingSubTab === 'documents' ? (
        <>
          {/* Quick Creator Shortcuts list */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setShowFxCalculator(true)}
              className="bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-800 flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-2xs transition-all active:scale-95"
            >
              <Calculator className="w-3.5 h-3.5 text-sky-600" /> Exchange rate calculator
            </button>
            <button
              onClick={() => handleNewDocument('quote')}
              className="bg-white hover:bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full text-[11px] font-bold text-amber-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> + New quote
            </button>
            <button
              onClick={() => handleNewDocument('receipt')}
              className="bg-white hover:bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full text-[11px] font-bold text-emerald-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> + New receipt
            </button>
            <button
              onClick={() => {
                setBillingSubTab('retainers');
                handleNewRetainer();
              }}
              className="bg-white hover:bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-sky-500" /> + New retainer
            </button>
          </div>

          {/* Filter and Search controls */}
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by number, client or status"
                className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Tab Filter row */}
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
              {(['all', 'quote', 'invoice', 'receipt'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                    filterType === t 
                      ? 'bg-white text-slate-800 shadow-xs' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t === 'all' ? 'All' : `${t}s`}
                </button>
              ))}
            </div>

            {/* Overdue Alert Strip if any invoices are overdue */}
            {documentStatusCounts.overdue > 0 && (
              <div 
                onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}
                className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl flex items-center justify-between cursor-pointer hover:bg-rose-100/80 transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-rose-800">
                      {documentStatusCounts.overdue} overdue {documentStatusCounts.overdue === 1 ? 'invoice' : 'invoices'}
                    </span>
                    <span className="text-[10px] text-rose-600 ml-1.5 font-medium">
                      ({(data.userProfile.defaultCurrency || 'FJD')} ${documentStatusCounts.overdueSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding)
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-white/80 px-2 py-0.5 rounded-lg border border-rose-200 shadow-2xs">
                  {filterStatus === 'overdue' ? 'Show all' : 'Show overdue'}
                </span>
              </div>
            )}

            {/* Status Filter Row */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
                Status:
              </span>
              {(['all', 'draft', 'sent', 'partial', 'paid', 'overdue'] as const).map((status) => {
                let activeClass = 'bg-slate-800 text-white shadow-xs';
                let inactiveClass = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                
                if (status === 'draft') {
                  activeClass = 'bg-slate-600 text-white shadow-xs';
                  inactiveClass = 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/50';
                } else if (status === 'sent') {
                  activeClass = 'bg-sky-600 text-white shadow-xs';
                  inactiveClass = 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-100/50';
                } else if (status === 'partial') {
                  activeClass = 'bg-amber-600 text-white shadow-xs';
                  inactiveClass = 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/50';
                } else if (status === 'paid') {
                  activeClass = 'bg-emerald-600 text-white shadow-xs';
                  inactiveClass = 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100/50';
                } else if (status === 'overdue') {
                  activeClass = 'bg-rose-600 text-white ring-1 ring-rose-450 shadow-xs';
                  inactiveClass = 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100/50';
                }

                const countBadge = 
                  status === 'draft' ? documentStatusCounts.drafts :
                  status === 'sent' ? documentStatusCounts.sent :
                  status === 'partial' ? documentStatusCounts.partial :
                  status === 'paid' ? documentStatusCounts.paid :
                  status === 'overdue' ? documentStatusCounts.overdue :
                  documentStatusCounts.total;

                return (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold capitalize transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      filterStatus === status ? activeClass : inactiveClass
                    }`}
                  >
                    {status === 'draft' && <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />}
                    {status === 'sent' && <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />}
                    {status === 'partial' && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />}
                    {status === 'paid' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                    {status === 'overdue' && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />}
                    <span>{status}</span>
                    <span className={`text-[9px] px-1 rounded-md ${filterStatus === status ? 'bg-white/20 text-white' : 'bg-black/5 text-slate-500 font-semibold'}`}>
                      {countBadge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Documents List */}
          {filteredDocuments.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center">
              <p className="text-xs text-slate-500">No documents match. Create an invoice to get started.</p>
              <button
                onClick={() => handleNewDocument('invoice')}
                className="mt-3 text-xs bg-sky-100 hover:bg-sky-200 text-sky-700 font-semibold py-1.5 px-3 rounded-xl cursor-pointer"
              >
                New invoice
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredDocuments.map((doc) => {
                const client = data.clients.find(c => c.id === doc.clientId);
                
                let colorClasses = "bg-sky-50 text-sky-700 border-sky-100";
                if (doc.type === 'quote') {
                  colorClasses = "bg-amber-50 text-amber-700 border-amber-100";
                } else if (doc.type === 'receipt') {
                  colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-100";
                }

                const todayStr = new Date().toISOString().split('T')[0];
                const isOverdue = doc.type === 'invoice' && doc.status !== 'paid' && doc.status !== 'cancelled' && !!doc.dueDate && doc.dueDate < todayStr;
                const displayStatus = isOverdue ? 'overdue' : doc.status;

                // Calculate days overdue if applicable
                let daysOverdue = 0;
                if (isOverdue && doc.dueDate) {
                  const dueMs = new Date(doc.dueDate).getTime();
                  const todayMs = new Date(todayStr).getTime();
                  daysOverdue = Math.max(1, Math.round((todayMs - dueMs) / (1000 * 60 * 60 * 24)));
                }

                const isStatusMenuOpen = openStatusMenuDocId === doc.id;

                return (
                  <motion.div
                    key={doc.id}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedDoc(doc)}
                    className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm hover:border-sky-100 cursor-pointer transition-all flex flex-col gap-2 group relative"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className={`w-9 h-9 rounded-xl border flex flex-col items-center justify-center ${colorClasses} shrink-0`}>
                          <span className="text-[8px] font-extrabold uppercase tracking-tight leading-none">
                            {doc.type.slice(0, 3)}
                          </span>
                          <span className="text-[9px] font-semibold mt-0.5">
                            #{doc.documentNumber.split('-').pop()}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="text-xs font-bold text-slate-800 truncate">{client?.name || 'Unknown client'}</h3>
                          <div className="flex flex-wrap gap-1 items-center mt-0.5">
                            <span className="text-[10px] text-slate-400">{doc.issueDate}</span>
                            {doc.dueDate && (
                              <>
                                <span className="text-[10px] text-slate-300">•</span>
                                <span className={`text-[10px] ${isOverdue ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                                  Due {doc.dueDate}
                                </span>
                              </>
                            )}
                            <span className="text-[10px] text-slate-300">•</span>
                            
                            {/* Interactive Status Pill with Quick Switcher Dropdown */}
                            <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setOpenStatusMenuDocId(isStatusMenuOpen ? null : doc.id)}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${
                                  displayStatus === 'paid' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                                  displayStatus === 'overdue' ? 'bg-rose-50 text-rose-600 border border-rose-200 ring-1 ring-rose-300 animate-pulse' :
                                  displayStatus === 'partial' ? 'bg-amber-50 text-amber-700 border border-amber-300' :
                                  displayStatus === 'sent' ? 'bg-sky-50 text-sky-600 border border-sky-200' :
                                  displayStatus === 'draft' ? 'bg-slate-100 text-slate-600 border border-slate-200' : 
                                  'bg-rose-50 text-rose-600 border border-rose-200'
                                }`}
                                title="Change status"
                              >
                                {displayStatus === 'partial' ? 'Partially paid' : displayStatus}
                                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                              </button>

                              {/* Dropdown status switcher menu */}
                              {isStatusMenuOpen && (
                                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl p-1 z-30 min-w-[130px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95">
                                  <span className="text-[9px] font-bold text-slate-400 px-2 py-0.5 uppercase tracking-wider">Change status</span>
                                  {(['draft', 'sent', 'partial', 'paid'] as const).map((st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() => {
                                        setOpenStatusMenuDocId(null);
                                        if (st === 'partial') {
                                          setPartialModalDoc(doc);
                                        } else {
                                          handleDirectStatusChange(doc, st);
                                        }
                                      }}
                                      className={`text-left px-2 py-1 rounded-lg text-[10px] font-bold capitalize flex items-center justify-between cursor-pointer hover:bg-slate-100 ${
                                        doc.status === st ? 'text-sky-700 bg-sky-50 font-black' : 'text-slate-700'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          st === 'draft' ? 'bg-slate-400' :
                                          st === 'sent' ? 'bg-sky-500' :
                                          st === 'partial' ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`} />
                                        {st === 'partial' ? 'Partial' : st}
                                      </span>
                                      {doc.status === st && <Check className="w-3 h-3 text-sky-600" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {doc.projectId && (() => {
                              const linkedProj = (data.projects || []).find(p => p.id === doc.projectId);
                              if (linkedProj) {
                                return (
                                  <>
                                    <span className="text-[10px] text-slate-300">•</span>
                                    <span className="px-1 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-bold max-w-[100px] truncate">
                                      {linkedProj.name}
                                    </span>
                                  </>
                                );
                              }
                              return null;
                            })()}

                            {doc.paymentAttachments && doc.paymentAttachments.length > 0 && (
                              <>
                                <span className="text-[10px] text-slate-300">•</span>
                                <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[8px] font-bold flex items-center gap-1">
                                  <Paperclip className="w-2.5 h-2.5 text-sky-600" />
                                  <span>{doc.paymentAttachments.length} {doc.paymentAttachments.length === 1 ? 'proof' : 'proofs'}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            {doc.currency || data.userProfile.defaultCurrency || 'FJD'}
                          </span>
                          <span className="text-xs font-extrabold text-slate-800">
                            {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailModalDoc(doc);
                          }}
                          title="Email to client"
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditDocument(doc);
                          }}
                          title="Edit"
                          className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Overdue Warning Tag & Days Counter */}
                    {isOverdue && (
                      <div className="bg-rose-50 border border-rose-100 rounded-lg px-2 py-1 flex items-center justify-between text-[10px] text-rose-700 font-semibold">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                          Overdue by {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentModalDoc(doc);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-all"
                          >
                            Record payment
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartialModalDoc(doc);
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-all"
                          >
                            Part payment
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Partial Payment Progress Bar */}
                    {doc.status === 'partial' && (
                      <div className="bg-amber-50/60 border border-amber-200/70 rounded-lg p-1.5 flex flex-col gap-1">
                        <div className="flex justify-between text-[9px] font-bold text-amber-900">
                          <span>
                            Paid: {doc.currency || data.userProfile.defaultCurrency || 'FJD'} ${(doc.partiallyPaidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-amber-700">
                            Remaining: {doc.currency || data.userProfile.defaultCurrency || 'FJD'} ${Math.max(0, doc.total - (doc.partiallyPaidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="w-full bg-amber-200/80 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-amber-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(5, ((doc.partiallyPaidAmount || 0) / (doc.total || 1)) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          
          {/* Retainer Summary Metric Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Active</span>
              <span className="text-base font-black text-slate-800 mt-0.5 block">{retainerMetrics.activeCount}</span>
              <span className="text-[8.5px] text-slate-400 mt-0.5 block">Client retainers</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Monthly</span>
              <span className="text-xs font-black text-sky-700 mt-0.5 block font-mono">
                {data.userProfile.defaultCurrency} ${retainerMetrics.mrr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-[8.5px] text-emerald-600 font-bold mt-0.5 block">Recurring revenue</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Yearly</span>
              <span className="text-xs font-black text-slate-800 mt-0.5 block font-mono">
                {data.userProfile.defaultCurrency} ${retainerMetrics.arr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-[8.5px] text-slate-400 mt-0.5 block">Projected</span>
            </div>
          </div>

          {/* Bula AI Automated Billing Run Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-900 text-white p-4 rounded-2xl shadow-md border border-slate-700/40 space-y-3 text-left relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-500/30">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </span>
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-400">Retainer billing</h4>
                  <p className="text-[10px] text-slate-300 leading-normal">
                    Checks your retainers and creates tax invoices, with {data.userProfile.defaultVatRate ?? 12.5}% VAT, for any that are due.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
              <button
                onClick={() => processAutoRetainerBilling(false)}
                className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-extrabold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Bill due retainers</span>
              </button>
              
              <button
                onClick={handleNewRetainer}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Retainers Filter & Search Bar */}
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={retainerSearch}
                onChange={(e) => setRetainerSearch(e.target.value)}
                placeholder="Search by client or project"
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                {(['all', 'active', 'paused'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setRetainerFilterStatus(st)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize transition-all cursor-pointer ${
                      retainerFilterStatus === st
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {st === 'all' ? 'All' : st}
                  </button>
                ))}
              </div>

              <span className="text-[10px] text-slate-400 font-bold">
                {filteredRetainers.length} retainer{filteredRetainers.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Retainers List Renderer */}
          {filteredRetainers.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <RefreshCw className="w-8 h-8 text-slate-300 mx-auto stroke-1" />
              <p className="text-xs text-slate-500 font-medium">No retainers here yet. Add one to bill a client on a schedule.</p>
              <button
                onClick={handleNewRetainer}
                className="mt-2 text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 px-3 rounded-xl cursor-pointer shadow-xs inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New retainer
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-left">
              {filteredRetainers.map((ret) => {
                const client = data.clients.find(c => c.id === ret.clientId);
                const schedule = getNextBillingSchedule(ret);
                const linkedProject = ret.projectId ? (data.projects || []).find(p => p.id === ret.projectId) : null;
                const isExpanded = expandedRetainerId === ret.id;
                
                // Past generated invoices
                const generatedDocs = (ret.generatedDocIds || [])
                  .map(docId => data.documents.find(d => d.id === docId))
                  .filter((d): d is CRMDocument => Boolean(d));

                // Retainer subtotal & total
                const lineItems = ret.items && ret.items.length > 0 
                  ? ret.items 
                  : [{ id: 'item-def', name: ret.projectName || 'Monthly retainer', quantity: 1, rate: ret.amount, total: ret.amount }];
                const subtotal = lineItems.reduce((acc, it) => acc + (it.total || it.quantity * it.rate), 0);
                const vatRate = retainerVatRate(data);
                const vatAmount = subtotal * (vatRate / 100);
                const totalWithVat = subtotal + vatAmount;

                return (
                  <div 
                    key={ret.id} 
                    className={`bg-white p-4 rounded-2xl border transition-all space-y-3 ${
                      ret.status === 'active' ? 'border-slate-150 shadow-xs hover:border-sky-200' : 'border-slate-200/60 opacity-85'
                    }`}
                  >
                    {/* Header: Client & Title */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-black text-slate-800 truncate">{client?.name || 'Unknown client'}</h4>
                          {linkedProject && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-bold truncate max-w-[120px]">
                              {linkedProject.name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500 truncate mt-0.5">
                          {ret.projectName}
                        </p>
                      </div>

                      {/* Status and Active Toggle */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleToggleRetainerStatus(ret)}
                          className={`px-2 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 cursor-pointer transition-all ${
                            ret.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100' 
                              : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${ret.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {ret.status}
                        </button>
                      </div>
                    </div>

                    {/* Schedule & Price Details Box */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl text-[10px]">
                      <div>
                        <span className="text-slate-400 block uppercase text-[8px] font-black tracking-wider">Schedule</span>
                        <span className="font-bold text-slate-700 mt-0.5 block capitalize flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-sky-600" />
                          {ret.interval === 'quarterly' ? 'Quarterly' :
                           ret.interval === 'bi-weekly' ? 'Fortnightly' :
                           ret.interval === 'annual' ? 'Yearly' :
                           `Monthly (day ${ret.billingDay || 1})`}
                        </span>
                        <span className="text-[8.5px] text-slate-400 block mt-0.5">
                          Terms: net {ret.paymentTermsDays || 14} days
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 block uppercase text-[8px] font-black tracking-wider">Amount</span>
                        <span className="font-black text-slate-900 mt-0.5 block font-mono text-xs text-sky-700">
                          {data.userProfile.defaultCurrency} ${totalWithVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[8.5px] text-slate-400 block mt-0.5">
                          incl. {vatRate}% Fiji VAT
                        </span>
                      </div>

                      {/* Timeline & Next Cycle */}
                      <div className="col-span-2 pt-2 border-t border-slate-200/60 flex flex-wrap justify-between items-center text-[9px] gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold ${
                            schedule.isDue 
                              ? 'bg-rose-100 text-rose-700 font-extrabold animate-pulse' 
                              : ret.status === 'paused' 
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-sky-100 text-sky-800'
                          }`}>
                            {schedule.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-slate-500">
                          <span>Auto-invoice:</span>
                          <button
                            onClick={() => handleToggleAutoGenerate(ret)}
                            className={`px-1.5 py-0.2 rounded font-extrabold text-[8px] cursor-pointer transition-all ${
                              ret.autoGenerate ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {ret.autoGenerate ? 'On' : 'Off'}
                          </button>
                        </div>
                      </div>

                      {/* Last Billed Info */}
                      <div className="col-span-2 text-[8.5px] text-slate-400 italic flex justify-between">
                        <span>Started: {ret.startDate} {ret.endDate ? `• Ends: ${ret.endDate}` : ''}</span>
                        <span>{ret.lastGeneratedDate ? `Last billed: ${ret.lastGeneratedDate}` : 'Not billed yet'}</span>
                      </div>
                    </div>

                    {/* Itemized Line Items summary */}
                    <div className="space-y-1 bg-white/60 p-2 rounded-lg border border-slate-100">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">Line items</span>
                      {lineItems.map((item, idx) => (
                        <div key={item.id || idx} className="flex justify-between text-[10px] text-slate-600">
                          <span className="truncate pr-2 font-medium">• {item.name} ({item.quantity}x)</span>
                          <span className="font-mono font-bold shrink-0">
                            {data.userProfile.defaultCurrency} ${(item.total || item.quantity * item.rate).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Collapsible History of Generated Invoices */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedRetainerId(isExpanded ? null : ret.id)}
                        className="w-full text-left flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-800 font-bold py-1 px-1 rounded transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Invoices ({generatedDocs.length})
                        </span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-sky-200">
                          {generatedDocs.length === 0 ? (
                            <p className="text-[9.5px] text-slate-400 italic py-1">
                              No invoices yet. Tap "Bill now" or wait for the next billing date.
                            </p>
                          ) : (
                            generatedDocs.map(gDoc => (
                              <div
                                key={gDoc.id}
                                onClick={() => setSelectedDoc(gDoc)}
                                className="bg-slate-50 hover:bg-sky-50/80 p-2 rounded-xl border border-slate-100 flex justify-between items-center text-[10px] cursor-pointer transition-all"
                              >
                                <div>
                                  <span className="font-bold text-slate-800 block">#{gDoc.documentNumber}</span>
                                  <span className="text-[8.5px] text-slate-400">{gDoc.issueDate}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                    gDoc.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                                  }`}>
                                    {gDoc.status}
                                  </span>
                                  <span className="font-mono font-bold text-slate-700">
                                    {data.userProfile.defaultCurrency} ${gDoc.total.toLocaleString()}
                                  </span>
                                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Row */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          onClick={() => handleEditRetainer(ret)}
                          className="text-sky-600 hover:text-sky-700 font-bold cursor-pointer"
                        >
                          Edit
                        </button>
                        <span className="text-slate-200">|</span>
                        <button
                          onClick={() => handleDeleteRetainer(ret.id)}
                          className="text-rose-500 hover:text-rose-600 font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>

                      <button
                        onClick={() => handleTriggerRetainerInvoice(ret)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-1.5 px-3 rounded-xl text-[10.5px] flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Bill now</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Creator/Editor Document Modal Overlay */}
      {showEditor && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] sm:max-h-[88vh] border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-left min-w-0"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide truncate">
                <FileText className="w-4 h-4 text-sky-600 shrink-0" /> 
                <span>{editingDoc ? `Edit ${docType}` : `New ${docType}`}</span>
              </h3>
              <button 
                onClick={() => setShowEditor(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full bg-slate-50 cursor-pointer shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="doc-editor-form" onSubmit={handleSubmitDocument} className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 py-3 space-y-3.5 scrollbar-none text-xs text-slate-600 min-w-0 w-full">
              {/* Document Type Selector (only if creating new) */}
              {!editingDoc && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Type</label>
                  <div className="grid grid-cols-3 gap-1 mt-1 bg-slate-100 p-1 rounded-xl">
                    {(['quote', 'invoice', 'receipt'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setDocType(t);
                          setDocNumber(suggestDocumentNumber(t));
                          setDocStatus(t === 'receipt' ? 'paid' : 'draft');
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                          docType === t 
                            ? 'bg-white text-slate-800 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Number and Client row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="min-w-0">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Number *</label>
                  <input
                    type="text"
                    required
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    className="w-full max-w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 font-mono font-bold text-slate-800 box-border"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Client *</label>
                  <select
                    required
                    value={clientId}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setClientId(cId);
                      if (cId) {
                        const c = data.clients.find(cli => cli.id === cId);
                        if (c?.currency && !docProjectId) {
                          setDocCurrency(c.currency);
                        }
                      }
                    }}
                    className="w-full max-w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-2.5 text-xs mt-1 box-border"
                  >
                    <option value="">Choose a client</option>
                    {data.clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.currency ? `(${c.currency})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Document Status Selector */}
              <div className="min-w-0">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Status</label>
                <div className="grid grid-cols-5 gap-1 mt-1 bg-slate-100 p-1 rounded-xl">
                  {[
                    { key: 'draft', label: 'Draft', color: 'text-slate-700 bg-white shadow-xs font-bold' },
                    { key: 'sent', label: 'Sent', color: 'text-sky-700 bg-white shadow-xs font-black' },
                    { key: 'partial', label: 'Partial', color: 'text-amber-800 bg-white shadow-xs font-black' },
                    { key: 'paid', label: 'Paid', color: 'text-emerald-700 bg-white shadow-xs font-black' },
                    { key: 'cancelled', label: 'Cancelled', color: 'text-rose-700 bg-white shadow-xs font-black' }
                  ].map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setDocStatus(st.key as any)}
                      className={`py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer text-center ${
                        docStatus === st.key 
                          ? st.color 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project & Currency Association */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Project (optional)</label>
                    <select
                      value={docProjectId}
                      onChange={(e) => {
                        const pId = e.target.value;
                        setDocProjectId(pId);
                        if (pId) {
                          const p = (data.projects || []).find(prj => prj.id === pId);
                          if (p?.currency) {
                            setDocCurrency(p.currency);
                          }
                        }
                      }}
                      className="w-full max-w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-2.5 text-xs mt-1 box-border"
                    >
                      <option value="">No project</option>
                      {(data.projects || []).filter(p => p.businessId === data.activeBusinessId).map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.currency ? `(${p.currency})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">Currency *</label>
                      <button
                        type="button"
                        onClick={() => setShowFxCalculator(true)}
                        className="text-[9.5px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Calculator className="w-2.5 h-2.5" /> Calculator
                      </button>
                    </div>
                    <select
                      value={docCurrency}
                      onChange={(e) => setDocCurrency(e.target.value)}
                      className="w-full max-w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs mt-1 font-bold text-sky-900 focus:ring-1 focus:ring-sky-500 box-border cursor-pointer"
                    >
                      {activeBusiness?.workingCurrencies && activeBusiness.workingCurrencies.length > 0 && (
                        <optgroup label="Your currencies">
                          {activeBusiness.workingCurrencies.map(code => {
                            const c = SUPPORTED_CURRENCIES.find(curr => curr.code === code) || { code, name: code, symbol: '$', flag: '🌐' };
                            const customRate = activeBusiness.customExchangeRates?.[code];
                            return (
                              <option key={`biz-${c.code}`} value={c.code}>
                                {c.flag} {c.code} ({c.symbol}) - {c.name} {customRate ? `[Fixed: ${customRate} ${activeBusiness.currency || 'FJD'}]` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label="All currencies">
                        {SUPPORTED_CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.code} ({c.symbol}) - {c.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Quick Currency Selector Switcher Pills & Project Sync Status */}
                <div className="bg-sky-50/60 border border-sky-100/80 rounded-xl p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[10.5px]">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                      {activeBusiness?.workingCurrencies ? 'Your currencies:' : 'Quick pick:'}
                    </span>
                    {(activeBusiness?.workingCurrencies && activeBusiness.workingCurrencies.length > 0
                      ? activeBusiness.workingCurrencies
                      : ['FJD', 'AUD', 'USD', 'NZD', 'EUR', 'GBP']
                    ).map((code) => {
                      const isSelected = docCurrency.toUpperCase() === code;
                      const hasCustom = !!activeBusiness?.customExchangeRates?.[code];
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setDocCurrency(code)}
                          title={hasCustom ? `Agreed rate: 1 ${code} = ${activeBusiness?.customExchangeRates?.[code]} ${activeBusiness?.currency || 'FJD'}` : undefined}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 hover:bg-sky-100/70 border border-slate-200/80'
                          }`}
                        >
                          <span>{code}</span>
                          {hasCustom && (
                            <span className={`text-[7.5px] px-1 py-0 rounded font-mono ${isSelected ? 'bg-sky-800 text-white' : 'bg-sky-100 text-sky-700'}`}>
                              fx
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Project Currency Match Indicator */}
                  {docProjectId && (() => {
                    const linkedProj = (data.projects || []).find(p => p.id === docProjectId);
                    const projCur = linkedProj?.currency || 'FJD';
                    const isSynced = docCurrency.toUpperCase() === projCur.toUpperCase();
                    return (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSynced ? (
                          <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            ✓ Matches project ({projCur})
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDocCurrency(projCur)}
                            className="text-[9.5px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1 cursor-pointer transition-all"
                            title={`Project is set to ${projCur}. Click to match.`}
                          >
                            <span>Use project currency ({projCur})</span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Dates Row - Optimized to prevent horizontal overhang */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <DateInput
                  label="Issue date"
                  required
                  value={issueDate}
                  onChange={setIssueDate}
                  placeholder="Select issue date"
                  align="left"
                  customPresets={[
                    { label: 'Today', special: 'today' },
                    { label: 'Yesterday', daysOffset: -1 },
                  ]}
                />

                {docType !== 'receipt' ? (
                  <DateInput
                    label={docType === 'quote' ? 'Expiry date' : 'Due date'}
                    required
                    min={issueDate}
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Select due date"
                    align="right"
                    customPresets={[
                      { label: '+7 days', daysOffset: 7 },
                      { label: '+14 days', daysOffset: 14 },
                      { label: '+30 days', daysOffset: 30 },
                      { label: 'End of month', special: 'end_of_month' },
                    ]}
                  />
                ) : (
                  <div className="min-w-0">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Payment method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full max-w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-2.5 text-xs mt-1 box-border min-w-0"
                    >
                      <option value="M-Paisa">Vodafone M-PAiSA</option>
                      <option value="MyCash">Digicel MyCash</option>
                      <option value="Bank Transfer">Bank transfer</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Line Items Builder Section */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Line items ({items.length})</label>
                  <span className="text-[10px] font-bold text-sky-700">Currency: {docCurrency}</span>
                </div>

                {/* Add new item controller */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">From catalog</label>
                      <select
                        value={selectedCatalogItemId}
                        onChange={(e) => handleCatalogSelect(e.target.value)}
                        className="w-full bg-white border border-slate-100 rounded-lg py-1.5 px-2 text-[11px] mt-0.5"
                      >
                        <option value="">Choose an item</option>
                        <option value="custom">Custom item</option>
                        {data.services.filter(s => s.isActive !== false && (!s.businessId || s.businessId === data.activeBusinessId)).map(s => (
                          <option key={s.id} value={s.id}>{s.name} (${s.rate})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Description</label>
                      <input
                        type="text"
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                        placeholder="Service description"
                        className="w-full bg-white border border-slate-100 rounded-lg py-1.5 px-2 text-[11px] mt-0.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Qty / hours</label>
                      <input
                        type="number"
                        min={0.5}
                        step="any"
                        value={itemQty}
                        onChange={(e) => setItemQty(Number(e.target.value))}
                        className="w-full bg-white border border-slate-100 rounded-lg py-1.5 px-2 text-[11px] mt-0.5"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Rate ({docCurrency})</label>
                      <input
                        type="number"
                        min={0}
                        value={itemRate}
                        onChange={(e) => setItemRate(Number(e.target.value))}
                        className="w-full bg-white border border-slate-100 rounded-lg py-1.5 px-2 text-[11px] mt-0.5"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddItemLine}
                        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 rounded-lg text-xs transition-all text-center cursor-pointer"
                      >
                        Add line
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reimbursable expenses for this client */}
                {(() => {
                  const available = (data.expenses || []).filter(e =>
                    clientId && e.billToClientId === clientId &&
                    (!e.billedDocumentId || e.billedDocumentId === editingDoc?.id) &&
                    !items.some(it => it.expenseId === e.id)
                  );
                  if (!clientId || (available.length === 0 && !showExpensePicker)) return null;
                  return (
                    <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-amber-900">
                          {available.length} expense{available.length === 1 ? '' : 's'} to bill to this client
                        </span>
                        <button type="button" onClick={() => setShowExpensePicker(v => !v)} className="text-[11px] font-bold text-amber-900 underline cursor-pointer">
                          {showExpensePicker ? 'Close' : 'Add expenses'}
                        </button>
                      </div>
                      {showExpensePicker && (
                        <div className="space-y-2">
                          {available.map(e => (
                            <label key={e.id} className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                              <input type="checkbox" className="mt-0.5" checked={pickedExpenseIds.includes(e.id)}
                                onChange={ev => setPickedExpenseIds(ids => ev.target.checked ? [...ids, e.id] : ids.filter(x => x !== e.id))} />
                              <span className="flex-1 min-w-0">
                                <span className="font-semibold">{e.vendor}</span> · {e.date}{e.description && e.description !== e.vendor ? ` · ${e.description}` : ''}
                                {!e.receiptFile && <span className="text-amber-700"> · no receipt</span>}
                              </span>
                              <span className="font-mono shrink-0">{e.currency || docCurrency} ${e.amount.toFixed(2)}</span>
                            </label>
                          ))}
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-700">
                            <label className="flex items-center gap-1">
                              Markup
                              <input type="number" min={0} max={100} value={expenseMarkup} onChange={ev => setExpenseMarkup(Math.max(0, Number(ev.target.value) || 0))} className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5" />%
                            </label>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={expenseChargeVat} onChange={ev => setExpenseChargeVat(ev.target.checked)} />
                              Charge VAT on these
                            </label>
                            <button
                              type="button"
                              disabled={pickedExpenseIds.length === 0}
                              onClick={() => {
                                const picked = available.filter(e => pickedExpenseIds.includes(e.id));
                                setItems([...items, ...reimbursementLines(picked, { markupPercent: expenseMarkup, chargeVat: expenseChargeVat })]);
                                setPickedExpenseIds([]);
                                setShowExpensePicker(false);
                              }}
                              className="ml-auto bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold px-3 py-1 rounded-lg cursor-pointer"
                            >
                              Add {pickedExpenseIds.length || ''} to invoice
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Passed on at cost without VAT unless you tick "Charge VAT". Whether VAT applies depends on how you paid for it; check with your accountant if unsure.
                            Expenses in another currency are added at their recorded {data.userProfile.defaultCurrency || 'FJD'} amount.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Items Added Table */}
                <div className="space-y-1.5">
                  {items.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-2">No line items yet. Add one above.</p>
                  ) : (
                    items.map((it, idx) => (
                      <div key={it.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-100 flex justify-between items-center text-[11px]">
                        <div className="min-w-0 pr-2">
                          <span className="font-bold text-slate-800 block truncate">{it.name}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {isReimbursement(it) ? (it.description || 'Reimbursable expense') : `${it.quantity} x ${docCurrency} $${it.rate}`}
                          </span>
                          {isReimbursement(it) && (
                            <span className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">Reimbursable</span>
                              <label className="flex items-center gap-1 text-[10px] text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={it.taxable === true}
                                  onChange={ev => setItems(items.map(x => x.id === it.id ? { ...x, taxable: ev.target.checked } : x))} />
                                VAT
                              </label>
                              {it.receiptFileId
                                ? <button type="button" onClick={() => openOwnFile(it.receiptFileId!).catch(err => alert(err.message))} className="text-[10px] font-bold text-sky-700 underline cursor-pointer">Receipt</button>
                                : <span className="text-[10px] text-amber-700">No receipt</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700 font-mono shrink-0">
                            {docCurrency} ${it.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItemLine(it.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Taxes, Levies & Additional Fees/Surcharges Selector */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span className="text-[10.5px] font-bold text-slate-800 uppercase tracking-wider">Taxes and fees</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Tax ON / OFF Switch */}
                    <button
                      type="button"
                      onClick={() => setIsTaxExempt(!isTaxExempt)}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all border cursor-pointer ${
                        !isTaxExempt
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100/60'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/60'
                      }`}
                      title={!isTaxExempt ? 'Tax is on. Click to turn it off (tax exempt).' : 'Tax is off (exempt). Click to turn it on.'}
                    >
                      <span className={`w-2 h-2 rounded-full ${!isTaxExempt ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      <span>{!isTaxExempt ? 'Tax on' : 'Tax off (exempt)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowTaxFeeDetails(!showTaxFeeDetails)}
                      className="text-[10px] text-sky-600 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      {showTaxFeeDetails ? 'Hide options' : 'Show options'}
                      {showTaxFeeDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Notice if tax is toggled OFF */}
                {isTaxExempt && (
                  <div className="flex items-center justify-between p-2 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[10.5px] text-amber-900">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">Tax exempt:</span>
                      <span>No VAT or other taxes will be added to this document.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsTaxExempt(false)}
                      className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                    >
                      Turn on tax
                    </button>
                  </div>
                )}

                {showTaxFeeDetails && (
                  <div className="space-y-3 pt-1 border-t border-slate-200/60">
                    {/* Platform & Business Statutory Taxes */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9.5px] font-bold uppercase text-slate-400 tracking-wider block">
                          Taxes and levies
                        </span>
                        {isTaxExempt && (
                          <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">
                            (Tax is off)
                          </span>
                        )}
                      </div>
                      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${isTaxExempt ? 'opacity-50 pointer-events-none' : ''}`}>
                        {[
                          ...(data.platformTaxes || []),
                          ...(data.businessTaxes || []).filter(t => !t.businessId || t.businessId === (editingDoc?.businessId || data.activeBusinessId))
                        ].map((tax) => {
                          const isChecked = selectedTaxIds.includes(tax.id);
                          return (
                            <label
                              key={tax.id}
                              className={`flex items-center justify-between p-2 rounded-xl border text-[11px] cursor-pointer transition-all ${
                                isChecked && !isTaxExempt
                                  ? 'bg-sky-50/80 border-sky-300 text-sky-950 font-medium'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-1">
                                <input
                                  type="checkbox"
                                  disabled={isTaxExempt}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTaxIds([...selectedTaxIds, tax.id]);
                                    } else {
                                      setSelectedTaxIds(selectedTaxIds.filter(id => id !== tax.id));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                                />
                                <span className="truncate">{tax.name}</span>
                              </div>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                                {tax.rateType === 'flat' ? `$${tax.rate}` : `${tax.rate}%`}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Platform & Business Surcharges & Fees */}
                    <div>
                      <span className="text-[9.5px] font-bold uppercase text-slate-400 tracking-wider block mb-1.5">
                        Fees and surcharges
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {[
                          ...(data.platformFees || []),
                          ...(data.businessFees || []).filter(f => !f.businessId || f.businessId === (editingDoc?.businessId || data.activeBusinessId))
                        ].map((fee) => {
                          const isChecked = selectedFeeIds.includes(fee.id);
                          return (
                            <label
                              key={fee.id}
                              className={`flex items-center justify-between p-2 rounded-xl border text-[11px] cursor-pointer transition-all ${
                                isChecked
                                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-medium'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedFeeIds([...selectedFeeIds, fee.id]);
                                    } else {
                                      setSelectedFeeIds(selectedFeeIds.filter(id => id !== fee.id));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                />
                                <span className="truncate">{fee.name}</span>
                              </div>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                                {fee.rateType === 'flat' ? `$${fee.rate}` : `${fee.rate}%`}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Calculation Breakdown */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span className="font-mono">{docCurrency} ${totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>

                  {totals.reimbursementsNoVat > 0 && (
                    <div className="flex justify-between text-amber-800 text-[11px]">
                      <span>Includes reimbursable expenses (no VAT)</span>
                      <span className="font-mono">{docCurrency} ${totals.reimbursementsNoVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {isTaxExempt ? (
                    <div className="flex justify-between text-amber-700 text-[11px] font-medium">
                      <span>Tax (exempt)</span>
                      <span className="font-mono">{docCurrency} $0.00</span>
                    </div>
                  ) : (
                    totals.appliedTaxes.map((tax) => (
                      <div key={tax.id} className="flex justify-between text-sky-800 text-[11px]">
                        <span>{tax.name} ({tax.rateType === 'flat' ? `$${tax.rate}` : `${tax.rate}%`})</span>
                        <span className="font-mono">{docCurrency} ${tax.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))
                  )}

                  {totals.appliedFees.map((fee) => (
                    <div key={fee.id} className="flex justify-between text-emerald-800 text-[11px]">
                      <span>{fee.name} ({fee.rateType === 'flat' ? `$${fee.rate}` : `${fee.rate}%`})</span>
                      <span className="font-mono">{docCurrency} ${fee.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}

                  <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Total</span>
                    <span className="font-mono text-sky-700">{docCurrency} ${totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Terms and notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1"
                />
              </div>
            </form>

            {/* Fixed Bottom Action Bar */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200/80 shrink-0 flex gap-2.5 z-10">
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs text-center transition-all cursor-pointer shadow-xs active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="doc-editor-form"
                className="flex-1 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-bold py-2.5 rounded-xl text-xs text-center transition-all shadow-md shadow-sky-600/20 cursor-pointer active:scale-95"
              >
                {editingDoc ? 'Save' : 'Create'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Interactive PDF Document Viewer Overlay */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 flex items-end justify-center">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="bg-slate-100 rounded-t-[2.5rem] w-full max-w-md h-[92vh] shadow-2xl flex flex-col overflow-hidden text-left"
            >
              {/* Sheet Bar Menu */}
              <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Preview
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEmailModalDoc(selectedDoc)}
                    title="Email to client"
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email</span>
                  </button>
                  <button
                    onClick={() => handleOpenPdfModal(selectedDoc)}
                    title="Download PDF"
                    className="flex items-center gap-1 bg-sky-600 hover:bg-sky-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                  <button
                    onClick={() => handleEditDocument(selectedDoc)}
                    title="Edit"
                    className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    title="Print"
                    className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleShareDoc(selectedDoc)}
                    title="Share link"
                    className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full bg-slate-100 ml-1 cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Visual PDF Mockup Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
                
                {/* Cancellation Banner if Document is Cancelled */}
                {selectedDoc.status === 'cancelled' && (
                  <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-xs text-rose-900 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold flex items-center gap-1.5 text-rose-700">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Cancelled
                      </span>
                      {selectedDoc.cancelledAt && (
                        <span className="text-[10px] text-rose-600 font-medium">
                          {selectedDoc.cancelledAt.split('T')[0]}
                        </span>
                      )}
                    </div>
                    {selectedDoc.cancellationReason && (
                      <p className="text-[11px] text-rose-800">
                        <span className="font-bold">Reason:</span> {selectedDoc.cancellationReason}
                      </p>
                    )}
                    {selectedDoc.creditNoteNumber && (
                      <p className="text-[10.5px] text-rose-700 font-mono font-bold">
                        Credit note: #{selectedDoc.creditNoteNumber}
                      </p>
                    )}
                    <div className="pt-1.5 flex gap-2">
                      <button
                        onClick={() => handleDirectStatusChange(selectedDoc, 'draft')}
                        className="bg-white hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold px-2.5 py-1 rounded-lg text-[10px] transition-all cursor-pointer"
                      >
                        Restore as draft
                      </button>
                    </div>
                  </div>
                )}

                {/* Overdue Warning in Drawer */}
                {selectedDoc.type === 'invoice' && selectedDoc.status !== 'paid' && selectedDoc.status !== 'cancelled' && selectedDoc.dueDate && selectedDoc.dueDate < todayStr && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex items-center justify-between text-xs text-rose-800 animate-pulse">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-extrabold block">Payment overdue</span>
                        <span className="text-[10px] text-rose-600">
                          Was due on {selectedDoc.dueDate}. Follow up with the client or record a payment.
                        </span>
                        {(selectedDoc.remindersSent || []).length > 0 && (
                          <span className="text-[10px] text-rose-700 font-semibold block">
                            Reminders sent: {(selectedDoc.remindersSent || []).map(r => `${r.level === 1 ? 'friendly' : r.level === 2 ? 'second' : 'final'} on ${r.sentAt.slice(0, 10)}`).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentModalDoc(selectedDoc)}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-all cursor-pointer whitespace-nowrap shadow-xs"
                    >
                      Record payment
                    </button>
                  </div>
                )}

                {/* Partial Payment Summary Card in Drawer */}
                {selectedDoc.status === 'partial' && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center text-xs text-amber-900 font-bold">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Partially paid
                      </span>
                      <button
                        type="button"
                        onClick={() => setPartialModalDoc(selectedDoc)}
                        className="text-[10px] text-amber-800 underline font-bold hover:text-amber-950 cursor-pointer"
                      >
                        Edit payment
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Amount received</span>
                        <span className="font-extrabold text-emerald-700">
                          {selectedDoc.currency || data.userProfile.defaultCurrency || 'FJD'} ${(selectedDoc.partiallyPaidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Balance due</span>
                        <span className="font-extrabold text-amber-800">
                          {selectedDoc.currency || data.userProfile.defaultCurrency || 'FJD'} ${Math.max(0, selectedDoc.total - (selectedDoc.partiallyPaidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-amber-200/70 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, ((selectedDoc.partiallyPaidAmount || 0) / (selectedDoc.total || 1)) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Quick Status Transition Stepper & Toolbar */}
                {selectedDoc.status !== 'cancelled' && (
                  <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        selectedDoc.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                        selectedDoc.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                        selectedDoc.status === 'sent' ? 'bg-sky-100 text-sky-800' :
                        selectedDoc.status === 'accepted' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {selectedDoc.status === 'partial' ? 'Partially paid' : selectedDoc.status}
                      </span>
                    </div>

                    {/* 4-State Interactive Stepper Toggle */}
                    <div className="grid grid-cols-4 gap-1 bg-white p-1 rounded-xl border border-slate-200/60 shadow-2xs">
                      {(['draft', 'sent', 'partial', 'paid'] as const).map((st) => {
                        const isCurrent = selectedDoc.status === st;
                        let activeStyle = 'bg-slate-800 text-white shadow-xs';
                        if (st === 'draft') activeStyle = 'bg-slate-700 text-white shadow-xs';
                        if (st === 'sent') activeStyle = 'bg-sky-600 text-white shadow-xs';
                        if (st === 'partial') activeStyle = 'bg-amber-600 text-white shadow-xs';
                        if (st === 'paid') activeStyle = 'bg-emerald-600 text-white shadow-xs';

                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              if (st === 'partial') {
                                setPartialModalDoc(selectedDoc);
                              } else {
                                handleDirectStatusChange(selectedDoc, st);
                              }
                            }}
                            className={`py-1.5 px-1 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                              isCurrent ? activeStyle : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <span>{st}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Secondary Context Actions */}
                    <div className="flex items-center gap-1.5 pt-1 justify-end flex-wrap">
                      {selectedDoc.status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalDoc(selectedDoc)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                          title="Record a payment in any currency, with exchange rate and fees"
                        >
                          <DollarSign className="w-3 h-3" /> Record payment
                        </button>
                      )}

                      {selectedDoc.type === 'invoice' && selectedDoc.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleOpenCancelModal(selectedDoc)}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold px-2 py-1 rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Visual conversion banner */}
                {selectedDoc.type !== 'receipt' && selectedDoc.type !== 'credit_note' && selectedDoc.status !== 'paid' && selectedDoc.status !== 'cancelled'
                  && !(selectedDoc.type === 'quote' && data.documents.some(d => d.sourceQuoteId === selectedDoc.id && !d.isDeposit)) && (
                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl flex items-center justify-between text-xs text-amber-800">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
                      Ready for the next step?
                    </span>
                    <button
                      onClick={() => handleQuickConvert(selectedDoc)}
                      className="bg-amber-600 text-white font-bold py-1 px-2.5 rounded-lg text-[10px] hover:bg-amber-700 transition-all flex items-center gap-0.5 cursor-pointer"
                    >
                      Convert to {selectedDoc.type === 'quote' ? 'invoice' : 'receipt'} <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Deposit for a booking */}
                {selectedDoc.type === 'quote' && (selectedDoc.status === 'sent' || selectedDoc.status === 'accepted') && depositAmount(selectedDoc) && (() => {
                  const existing = data.documents.find(d => d.isDeposit && d.sourceQuoteId === selectedDoc.id && d.status !== 'cancelled');
                  return (
                    <div className="bg-violet-50 border border-violet-100 p-3 rounded-2xl flex items-center justify-between gap-2 text-xs text-violet-900">
                      <span className="font-semibold">{existing ? `Deposit invoice #${existing.documentNumber} (${existing.status})` : `Deposit: ${selectedDoc.currency || data.userProfile.defaultCurrency || 'FJD'} ${depositAmount(selectedDoc)!.toFixed(2)} before VAT`}</span>
                      {existing ? (
                        <button onClick={() => setSelectedDoc(existing)} className="bg-white border border-violet-200 font-bold py-1 px-2.5 rounded-lg text-[10px] cursor-pointer">Open</button>
                      ) : (
                        <button onClick={() => handleCreateDepositInvoice(selectedDoc)} className="bg-violet-600 text-white font-bold py-1 px-2.5 rounded-lg text-[10px] hover:bg-violet-700 cursor-pointer">Create deposit invoice</button>
                      )}
                    </div>
                  );
                })()}

                {/* Make this a recurring retainer quick action banner */}
                {selectedDoc.type === 'invoice' && (
                  <div className="bg-sky-50 border border-sky-100 p-3 rounded-2xl flex items-center justify-between text-xs text-sky-800">
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <RefreshCw className="w-4 h-4 text-sky-600 shrink-0" />
                      <span className="font-semibold text-[11px] truncate">Bill this client on a schedule?</span>
                    </div>
                    <button
                      onClick={() => handleConvertInvoiceToRetainer(selectedDoc)}
                      className="bg-sky-600 text-white font-bold py-1 px-2.5 rounded-lg text-[10px] hover:bg-sky-700 transition-all shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Make retainer
                    </button>
                  </div>
                )}

                {/* Printable Invoice Container */}
                <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-md space-y-5 print:p-0 font-sans text-slate-600 text-[11px] leading-relaxed relative">
                  
                  {/* Business Branding Ribbon */}
                  {(() => {
                    const docBiz = data.businesses.find(b => b.id === selectedDoc.businessId) || activeBusiness;
                    return (
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {(!docBiz?.logoType || docBiz?.logoType === 'symbol') && (
                              <div 
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: docBiz?.colorTheme || '#0284c7' }}
                              >
                                {docBiz?.logoSymbol === 'Briefcase' && <Briefcase className="w-4.5 h-4.5" />}
                                {docBiz?.logoSymbol === 'Building2' && <Building2 className="w-4.5 h-4.5" />}
                                {docBiz?.logoSymbol === 'ShieldCheck' && <ShieldCheck className="w-4.5 h-4.5" />}
                                {docBiz?.logoSymbol === 'Sparkles' && <Sparkles className="w-4.5 h-4.5" />}
                                {(!docBiz?.logoSymbol || docBiz?.logoSymbol === 'Waves') && <Waves className="w-4.5 h-4.5" />}
                              </div>
                            )}
                            {docBiz?.logoType === 'text' && (
                              <div 
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white tracking-wider shrink-0"
                                style={{ backgroundColor: docBiz?.colorTheme || '#0284c7' }}
                              >
                                {docBiz?.logoText || 'LOGO'}
                              </div>
                            )}
                            {docBiz?.logoType === 'image' && docBiz?.logoUrl && (
                              <img 
                                src={docBiz.logoUrl} 
                                alt="Logo" 
                                className="h-8 w-auto object-contain shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <h3 className="font-extrabold text-slate-800 text-sm">{docBiz?.name || data.userProfile.name}</h3>
                          </div>
                          {tradingAsLine(docBiz) && <p className="text-slate-600 text-[10px]">{tradingAsLine(docBiz)}</p>}
                          <p className="text-slate-400 text-[10px]">{docBiz?.address || ''}</p>
                          <p className="text-slate-400 text-[10px]">TIN: <span className="font-mono font-bold text-slate-700">{docBiz?.tin || data.userProfile.tin}</span></p>
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <span className="font-mono font-black text-xs text-sky-700 uppercase block tracking-wider">
                            {selectedDoc.type === 'invoice' ? 'TAX INVOICE' : selectedDoc.type.toUpperCase()}
                          </span>
                          <span className="font-mono font-bold text-slate-800 text-xs mt-0.5 block">{numberLabel(selectedDoc.documentNumber)}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 block">Issued: {selectedDoc.issueDate}</span>
                          {selectedDoc.dueDate && (
                            <span className="text-[10px] text-slate-400 block">Due: {selectedDoc.dueDate}</span>
                          )}

                          {/* Autogenerated QR Code for Document Verification & Online Pay */}
                          <div 
                            onClick={() => setShowOnlineDocModal(true)}
                            className="mt-2 bg-slate-50 hover:bg-sky-50/80 p-1.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col items-center gap-0.5 cursor-pointer transition-all hover:scale-105"
                            title="Open online version"
                          >
                            <QRCodeSVG
                              value={documentPublicUrl(selectedDoc) || 'Save the document to get its link'}
                              size={52}
                              level="M"
                            />
                            <span className="text-[7px] font-mono font-black text-sky-800 uppercase tracking-tighter flex items-center gap-0.5">
                              <ExternalLink className="w-2 h-2" /> Scan or view online
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bill To */}
                  {(() => {
                    const client = data.clients.find(c => c.id === selectedDoc.clientId);
                    return (
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Bill to</span>
                        <h4 className="font-bold text-slate-800 text-xs mt-0.5">{client?.name || 'Client'}</h4>
                        <p className="text-slate-500 text-[10px]">{client?.email}</p>
                        <p className="text-slate-500 text-[10px]">{client?.phone}</p>
                        {client?.tin && <p className="text-slate-500 text-[10px]">TIN: <span className="font-mono font-bold">{client.tin}</span></p>}
                      </div>
                    );
                  })()}

                  {/* Items List */}
                  <div className="space-y-2">
                    <div className="border-b border-slate-200 pb-1 flex justify-between text-[9px] font-bold uppercase text-slate-400">
                      <span>Description</span>
                      <span>Total</span>
                    </div>

                    {selectedDoc.items.map((it, idx) => (
                      <div key={it.id || idx} className="flex justify-between items-center py-1 border-b border-slate-50">
                        <div>
                          <span className="font-bold text-slate-700 block">{it.name}</span>
                          {isReimbursement(it) ? (
                            <span className="text-[9.5px] text-slate-400 block">
                              <span className="font-bold text-amber-800">Reimbursable{it.taxable ? '' : ', no VAT'}</span>
                              {it.description ? ` · ${it.description}` : ''}
                              {it.receiptFileId && <> · <button type="button" onClick={() => openOwnFile(it.receiptFileId!).catch(err => alert(err.message))} className="underline text-sky-700 cursor-pointer">receipt</button></>}
                            </span>
                          ) : (
                            <span className="text-[9.5px] text-slate-400">{it.quantity} x {selectedDoc.currency || data.userProfile.defaultCurrency} ${it.rate}</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-800">
                          {selectedDoc.currency || data.userProfile.defaultCurrency} ${it.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Totals Calculation */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200 text-[10px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal:</span>
                      <span className="font-mono">{selectedDoc.currency || data.userProfile.defaultCurrency} ${selectedDoc.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    {selectedDoc.appliedTaxes && selectedDoc.appliedTaxes.length > 0 ? (
                      selectedDoc.appliedTaxes.map((tax) => (
                        <div key={tax.id} className="flex justify-between text-sky-800">
                          <span>{tax.name} ({tax.rateType === 'flat' ? `$${tax.rate}` : `${tax.rate}%`}):</span>
                          <span className="font-mono">{selectedDoc.currency || data.userProfile.defaultCurrency} ${tax.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between text-slate-500">
                        <span>Fiji VAT ({selectedDoc.vatRate || 12.5}%):</span>
                        <span className="font-mono">{selectedDoc.currency || data.userProfile.defaultCurrency} ${(selectedDoc.vatAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {selectedDoc.appliedFees && selectedDoc.appliedFees.length > 0 && (
                      selectedDoc.appliedFees.map((fee) => (
                        <div key={fee.id} className="flex justify-between text-emerald-800">
                          <span>{fee.name} ({fee.rateType === 'flat' ? `$${fee.rate}` : `${fee.rate}%`}):</span>
                          <span className="font-mono">{selectedDoc.currency || data.userProfile.defaultCurrency} ${fee.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))
                    )}

                    <div className="flex justify-between text-slate-900 font-black text-xs pt-1.5 border-t border-slate-200">
                      <span>Total due:</span>
                      <span className="font-mono text-sky-700">{selectedDoc.currency || data.userProfile.defaultCurrency} ${selectedDoc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Bank Details */}
                  {activeBusiness?.bankDetails && (
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[9px] text-slate-500">
                      <span className="font-bold text-slate-700 uppercase block mb-0.5">Bank details:</span>
                      <p className="whitespace-pre-line leading-tight font-mono">{activeBusiness.bankDetails}</p>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedDoc.notes && (
                    <div className="text-[9.5px] text-slate-400">
                      <span className="font-bold text-slate-500 block">Terms and notes:</span>
                      <p className="mt-0.5 leading-tight">{selectedDoc.notes}</p>
                    </div>
                  )}

                  {/* Payment Records & Attachments Section */}
                  <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                    <PaymentAttachmentWidget
                      attachments={selectedDoc.paymentAttachments || []}
                      onChange={(newAtts) => {
                        const updated = {
                          ...selectedDoc,
                          paymentAttachments: newAtts,
                          updatedAt: new Date().toISOString()
                        };
                        const updatedDocs = data.documents.map(d => d.id === selectedDoc.id ? updated : d);
                        onUpdateData({
                          ...data,
                          documents: updatedDocs
                        });
                        setSelectedDoc(updated);
                        setShareToast(`Updated attachments for #${selectedDoc.documentNumber}`);
                        setTimeout(() => setShareToast(null), 3000);
                      }}
                      title="Proof of payment"
                      description="Receipts, M-PAiSA screenshots, transfer slips or bank confirmations for this document."
                      allowCamera={true}
                    />
                  </div>
                </div>
              </div>

              {/* Sheet actions footer */}
              <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleOpenPdfModal(selectedDoc)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-xl text-xs text-center transition-all shadow-md shadow-slate-900/10 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-sky-400" />
                    PDF
                  </button>
                  <button
                    onClick={() => setEmailModalDoc(selectedDoc)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-xs text-center transition-all shadow-md shadow-emerald-600/15 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    Email
                  </button>
                  <button
                    onClick={() => setShowOnlineDocModal(true)}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-black py-2.5 rounded-xl text-xs text-center transition-all shadow-md shadow-sky-600/15 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                    Portal
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditDocument(selectedDoc)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs text-center transition-all cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteDoc(selectedDoc.id)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-2 px-3 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Retainer Schedule Creator / Editor Modal */}
      {showRetainerEditor && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] sm:max-h-[88vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden text-left min-w-0"
          >
            <div className="flex justify-between items-center p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wide truncate">
                <RefreshCw className="w-4 h-4 text-sky-500 shrink-0" />
                <span>{editingRetainer ? 'Edit retainer' : 'New retainer'}</span>
              </h3>
              <button 
                onClick={() => setShowRetainerEditor(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer shrink-0 ml-2"
              >
                ✕
              </button>
            </div>

            <form id="retainer-editor-form" onSubmit={handleSubmitRetainer} className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 py-3 space-y-3.5 text-xs text-slate-600 min-w-0 w-full scrollbar-none">
              
              {/* Business Venture and Client Selection */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Business</label>
                  <select
                    value={retBusinessId}
                    onChange={(e) => setRetBusinessId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-2.5 text-xs mt-1"
                  >
                    {data.businesses.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client *</label>
                  <select
                    required
                    value={retClientId}
                    onChange={(e) => setRetClientId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-2.5 text-xs mt-1"
                  >
                    <option value="">Choose a client</option>
                    {data.clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Retainer Plan Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Retainer name *</label>
                <input
                  type="text"
                  required
                  value={retProjectName}
                  onChange={(e) => setRetProjectName(e.target.value)}
                  placeholder="e.g. Monthly website maintenance"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 font-semibold text-slate-800"
                />
              </div>

              {/* Linked Project & Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project (optional)</label>
                  <select
                    value={retProjectId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setRetProjectId(pId);
                      if (pId) {
                        const p = (data.projects || []).find(prj => prj.id === pId);
                        if (p?.currency) setRetCurrency(p.currency);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1"
                  >
                    <option value="">No project</option>
                    {(data.projects || []).filter(p => !retBusinessId || p.businessId === retBusinessId).map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.currency ? `(${p.currency})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Currency *</label>
                    <button
                      type="button"
                      onClick={() => setShowFxCalculator(true)}
                      className="text-[9.5px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      <Calculator className="w-2.5 h-2.5" /> Calculator
                    </button>
                  </div>
                  <select
                    value={retCurrency}
                    onChange={(e) => setRetCurrency(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-150 rounded-xl py-2 px-3 text-xs mt-1 font-bold text-sky-800"
                  >
                    {SUPPORTED_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.symbol}) - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Schedule Frequency & Billing Day */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Billing interval *</label>
                  <select
                    value={retInterval}
                    onChange={(e) => setRetInterval(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 font-bold text-slate-800"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly (every 3 months)</option>
                    <option value="bi-weekly">Fortnightly</option>
                    <option value="annual">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {retInterval === 'monthly' ? 'Day of month (1–28) *' : 'Billing day'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={28}
                    value={retBillingDay}
                    onChange={(e) => setRetBillingDay(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Payment Terms & Auto-Send Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment terms</label>
                  <select
                    value={retPaymentTermsDays}
                    onChange={(e) => setRetPaymentTermsDays(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1"
                  >
                    <option value={7}>Net 7 days</option>
                    <option value={14}>Net 14 days</option>
                    <option value={30}>Net 30 days</option>
                    <option value={0}>Due on receipt</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">New invoices</label>
                  <select
                    value={retAutoSendMode}
                    onChange={(e) => setRetAutoSendMode(e.target.value as 'draft' | 'sent')}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1"
                  >
                    <option value="sent">Mark as sent</option>
                    <option value="draft">Save as draft to review</option>
                  </select>
                </div>
              </div>

              {/* Start Date & End Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <DateInput
                  label="Start date"
                  required
                  value={retStartDate}
                  onChange={setRetStartDate}
                  placeholder="Select start date"
                  align="left"
                  customPresets={[
                    { label: 'Today', special: 'today' },
                    { label: '1st of next month', monthsOffset: 1 },
                  ]}
                />

                <DateInput
                  label="End date (optional)"
                  min={retStartDate}
                  value={retEndDate}
                  onChange={setRetEndDate}
                  placeholder="No end date"
                  align="right"
                  customPresets={[
                    { label: '+6 months', monthsOffset: 6 },
                    { label: '+1 year', monthsOffset: 12 },
                  ]}
                />
              </div>

              {/* Itemized Retainer Line Items Builder */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Line items ({retItems.length})
                  </label>
                </div>

                {/* Line item inputs */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[8.5px] font-bold text-slate-400 uppercase">From catalog</label>
                      <select
                        value={retSelectedCatalogItemId}
                        onChange={(e) => handleRetCatalogSelect(e.target.value)}
                        className="w-full bg-white border border-slate-100 rounded-lg py-1 px-2 text-[10px] mt-0.5"
                      >
                        <option value="">Choose a service</option>
                        <option value="custom">Custom item</option>
                        {data.services.filter(s => s.isActive !== false && (!s.businessId || s.businessId === (retBusinessId || data.activeBusinessId))).map(s => (
                          <option key={s.id} value={s.id}>{s.name} (${s.rate})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[8.5px] font-bold text-slate-400 uppercase">Description</label>
                      <input
                        type="text"
                        value={retItemName}
                        onChange={(e) => setRetItemName(e.target.value)}
                        placeholder="e.g. 10-hour retainer package"
                        className="w-full bg-white border border-slate-100 rounded-lg py-1 px-2 text-[10px] mt-0.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[8.5px] font-bold text-slate-400 uppercase">Quantity</label>
                      <input
                        type="number"
                        min={0.5}
                        step="any"
                        value={retItemQty}
                        onChange={(e) => setRetItemQty(Number(e.target.value))}
                        className="w-full bg-white border border-slate-100 rounded-lg py-1 px-2 text-[10px] mt-0.5"
                      />
                    </div>

                    <div>
                      <label className="block text-[8.5px] font-bold text-slate-400 uppercase">Rate ({data.userProfile.defaultCurrency})</label>
                      <input
                        type="number"
                        min={0}
                        value={retItemRate}
                        onChange={(e) => setRetItemRate(Number(e.target.value))}
                        className="w-full bg-white border border-slate-100 rounded-lg py-1 px-2 text-[10px] mt-0.5"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddRetItemLine}
                        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 rounded-lg text-[10px] transition-all cursor-pointer text-center"
                      >
                        + Add item
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items Added List */}
                <div className="space-y-1.5">
                  {retItems.map((it, idx) => (
                    <div key={it.id || idx} className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex justify-between items-center text-[10.5px]">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-800 block truncate">{it.name}</span>
                        <span className="text-[9px] text-slate-400">
                          {it.quantity} x {data.userProfile.defaultCurrency} ${it.rate}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">
                          ${(it.total || it.quantity * it.rate).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRetItemLine(it.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals Summary */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500 text-[10.5px]">
                    <span>Subtotal</span>
                    <span className="font-mono font-bold">{data.userProfile.defaultCurrency} ${retCalculatedTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[10.5px]">
                    <span>Fiji {retCalculatedTotals.vatRate}% VAT</span>
                    <span className="font-mono">{data.userProfile.defaultCurrency} ${retCalculatedTotals.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-black text-slate-900 pt-1 border-t border-slate-200">
                    <span>Amount per invoice</span>
                    <span className="font-mono text-sky-700">{data.userProfile.defaultCurrency} ${retCalculatedTotals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Status and Auto Generate Toggle */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</label>
                  <select
                    value={retStatus}
                    onChange={(e) => setRetStatus(e.target.value as 'active' | 'paused')}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 font-bold text-slate-800"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>

                <div className="flex flex-col justify-center bg-slate-50 p-2 rounded-xl border border-slate-100 mt-1">
                  <span className="text-[9px] font-extrabold text-slate-700">Auto-invoice</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[8.5px] text-slate-400">Create invoices automatically</span>
                    <input
                      type="checkbox"
                      checked={retAutoGenerate}
                      onChange={(e) => setRetAutoGenerate(e.target.checked)}
                      className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment instructions and notes</label>
                <textarea
                  value={retNotes}
                  onChange={(e) => setRetNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1"
                />
              </div>
            </form>

            {/* Fixed Bottom Action Bar */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200/80 shrink-0 flex gap-2.5 z-10">
              <button
                type="button"
                onClick={() => setShowRetainerEditor(false)}
                className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all text-center cursor-pointer shadow-xs active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="retainer-editor-form"
                className="flex-1 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all text-center shadow-md shadow-sky-600/20 cursor-pointer active:scale-95"
              >
                {editingRetainer ? 'Save' : 'Create retainer'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Online Document Portal Viewer Modal with Scannable QR Code */}
      {/* Confirmation messages */}
      {shareToast && (
        <div role="status" className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100%-2rem)] bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {shareToast}
        </div>
      )}

      {/* Cancel invoice */}
      {showCancelModal && docToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 text-left" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Cancel invoice #{docToCancel.documentNumber}</h3>
            <p className="text-xs text-slate-500">The invoice is marked cancelled and kept for your records.</p>
            <label className="block text-[11px] font-semibold text-slate-700">
              Reason
              <select
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs"
              >
                <option>Client cancelled the order</option>
                <option>Issued by mistake</option>
                <option>Wrong amount or details</option>
                <option>Replaced by a new invoice</option>
                <option>Other</option>
              </select>
            </label>
            <label className="block text-[11px] font-semibold text-slate-700">
              Notes (optional)
              <textarea
                value={cancelNotes}
                onChange={e => setCancelNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs"
              />
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={generateCreditNote} onChange={e => setGenerateCreditNote(e.target.checked)} className="mt-0.5" />
              <span>Issue a credit note for {docToCancel.currency || data.userProfile.defaultCurrency || 'FJD'} ${docToCancel.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCancelModal(false)} className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">
                Keep invoice
              </button>
              <button type="button" onClick={handleConfirmCancelInvoice} className="text-xs font-bold px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white cursor-pointer">
                Cancel invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnlineDocModal && selectedDoc && (
        <OnlineDocumentModal
          document={selectedDoc}
          business={data.businesses.find(b => b.id === selectedDoc.businessId) || activeBusiness}
          client={data.clients.find(c => c.id === selectedDoc.clientId)}
          userProfile={data.userProfile}
          onClose={() => setShowOnlineDocModal(false)}
          onMarkPaid={(docId, paymentMethod) => {
            const updatedDocs = data.documents.map(d => 
              d.id === docId ? { ...d, status: 'paid' as const, paymentMethod: paymentMethod || 'M-Paisa' } : d
            );
            onUpdateData({ ...data, documents: updatedDocs });
            setSelectedDoc(prev => prev ? { ...prev, status: 'paid' as const, paymentMethod: paymentMethod || 'M-Paisa' } : null);
          }}
          onAcceptQuote={(docId) => {
            const updatedDocs = data.documents.map(d => 
              d.id === docId ? { ...d, status: 'accepted' as const } : d
            );
            onUpdateData({ ...data, documents: updatedDocs });
            setSelectedDoc(prev => prev ? { ...prev, status: 'accepted' as const } : null);
          }}
        />
      )}

      {/* Foreign / Local Currency Payment Logging Modal with FX and Deduction Calculator */}
      <RecordPaymentModal
        isOpen={!!paymentModalDoc}
        document={paymentModalDoc}
        data={data}
        onClose={() => setPaymentModalDoc(null)}
        onConfirmPayment={handleConfirmPayment}
      />

      {/* Partial Payment Recording Modal */}
      {partialModalDoc && (
        <PartialPaymentModal
          isOpen={!!partialModalDoc}
          document={partialModalDoc}
          data={data}
          onClose={() => setPartialModalDoc(null)}
          onSavePartial={(docId, amount, method, date, notes, atts) => {
            handleSavePartialPayment(docId, amount, method, date, notes, atts);
          }}
        />
      )}

      {/* PDF Export & Document Generator Modal */}
      {pdfModalDoc && (
        <PdfExportModal
          isOpen={!!pdfModalDoc}
          onClose={() => setPdfModalDoc(null)}
          document={pdfModalDoc}
          business={data.businesses.find(b => b.id === pdfModalDoc.businessId) || activeBusiness}
          client={data.clients.find(c => c.id === pdfModalDoc.clientId)}
          userProfile={data.userProfile}
          onOpenEmailModal={() => setEmailModalDoc(pdfModalDoc)}
        />
      )}

      {/* Transactional Email Dispatch Modal */}
      {emailModalDoc && (
        <EmailDocumentModal
          isOpen={!!emailModalDoc}
          onClose={() => setEmailModalDoc(null)}
          document={emailModalDoc}
          business={data.businesses.find(b => b.id === emailModalDoc.businessId) || activeBusiness}
          client={data.clients.find(c => c.id === emailModalDoc.clientId)}
          userProfile={data.userProfile}
          consultantEmail={data.userProfile.email}
          onDocumentUpdated={(updatedDoc) => {
            onUpdateData({
              ...data,
              documents: data.documents.map(d => d.id === updatedDoc.id ? updatedDoc : d)
            });
            if (selectedDoc && selectedDoc.id === updatedDoc.id) {
              setSelectedDoc(updatedDoc);
            }
          }}
        />
      )}

      {/* Exchange Rate Calculator Utility Modal */}
      <ExchangeRateCalculatorModal
        isOpen={showFxCalculator}
        onClose={() => setShowFxCalculator(false)}
        homeCurrency={activeBusiness?.currency || data.userProfile.defaultCurrency || 'FJD'}
        defaultTargetCurrency={docCurrency !== (activeBusiness?.currency || 'FJD') ? docCurrency : (activeBusiness?.workingCurrencies?.find(c => c !== (activeBusiness?.currency || 'FJD')) || 'AUD')}
        defaultAmount={1000}
        workingCurrencies={activeBusiness?.workingCurrencies}
        customExchangeRates={activeBusiness?.customExchangeRates}
        data={data}
        onCreateDocumentWithFx={handleCreateDocFromFx}
      />

      {/* Subscription Paywall Modal */}
      {showPaywallModal && (
        <SubscriptionPaywallModal
          currentPlan={data.platformSettings?.activePlan || 'free'}
          reason={paywallReason}
          onClose={() => {
            setShowPaywallModal(false);
            setPaywallReason(undefined);
          }}
          onUpgradePlan={(newPlan, paymentDetails) => {
            const updatedSettings = {
              ...(data.platformSettings || {}),
              activePlan: newPlan
            };
            onUpdateData({ ...data, platformSettings: updatedSettings as any });
          }}
        />
      )}
    </div>
  );
}
