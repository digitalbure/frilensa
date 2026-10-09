import type { CRMData, CRMDocument } from '../types';

/** Invoices with a client-reported payment that hasn't been confirmed or rejected yet. */
export function paymentsToConfirm(data: CRMData): CRMDocument[] {
  return (data.documents || []).filter(d =>
    d.type === 'invoice' &&
    d.status !== 'paid' &&
    d.status !== 'cancelled' &&
    d.clientPaymentReport &&
    (d.clientPaymentReport.status ?? 'pending') === 'pending'
  ).sort((a, b) => (b.clientPaymentReport!.reportedAt || '').localeCompare(a.clientPaymentReport!.reportedAt || ''));
}

/** Quotes a client accepted that the consultant hasn't dismissed yet. */
export function newlyAcceptedQuotes(data: CRMData): CRMDocument[] {
  return (data.documents || []).filter(d =>
    d.type === 'quote' && d.status === 'accepted' && d.acceptedAt && !d.acceptanceSeenAt
  ).sort((a, b) => (b.acceptedAt || '').localeCompare(a.acceptedAt || ''));
}

/** Count used for navigation badges (document-based items; messages and bookings load in the panel). */
export function inboxDocumentCount(data: CRMData): number {
  return paymentsToConfirm(data).length + newlyAcceptedQuotes(data).length;
}
