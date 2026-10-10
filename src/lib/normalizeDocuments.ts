import type { AppliedChargeItem, CRMData, CRMDocument, DocumentItem } from '../types';

/**
 * Repairs documents with missing or malformed fields so every screen can render them.
 *
 * Older versions, imports and generated documents (e.g. a scope of work with an empty cost) could
 * store a document without line totals, a subtotal, a total or a number. Firestore drops undefined
 * fields, so these come back missing and crashed the Billing screen. Missing amounts are rebuilt
 * from what the document does have; nothing that is already valid is changed.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);

function normalizeItem(item: any, index: number): DocumentItem {
  if (!item || typeof item !== 'object') {
    return { id: `item-${index}`, name: 'Item', quantity: 0, rate: 0, total: 0 };
  }
  const quantity = num(item.quantity);
  const rate = num(item.rate);
  const total = num(item.total);
  const name = str(item.name);
  if (quantity !== null && rate !== null && total !== null && name !== null && item.id) return item;
  return {
    ...item,
    id: item.id || `item-${index}`,
    name: name ?? 'Item',
    quantity: quantity ?? 1,
    rate: rate ?? total ?? 0,
    total: total ?? round2((quantity ?? 1) * (rate ?? 0))
  };
}

function normalizeCharges(list: unknown): AppliedChargeItem[] | undefined {
  if (list == null) return undefined;
  if (!Array.isArray(list)) return [];
  let changed = false;
  const out = list
    .filter(c => {
      const ok = c && typeof c === 'object';
      if (!ok) changed = true;
      return ok;
    })
    .map((c: any) => {
      const amount = num(c.amount);
      const rate = num(c.rate);
      if (amount !== null && rate !== null && typeof c.name === 'string') return c;
      changed = true;
      return { ...c, name: str(c.name) ?? 'Charge', rate: rate ?? 0, amount: amount ?? 0 };
    });
  return changed ? out : (list as AppliedChargeItem[]);
}

export function normalizeDocument(doc: any): CRMDocument {
  const items = Array.isArray(doc.items) ? doc.items.map(normalizeItem) : [];
  const itemsChanged = !Array.isArray(doc.items) || items.some((it: DocumentItem, i: number) => it !== doc.items[i]);

  const appliedTaxes = normalizeCharges(doc.appliedTaxes);
  const appliedFees = normalizeCharges(doc.appliedFees);

  const subtotal = num(doc.subtotal) ?? round2(items.reduce((s: number, it: DocumentItem) => s + it.total, 0));
  const vatRate = num(doc.vatRate) ?? 0;
  const vatAmount = num(doc.vatAmount) ?? (appliedTaxes ? 0 : round2(subtotal * (vatRate / 100)));
  const taxSum = appliedTaxes ? appliedTaxes.reduce((s, t) => s + t.amount, 0) : vatAmount;
  const feeSum = appliedFees ? appliedFees.reduce((s, f) => s + f.amount, 0) : 0;
  const total = num(doc.total) ?? round2(subtotal + taxSum + feeSum);

  const type = ['quote', 'invoice', 'receipt', 'credit_note'].includes(doc.type) ? doc.type : 'invoice';
  const status = typeof doc.status === 'string' && doc.status ? doc.status : 'draft';
  const documentNumber = str(doc.documentNumber) ?? '';
  const issueDate = str(doc.issueDate) ?? '';

  const unchanged =
    !itemsChanged &&
    appliedTaxes === doc.appliedTaxes &&
    appliedFees === doc.appliedFees &&
    subtotal === doc.subtotal &&
    vatRate === doc.vatRate &&
    vatAmount === doc.vatAmount &&
    total === doc.total &&
    type === doc.type &&
    status === doc.status &&
    documentNumber === doc.documentNumber &&
    issueDate === doc.issueDate &&
    typeof doc.businessId === 'string' &&
    typeof doc.clientId === 'string' &&
    (doc.dueDate == null || typeof doc.dueDate === 'string') &&
    (doc.cancelledAt == null || typeof doc.cancelledAt === 'string') &&
    (doc.notes == null || typeof doc.notes === 'string');
  if (unchanged) return doc;

  const fixed: any = {
    ...doc,
    type,
    status,
    documentNumber,
    issueDate,
    businessId: str(doc.businessId) ?? '',
    clientId: str(doc.clientId) ?? '',
    items,
    subtotal,
    vatRate,
    vatAmount,
    total
  };
  if (appliedTaxes) fixed.appliedTaxes = appliedTaxes;
  if (appliedFees) fixed.appliedFees = appliedFees;
  if (doc.dueDate != null && typeof doc.dueDate !== 'string') delete fixed.dueDate;
  if (doc.cancelledAt != null && typeof doc.cancelledAt !== 'string') delete fixed.cancelledAt;
  if (doc.notes != null && typeof doc.notes !== 'string') fixed.notes = str(doc.notes) ?? '';
  return fixed;
}

/** Returns data with every document renderable; returns the same object if nothing needed fixing. */
export function normalizeDocuments(data: CRMData): CRMData {
  if (!Array.isArray(data.documents)) return { ...data, documents: [] };
  let changed = false;
  const documents = data.documents
    .filter(d => {
      const ok = d && typeof d === 'object';
      if (!ok) changed = true;
      return ok;
    })
    .map((d, i) => {
      const withId = typeof d.id === 'string' && d.id ? d : { ...d, id: `doc-recovered-${i}` };
      const n = normalizeDocument(withId);
      if (n !== d) changed = true;
      return n;
    });
  return changed ? { ...data, documents } : data;
}
