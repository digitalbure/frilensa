import type { CRMData, CRMDocument, DocumentItem, RecurringInvoice } from '../types';
import { suggestDocumentNumber } from './documentNumbers';
import { generateShareToken } from './documentLinks';

// Retainer (recurring invoice) scheduling, shared by the Billing screen and the daily server job.
// All dates are calendar dates ("YYYY-MM-DD") in the business's time zone (Fiji by default).

export const DEFAULT_TIME_ZONE = 'Pacific/Fiji';

/** Today's date as YYYY-MM-DD in the given time zone. */
export function todayIn(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtcDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function addDays(day: string, days: number): string {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

/** Whether an active retainer should produce an invoice on `today`. */
export function isRetainerDue(ret: RecurringInvoice, today: string): boolean {
  if (ret.status !== 'active') return false;
  if (ret.startDate && ret.startDate.slice(0, 10) > today) return false;
  if (ret.endDate && ret.endDate.slice(0, 10) < today) return false;

  const last = ret.lastGeneratedDate?.slice(0, 10);
  switch (ret.interval || 'monthly') {
    case 'monthly': {
      const billingDay = Math.min(Math.max(ret.billingDay || 1, 1), 28);
      if (Number(today.slice(8, 10)) < billingDay) return false;
      return !last || last.slice(0, 7) < today.slice(0, 7);
    }
    case 'quarterly':
      return !last || daysBetween(last, today) >= 90;
    case 'bi-weekly':
      return !last || daysBetween(last, today) >= 14;
    case 'annual':
      return !last || last.slice(0, 4) < today.slice(0, 4);
    default:
      return false;
  }
}

/**
 * Identifies the billing period, so the same retainer can never be invoiced twice for one period
 * even if the app and the server job both run.
 */
export function retainerPeriodKey(ret: RecurringInvoice, today: string): string {
  switch (ret.interval || 'monthly') {
    case 'monthly': return today.slice(0, 7);
    case 'annual': return today.slice(0, 4);
    default: return today;
  }
}

export function retainerInvoiceId(ret: RecurringInvoice, today: string): string {
  return `doc-ret-${ret.id}-${retainerPeriodKey(ret, today)}`;
}

/** The VAT rate a new retainer invoice should use (0 for businesses not charging tax). */
export function retainerVatRate(data: CRMData): number {
  if (data.userProfile?.enableTax === false) return 0;
  return data.userProfile?.defaultVatRate ?? 12.5;
}

export function buildRetainerInvoice(data: CRMData, ret: RecurringInvoice, today: string, id = retainerInvoiceId(ret, today)): CRMDocument {
  const business = data.businesses.find(b => b.id === ret.businessId)
    || data.businesses.find(b => b.id === data.activeBusinessId)
    || data.businesses[0];
  const termsDays = ret.paymentTermsDays || business?.paymentTermsDays || 14;
  const items: DocumentItem[] = ret.items && ret.items.length > 0
    ? ret.items
    : [{ id: `item-${ret.id}`, name: `${ret.projectName || 'Monthly Retainer'} Service Plan`, quantity: 1, rate: ret.amount, total: ret.amount }];
  const subtotal = items.reduce((sum, it) => sum + (it.total || it.quantity * it.rate), 0);
  const vatRate = retainerVatRate(data);
  const vatAmount = Number((subtotal * vatRate / 100).toFixed(2));
  return {
    id,
    type: 'invoice',
    documentNumber: suggestDocumentNumber(data, 'invoice', business?.id) || `INV-${retainerPeriodKey(ret, today)}`,
    businessId: business?.id || ret.businessId,
    clientId: ret.clientId,
    projectId: ret.projectId || undefined,
    currency: ret.currency || data.clients.find(c => c.id === ret.clientId)?.currency || data.userProfile?.defaultCurrency || 'FJD',
    issueDate: today,
    dueDate: addDays(today, termsDays),
    items,
    subtotal,
    vatRate,
    vatAmount,
    total: Number((subtotal + vatAmount).toFixed(2)),
    status: ret.autoSendMode || 'sent',
    notes: ret.notes || `Scheduled ${ret.interval || 'monthly'} retainer invoice. Net ${termsDays} payment terms.`,
    shareToken: generateShareToken()
    // No updatedAt: if the app and the daily job both create this period's invoice, the saved
    // (timestamped) copy wins the merge, so a link already emailed to the client keeps working.
  };
}

/** Records a generated invoice on its retainer. */
function markGenerated(data: CRMData, ret: RecurringInvoice, invoice: CRMDocument, today: string): CRMData {
  return {
    ...data,
    documents: data.documents.some(d => d.id === invoice.id) ? data.documents : [invoice, ...data.documents],
    recurringInvoices: (data.recurringInvoices || []).map(r => r.id === ret.id
      ? { ...r, lastGeneratedDate: today, generatedDocIds: Array.from(new Set([invoice.id, ...(r.generatedDocIds || [])])) }
      : r)
  };
}

/**
 * Generates every retainer invoice due today. With `onlyAutoGenerate`, retainers that aren't set to
 * generate automatically are skipped (used by background runs). Safe to call repeatedly.
 */
export function runDueRetainers(
  data: CRMData,
  today: string,
  { onlyAutoGenerate = true }: { onlyAutoGenerate?: boolean } = {}
): { data: CRMData; created: CRMDocument[] } {
  let next = data;
  const created: CRMDocument[] = [];
  for (const ret of data.recurringInvoices || []) {
    if (onlyAutoGenerate && !ret.autoGenerate) continue;
    if (!isRetainerDue(ret, today)) continue;
    const id = retainerInvoiceId(ret, today);
    const existing = next.documents.find(d => d.id === id);
    const invoice = existing || buildRetainerInvoice(next, ret, today, id);
    next = markGenerated(next, ret, invoice, today);
    if (!existing) created.push(invoice);
  }
  return { data: next, created };
}

/** Generates an invoice for one retainer right now (the "Generate now" button). */
export function generateRetainerNow(data: CRMData, ret: RecurringInvoice, today: string): { data: CRMData; invoice: CRMDocument } {
  // Manual runs can happen more than once per period, so they get a unique id.
  const invoice = buildRetainerInvoice(data, ret, today, `doc-ret-${ret.id}-${today}-${Date.now().toString(36)}`);
  return { data: markGenerated(data, ret, invoice, today), invoice };
}
