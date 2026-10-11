import type { CRMData } from '../types';
import type { VatReturn } from './vatReturn';

// CSV exports for accountants and spreadsheets. One function per file; each takes a date range
// (YYYY-MM-DD, inclusive) where it makes sense. Amounts are plain numbers in the record's currency
// unless the column says otherwise.

type Cell = string | number | boolean | null | undefined;

/** One CSV field. Text that a spreadsheet would run as a formula is prefixed with ' so it stays text. */
function field(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  // Leading BOM so Excel opens UTF-8 (names with macrons, ā, etc.) correctly.
  return '﻿' + [headers, ...rows].map(r => r.map(field).join(',')).join('\r\n') + '\r\n';
}

const day = (s?: string) => (s || '').slice(0, 10);
const within = (d: string | undefined, from?: string, to?: string) => {
  const x = day(d);
  return (!from || x >= from) && (!to || x <= to);
};

export interface ExportRange { from?: string; to?: string; businessId?: string | null }

function names(data: CRMData) {
  const client = new Map(data.clients.map(c => [c.id, c]));
  const business = new Map(data.businesses.map(b => [b.id, b]));
  const project = new Map((data.projects || []).map(p => [p.id, p]));
  return { client, business, project };
}

const inBusiness = (bid: string | undefined, r: ExportRange) => !r.businessId || bid === r.businessId;

export function documentsCsv(data: CRMData, r: ExportRange = {}): string {
  const n = names(data);
  const home = data.userProfile?.defaultCurrency || 'FJD';
  const rows = (data.documents || [])
    .filter(d => inBusiness(d.businessId, r) && within(d.issueDate, r.from, r.to))
    .sort((a, b) => day(a.issueDate).localeCompare(day(b.issueDate)))
    .map(d => {
      const paid = d.status === 'paid' ? d.total : (d.partiallyPaidAmount || 0);
      const c = n.client.get(d.clientId);
      return [
        d.documentNumber, d.type, d.status, day(d.issueDate), day(d.dueDate), c?.name || '', c?.tin || '',
        d.currency || home, d.subtotal, d.vatRate, d.vatAmount, d.total, paid,
        d.type === 'invoice' && d.status !== 'cancelled' && d.status !== 'draft' ? Math.max(0, d.total - paid) : 0,
        day(d.paymentDate), d.paymentMethod || '', n.business.get(d.businessId)?.name || '', d.projectId ? n.project.get(d.projectId)?.name || '' : ''
      ];
    });
  return toCsv(['Number', 'Type', 'Status', 'Issue date', 'Due date', 'Client', 'Client TIN', 'Currency', 'Subtotal', 'VAT rate %', 'VAT', 'Total', 'Paid', 'Balance due', 'Payment date', 'Payment method', 'Business', 'Project'], rows);
}

export function lineItemsCsv(data: CRMData, r: ExportRange = {}): string {
  const n = names(data);
  const home = data.userProfile?.defaultCurrency || 'FJD';
  const rows: Cell[][] = [];
  for (const d of data.documents || []) {
    if (!inBusiness(d.businessId, r) || !within(d.issueDate, r.from, r.to) || d.type === 'quote') continue;
    for (const it of d.items || []) {
      rows.push([d.documentNumber, d.type, d.status, day(d.issueDate), n.client.get(d.clientId)?.name || '', it.name, it.description || '', it.quantity, it.rate, it.total, d.currency || home, d.vatRate]);
    }
  }
  return toCsv(['Document', 'Type', 'Status', 'Date', 'Client', 'Item', 'Description', 'Quantity', 'Rate', 'Line total', 'Currency', 'VAT rate %'], rows);
}

