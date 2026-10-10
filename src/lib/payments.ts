import type { CRMData, CRMDocument, PaymentAttachment, Transaction } from '../types';
import { suggestDocumentNumber } from './documentNumbers';
import { generateShareToken } from './documentLinks';

export interface ConfirmedPaymentDetails {
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

/**
 * Marks a document as paid and (by default) logs the bookkeeping transaction.
 * Shared by Billing's "Record Payment" and the payments inbox.
 */
export function applyConfirmedPayment(data: CRMData, docId: string, paymentDetails: ConfirmedPaymentDetails): CRMData {
  const targetDoc = data.documents.find(d => d.id === docId);
  if (!targetDoc) return data;

  const docCur = targetDoc.currency || data.userProfile.defaultCurrency || 'FJD';
  const finalPaymentDate = paymentDetails.paymentDate || new Date().toISOString().split('T')[0];

  // Combine existing and new attachments if any
  const finalAttachments = paymentDetails.paymentAttachments || targetDoc.paymentAttachments || [];

  // Update document status and FX settlement metadata
  const updatedDocs = data.documents.map(d => {
    if (d.id === docId) {
      return {
        ...d,
        status: 'paid' as const,
        paymentMethod: paymentDetails.paymentMethod,
        paymentDate: finalPaymentDate,
        paidAmountForeign: paymentDetails.paidAmountForeign,
        paidAmountHome: paymentDetails.paidAmountHome,
        exchangeRate: paymentDetails.exchangeRate,
        bankFeesDeduction: paymentDetails.bankFeesDeduction,
        netReceivedHome: paymentDetails.netReceivedHome,
        paymentExchangeNotes: paymentDetails.paymentExchangeNotes,
        notes: paymentDetails.notes !== undefined && paymentDetails.notes !== '' ? paymentDetails.notes : d.notes,
        paymentAttachments: finalAttachments,
        updatedAt: new Date().toISOString()
      };
    }
    return d;
  });

  let newTransactions = data.transactions || [];

  if (paymentDetails.autoLogTransaction !== false) {
    // Create a bookkeeping transaction record in home currency
    const firstImgAtt = finalAttachments.find(a => a.type.startsWith('image/') || a.dataUrl.startsWith('data:image/'));
    const newTransaction: Transaction = {
      id: `tx-${Date.now()}`,
      date: finalPaymentDate,
      description: `Payment received for ${targetDoc.type.toUpperCase()} #${targetDoc.documentNumber} (${docCur} ${(paymentDetails.paidAmountForeign || targetDoc.total).toLocaleString(undefined, { minimumFractionDigits: 2 })})`,
      amount: paymentDetails.netReceivedHome || paymentDetails.paidAmountHome || targetDoc.total, // in Home currency (FJD)
      category: 'Consulting Revenue',
      status: 'reconciled',
      confidence: 100,
      bankName: paymentDetails.paymentMethod.includes('Bank') ? 'Bank Transfer' : paymentDetails.paymentMethod,
      currency: docCur,
      originalAmount: paymentDetails.paidAmountForeign || targetDoc.total,
      exchangeRate: paymentDetails.exchangeRate,
      bankFee: paymentDetails.bankFeesDeduction,
      netReceived: paymentDetails.netReceivedHome,
      documentId: targetDoc.id,
      referenceNumber: paymentDetails.paymentExchangeNotes,
      paymentMethod: paymentDetails.paymentMethod,
      notes: paymentDetails.notes || paymentDetails.paymentExchangeNotes,
      businessId: targetDoc.businessId || data.activeBusinessId,
      projectId: targetDoc.projectId,
      clientId: targetDoc.clientId,
      vatAmount: targetDoc.vatAmount,
      receiptImage: firstImgAtt?.dataUrl,
      receiptFileName: firstImgAtt?.name,
      paymentAttachments: finalAttachments
    };
    newTransactions = [newTransaction, ...newTransactions];
  }


  return { ...data, documents: updatedDocs, transactions: newTransactions };
}

/**
 * Builds a receipt for a paid invoice: same items, totals, client and business, its own number from
 * the venture's receipt series, and its own share link. Invoice-only state such
 * as the invoice's share token, email history and payment report is not copied.
 */
export function buildReceiptFor(
  data: CRMData,
  invoice: CRMDocument,
  payment: { paymentMethod?: string; paymentDate?: string } = {}
): CRMDocument {
  const paymentDate = payment.paymentDate || invoice.paymentDate || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'receipt',
    documentNumber: suggestDocumentNumber(data, 'receipt', invoice.businessId) || `REC-${invoice.documentNumber}`,
    businessId: invoice.businessId,
    clientId: invoice.clientId,
    projectId: invoice.projectId,
    currency: invoice.currency,
    issueDate: paymentDate,
    items: invoice.items,
    subtotal: invoice.subtotal,
    vatRate: invoice.vatRate,
    vatAmount: invoice.vatAmount,
    isTaxExempt: invoice.isTaxExempt,
    appliedTaxes: invoice.appliedTaxes,
    taxBreakdown: invoice.taxBreakdown,
    appliedFees: invoice.appliedFees,
    taxTotal: invoice.taxTotal,
    feeTotal: invoice.feeTotal,
    total: invoice.total,
    status: 'paid',
    paymentMethod: payment.paymentMethod || invoice.paymentMethod,
    paymentDate,
    originalInvoiceId: invoice.id,
    shareToken: generateShareToken(),
    notes: `Receipt of payment for invoice #${invoice.documentNumber}. Vinaka!`,
    updatedAt: now
  };
}

/** Adds a receipt for an invoice unless it already has one; returns the new data and the receipt. */
export function addReceiptForInvoice(
  data: CRMData,
  invoiceId: string,
  payment: { paymentMethod?: string; paymentDate?: string } = {}
): { data: CRMData; receipt: CRMDocument | null } {
  const invoice = data.documents.find(d => d.id === invoiceId);
  if (!invoice || invoice.type !== 'invoice') return { data, receipt: null };
  if (invoice.receiptId && data.documents.some(d => d.id === invoice.receiptId)) {
    return { data, receipt: data.documents.find(d => d.id === invoice.receiptId) || null };
  }
  const receipt = buildReceiptFor(data, invoice, payment);
  return {
    receipt,
    data: {
      ...data,
      documents: [
        receipt,
        ...data.documents.map(d => d.id === invoiceId ? { ...d, receiptId: receipt.id, updatedAt: receipt.updatedAt } : d)
      ]
    }
  };
}
