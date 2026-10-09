import type { CRMData, PaymentAttachment, Transaction } from '../types';

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
