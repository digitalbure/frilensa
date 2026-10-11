import type { Client, CRMData, CRMDocument } from '../types';
import type { QuoteRequest } from './rateCards';
import { suggestDocumentNumber } from './documentNumbers';
import { generateShareToken } from './documentLinks';
import { documentDefaults } from './documentTerms';
import { lineTotals } from './invoiceTotals';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns a rate card quote request into a draft quote, adding the requester as a client unless one
 * with the same email already exists. Rates come from the request (the rate card at the time).
 */
export function draftQuoteFromRequest(data: CRMData, req: QuoteRequest, now = new Date()): { data: CRMData; doc: CRMDocument; client: Client; newClient: boolean } {
  const stamp = now.toISOString();
  const email = req.email.trim().toLowerCase();
  const existing = data.clients.find(c => (c.email || '').trim().toLowerCase() === email);
  const client: Client = existing || {
    id: `client-${now.getTime()}`,
    name: req.company || req.name,
    contactPerson: req.company ? req.name : undefined,
    email: req.email,
    phone: req.phone || '',
    address: '',
    currency: req.currency
  };
  const business = data.businesses.find(b => b.id === req.businessId) || data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const issueDate = stamp.slice(0, 10);
  const defaults = documentDefaults(business, 'quote', issueDate);
  const items = req.items.map((it, i) => ({
    id: `item-${now.getTime()}-${i}`,
    itemId: it.serviceId,
    name: it.name,
    description: it.unit ? `Per ${it.unit.toLowerCase()}` : '',
    quantity: it.quantity,
    rate: it.rate,
    total: round2(it.quantity * it.rate)
  }));
  const { subtotal, taxableBase } = lineTotals(items);
  const vatRate = data.userProfile.enableTax === false ? 0 : (data.userProfile.defaultVatRate ?? 12.5);
  const vatAmount = round2(taxableBase * vatRate / 100);
  const request = [`Requested from your rate card (${req.ref}) by ${req.name}${req.company ? `, ${req.company}` : ''}.`, req.message ? `Their note: ${req.message}` : ''].filter(Boolean).join('\n');
  const doc: CRMDocument = {
    id: `doc-${now.getTime()}`,
    type: 'quote',
    documentNumber: suggestDocumentNumber(data, 'quote', business?.id) || `QT-${now.getTime().toString(36).toUpperCase()}`,
    businessId: business?.id || data.activeBusinessId,
    clientId: client.id,
    currency: req.currency || client.currency || data.userProfile.defaultCurrency || 'FJD',
    issueDate,
    dueDate: defaults.dueDate,
    items,
    subtotal,
    vatRate,
    vatAmount,
    total: round2(subtotal + vatAmount),
    status: 'draft',
    notes: defaults.notes,
    shareToken: generateShareToken(),
    updatedAt: stamp
  } as CRMDocument;
  return {
    data: {
      ...data,
      clients: existing ? data.clients : [...data.clients, client],
      documents: [doc, ...data.documents],
      activityLogs: [{
        id: `log-${now.getTime()}`,
        type: 'quote_created' as const,
        title: 'Draft quote from rate card request',
        description: `${doc.documentNumber} for ${client.name}. ${request}`,
        timestamp: stamp,
        entityType: 'quote' as const,
        entityId: doc.id,
        amount: doc.total,
        currency: doc.currency,
        clientName: client.name
      }, ...(data.activityLogs || [])].slice(0, 500)
    },
    doc,
    client,
    newClient: !existing
  };
}
