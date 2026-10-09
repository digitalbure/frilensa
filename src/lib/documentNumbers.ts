import type { CRMData } from '../types';

/**
 * Next document number in a venture's series, e.g. "INV-2026-1004".
 * Returns '' when the venture uses manual numbering.
 */
export function suggestDocumentNumber(
  data: CRMData,
  type: 'quote' | 'invoice' | 'receipt',
  targetBusinessId?: string
): string {
  const biz = data.businesses.find(b => b.id === (targetBusinessId || data.activeBusinessId)) || data.businesses[0];
  if ((biz?.docNumberMode || 'auto') === 'manual') return '';

  let prefix: string;
  let startNum: number;
  if (type === 'invoice') {
    prefix = biz?.invoicePrefix || 'INV';
    startNum = biz?.invoiceStartNumber ?? 1000;
  } else if (type === 'receipt') {
    prefix = biz?.receiptPrefix || 'REC';
    startNum = biz?.receiptStartNumber ?? 1000;
  } else {
    prefix = biz?.quotePrefix || 'QT';
    startNum = biz?.quoteStartNumber ?? 1000;
  }

  const typeDocs = data.documents.filter(d => d.type === type && d.businessId === (biz?.id || data.activeBusinessId));
  let maxSerial = startNum;
  typeDocs.forEach(d => {
    const parts = d.documentNumber.split('-');
    const serial = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(serial) && serial >= maxSerial) maxSerial = serial;
  });

  const hasMatchingDoc = typeDocs.some(d => d.documentNumber.endsWith(`-${startNum}`));
  const nextNum = hasMatchingDoc || maxSerial > startNum ? maxSerial + 1 : startNum;
  return `${prefix}-${new Date().getFullYear()}-${nextNum}`;
}