export function expensesCsv(data: CRMData, r: ExportRange = {}): string {
  const n = names(data);
  const home = data.userProfile?.defaultCurrency || 'FJD';
  const rows = (data.expenses || [])
    .filter(e => inBusiness(e.businessId, r) && within(e.date, r.from, r.to))
    .sort((a, b) => day(a.date).localeCompare(day(b.date)))
    .map(e => [
      day(e.date), e.vendor, e.description, e.category, e.paymentMethod, e.amount, e.currency || home, e.vatAmount || 0,
      Boolean(e.isVatClaimable), e.isTaxDeductible !== false, e.businessId ? n.business.get(e.businessId)?.name || '' : '',
      e.projectId ? n.project.get(e.projectId)?.name || '' : '', e.originalCurrency || '', e.originalAmount ?? '', e.notes || ''
    ]);
  return toCsv(['Date', 'Vendor', 'Description', 'Category', 'Payment method', 'Amount', 'Currency', 'VAT', 'VAT claimable', 'Tax deductible', 'Business', 'Project', 'Paid in currency', 'Paid amount', 'Notes'], rows);
}

export function clientsCsv(data: CRMData): string {
  const owed = new Map<string, number>();
  for (const d of data.documents || []) {
    if (d.type !== 'invoice' || d.status === 'cancelled' || d.status === 'draft' || d.status === 'paid') continue;
    owed.set(d.clientId, (owed.get(d.clientId) || 0) + Math.max(0, d.total - (d.partiallyPaidAmount || 0)));
  }
  const rows = data.clients.map(c => [c.name, c.contactPerson || c.contactName || '', c.email, c.phone, c.address, c.tin || '', c.currency || '', owed.get(c.id) || 0]);
  return toCsv(['Name', 'Contact', 'Email', 'Phone', 'Address', 'TIN', 'Currency', 'Outstanding'], rows);
}

export function transactionsCsv(data: CRMData, r: ExportRange = {}): string {
  const docs = new Map((data.documents || []).map(d => [d.id, d.documentNumber]));
  const rows = (data.transactions || [])
    .filter(t => inBusiness(t.businessId, r) && within(t.date, r.from, r.to))
    .sort((a, b) => day(a.date).localeCompare(day(b.date)))
    .map(t => [
      day(t.date), t.description, t.amount, t.category, t.status, t.bankName, t.referenceNumber || '', t.vatAmount ?? '',
      t.currency || '', t.originalAmount ?? '', t.bankFee ?? '',
      (t.documentId || '').split(',').map(id => docs.get(id.trim()) || '').filter(Boolean).join(' ')
    ]);
  return toCsv(['Date', 'Description', 'Amount', 'Category', 'Status', 'Account', 'Reference', 'VAT', 'Original currency', 'Original amount', 'Bank fee', 'Linked documents'], rows);
}

export function vatReturnCsv(v: VatReturn): string {
  const summary: Cell[][] = [
    ['Summary', 'Period', `${v.period.from} to ${v.period.to}`, '', '', '', '', ''],
    ['Summary', 'Basis', v.basis === 'payments' ? 'Payments basis' : 'Invoice basis', '', '', '', '', ''],
    ['Summary', 'Standard-rated sales (excl. VAT)', '', '', '', v.sales.standardRated, '', ''],
    ['Summary', 'Zero-rated or exempt sales', '', '', '', v.sales.zeroRatedOrExempt, '', ''],
    ['Summary', 'Output VAT', '', '', '', '', v.sales.outputVat, ''],
    ['Summary', 'Credit notes', '', '', '', -v.creditNotes.net, -v.creditNotes.vat, ''],
    ['Summary', 'Purchases with claimable VAT (excl. VAT)', '', '', '', v.purchases.net, '', ''],
    ['Summary', 'Input VAT', '', '', '', '', v.purchases.inputVat, ''],
    ['Summary', v.netVat >= 0 ? 'Net VAT payable' : 'Net VAT refundable', '', '', '', '', Math.abs(v.netVat), '']
  ];
  const kind = { sale: 'Sale', credit_note: 'Credit note', purchase: 'Purchase' } as const;
  const lines: Cell[][] = v.lines.map(l => [kind[l.kind], l.date, l.reference, l.party, l.currency, l.net, l.vat, l.gross]);
  return toCsv(['Section', 'Date or item', 'Reference', 'Client or supplier', 'Original currency', `Net (${v.currency})`, `VAT (${v.currency})`, `Gross (${v.currency})`], [...summary, ...lines]);
}

/** Starts a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
