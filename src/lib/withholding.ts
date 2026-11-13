import type { CRMData, ExpenseRecord } from '../types';

// Provisional tax (PT) on payments to resident contractors in Fiji (FRCS Practice Statement 29).
// A business that pays someone for services under a written agreement, where the person will be paid
// FJD 1,000 or more in the year, deducts PT (5%) from the gross payment (excluding VAT) and pays it to
// FRCS by the end of the next month. People with a certificate of exemption (COE) are exempt.
// The rate and the yearly threshold come from the platform config so admins can follow changes.

export interface WithholdingSettings {
  /** PT rate, percent. */
  rate: number;
  /** Yearly total (FJD, excluding VAT) at which PT applies. */
  threshold: number;
}

export const DEFAULT_WITHHOLDING: WithholdingSettings = { rate: 5, threshold: 1000 };

export function cleanWithholding(raw: any): WithholdingSettings {
  const rate = Number(raw?.rate);
  const threshold = Number(raw?.threshold);
  return {
    rate: Number.isFinite(rate) && rate >= 0 && rate <= 50 ? Math.round(rate * 100) / 100 : DEFAULT_WITHHOLDING.rate,
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 1_000_000 ? Math.round(threshold * 100) / 100 : DEFAULT_WITHHOLDING.threshold
  };
}

/** Someone a business pays for services (crew, freelancers, suppliers of services). */
export interface Contractor {
  id: string;
  businessId: string;
  name: string;
  tin: string;
  email?: string;
  phone?: string;
  vatRegistered: boolean;
  /** There's a written agreement (contract, deal memo, crew agreement). Invoices and LPOs don't count. */
  writtenAgreement: boolean;
  /** Expected total for the year, excluding VAT (FJD). Empty when not known. */
  expectedYearly?: number;
  /** Certificate of exemption from FRCS. */
  coeNumber?: string;
  coeExpiry?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** The PT details kept on the expense for a contractor payment. */
export interface ContractorPayment {
  contractorId: string;
  contractorName: string;
  tin: string;
  /** What the contractor charged, including VAT. */
  gross: number;
  vat: number;
  /** What PT is worked out on: the gross less VAT. */
  base: number;
  rate: number;
  /** Earlier payments this year that weren't withheld, caught up in this payment. */
  catchUpBase?: number;
  withheld: number;
  /** Paid to the contractor: gross less PT. */
  net: number;
  applied: boolean;
  /** Not withheld only because the yearly total hadn't reached the threshold yet. */
  underThreshold?: boolean;
  reason: string;
  /** The user changed what the rules worked out. */
  override?: boolean;
  overrideReason?: string;
  coeNumber?: string;
  /** Withholding certificate number (one per deduction). */
  certificateNo: string;
  invoiceRef?: string;
}

/** PT paid to FRCS for a month. */
export interface PtRemittance {
  id: string;
  businessId: string;
  /** YYYY-MM the tax was withheld in. */
  month: string;
  amount: number;
  date: string;
  reference?: string;
  updatedAt?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const contractorPaymentsOf = (data: Pick<CRMData, 'expenses'>, businessId?: string) =>
  (data.expenses || []).filter((e): e is ExpenseRecord & { contractorPayment: ContractorPayment } =>
    !!e?.contractorPayment && (!businessId || (e.businessId || '') === businessId));

export const coeValid = (c: Pick<Contractor, 'coeNumber' | 'coeExpiry'>, date: string) =>
  !!c.coeNumber?.trim() && (!c.coeExpiry || c.coeExpiry >= date);

/** Earlier payments to a contractor in the same calendar year (before `date`, or on it but saved earlier). */
export function earlierThisYear(data: Pick<CRMData, 'expenses'>, contractorId: string, date: string, exceptExpenseId?: string) {
  const year = date.slice(0, 4);
  const list = contractorPaymentsOf(data).filter(e => e.contractorPayment.contractorId === contractorId && e.id !== exceptExpenseId && e.date.slice(0, 4) === year && e.date <= date);
  return {
    base: round2(list.reduce((s, e) => s + e.contractorPayment.base, 0)),
    /** Paid without PT although PT would have applied had the yearly total been known. */
    notWithheldBase: round2(Math.max(0,
      list.filter(e => e.contractorPayment.underThreshold && !e.contractorPayment.applied).reduce((s, e) => s + e.contractorPayment.base, 0)
      - list.reduce((s, e) => s + (e.contractorPayment.catchUpBase || 0), 0))),
    count: list.length
  };
}

export interface PtDecision { applies: boolean; underThreshold?: boolean; reason: string; base: number; withheld: number; net: number; warning?: string; catchUpAvailable: number }

/**
 * Whether PT applies to a payment and how much. `gross` includes VAT when the contractor is VAT
 * registered; `vat` is the VAT in it. `paidThisYear` is the base of earlier payments this year.
 */
export function ptFor(
  contractor: Contractor,
  p: { date: string; gross: number; vat: number; catchUp?: boolean },
  earlier: { base: number; notWithheldBase: number },
  settings: WithholdingSettings = DEFAULT_WITHHOLDING
): PtDecision {
  const gross = round2(Math.max(0, p.gross));
  const vat = round2(Math.min(gross, Math.max(0, contractor.vatRegistered ? p.vat : 0)));
  const base = round2(gross - vat);
  const none = (reason: string, warning?: string): PtDecision => ({ applies: false, reason, base, withheld: 0, net: gross, warning, catchUpAvailable: 0 });

  if (!contractor.writtenAgreement) return none('No written agreement, so provisional tax doesn\'t apply. Invoices and purchase orders don\'t count as an agreement.');
  if (coeValid(contractor, p.date)) return none(`Exempt: certificate of exemption ${contractor.coeNumber}${contractor.coeExpiry ? ` (valid to ${contractor.coeExpiry})` : ''}.`);
  const yearTotal = round2(earlier.base + base);
  const expected = Number(contractor.expectedYearly) || 0;
  if (expected < settings.threshold && yearTotal < settings.threshold) {
    return { ...none(`Under the FJD ${settings.threshold.toLocaleString()} yearly threshold so far (FJD ${yearTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} this year). Provisional tax will apply once payments reach it.`), underThreshold: true };
  }
  const catchUpAvailable = earlier.notWithheldBase;
  const catchUp = p.catchUp && catchUpAvailable > 0 ? catchUpAvailable : 0;
  const withheld = Math.min(gross, round2((base + catchUp) * settings.rate / 100));
  const expiredNote = contractor.coeNumber?.trim() && contractor.coeExpiry && contractor.coeExpiry < p.date ? ` The certificate of exemption ran out on ${contractor.coeExpiry}.` : '';
  const why = expected >= settings.threshold
    ? `Written agreement and expected yearly total of FJD ${expected.toLocaleString()} (FJD ${settings.threshold.toLocaleString()} or more).`
    : `Written agreement and payments this year reach FJD ${yearTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (FJD ${settings.threshold.toLocaleString()} or more).`;
  return {
    applies: true,
    reason: `${settings.rate}% provisional tax. ${why}${expiredNote}`,
    base, withheld, net: round2(gross - withheld), catchUpAvailable,
    warning: catchUpAvailable > 0 && !catchUp ? `Earlier payments this year (FJD ${catchUpAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })} excluding VAT) were paid without provisional tax. You can withhold on them in this payment.` : undefined
  };
}

/** The last day of the month after `month` (YYYY-MM): when PT withheld in `month` is due. */
export function ptDueDate(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}

/** The next withholding certificate number for a business in a year: WHT-YYYY-0001. */
export function nextCertificateNo(data: Pick<CRMData, 'expenses'>, businessId: string, year: string) {
  const prefix = `WHT-${year}-`;
  const max = contractorPaymentsOf(data, businessId)
    .map(e => e.contractorPayment.certificateNo)
    .filter(n => n?.startsWith(prefix))
    .reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export interface PtSummaryRow { contractorId: string; name: string; tin: string; coeNumber: string; gross: number; base: number; withheld: number; payments: number }
export interface PtSummary { month: string; due: string; rows: PtSummaryRow[]; gross: number; withheld: number; remitted: number; remittances: PtRemittance[] }

/** The monthly PT summary: every contractor paid in the month (exempt ones too), with gross, COE and PT. */
export function ptMonthSummary(data: Pick<CRMData, 'expenses'> & { ptRemittances?: PtRemittance[] }, businessId: string, month: string): PtSummary {
  const byId = new Map<string, PtSummaryRow>();
  for (const e of contractorPaymentsOf(data, businessId)) {
    if (e.date.slice(0, 7) !== month) continue;
    const cp = e.contractorPayment;
    const row = byId.get(cp.contractorId) || { contractorId: cp.contractorId, name: cp.contractorName, tin: cp.tin, coeNumber: '', gross: 0, base: 0, withheld: 0, payments: 0 };
    row.gross = round2(row.gross + cp.gross);
    row.base = round2(row.base + cp.base);
    row.withheld = round2(row.withheld + cp.withheld);
    row.payments += 1;
    if (cp.coeNumber) row.coeNumber = cp.coeNumber;
    byId.set(cp.contractorId, row);
  }
  const rows = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const remittances = (data.ptRemittances || []).filter(r => r.businessId === businessId && r.month === month);
  return {
    month, due: ptDueDate(month), rows, remittances,
    gross: round2(rows.reduce((s, r) => s + r.gross, 0)),
    withheld: round2(rows.reduce((s, r) => s + r.withheld, 0)),
    remitted: round2(remittances.reduce((s, r) => s + r.amount, 0))
  };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The monthly summary as CSV, ready to copy into the FRCS return. */
export function ptSummaryCsv(s: PtSummary) {
  const lines = [['Contractor', 'TIN', 'COE number', 'Gross paid (incl. VAT)', 'Gross excl. VAT', 'PT withheld', 'Payments'].map(csvCell).join(',')];
  for (const r of s.rows) lines.push([r.name, r.tin, r.coeNumber, r.gross.toFixed(2), r.base.toFixed(2), r.withheld.toFixed(2), r.payments].map(csvCell).join(','));
  lines.push(['Total', '', '', s.gross.toFixed(2), '', s.withheld.toFixed(2), ''].map(csvCell).join(','));
  return lines.join('\n');
}

/** A contractor's year: for the annual certificate (due to them by the end of February). */
export function contractorYear(data: Pick<CRMData, 'expenses'>, contractorId: string, year: string) {
  const list = contractorPaymentsOf(data).filter(e => e.contractorPayment.contractorId === contractorId && e.date.slice(0, 4) === year).sort((a, b) => a.date.localeCompare(b.date));
  return {
    payments: list,
    gross: round2(list.reduce((s, e) => s + e.contractorPayment.gross, 0)),
    base: round2(list.reduce((s, e) => s + e.contractorPayment.base, 0)),
    withheld: round2(list.reduce((s, e) => s + e.contractorPayment.withheld, 0))
  };
}

// ---------- The other side: tax a client withheld from you ----------

/** PT a client deducted from a payment to you, kept on the invoice. It counts towards your income tax. */
export interface WithheldFromYou {
  amount: number;
  rate: number;
  date: string;
  certificateReceived: boolean;
  certificateNo?: string;
}

/** PT clients withheld from you in a year, with how many certificates you still need. */
export function withheldFromYou(data: Pick<CRMData, 'documents' | 'clients'>, year: string, businessId?: string) {
  const list = (data.documents || []).filter(d => d?.withholdingTax && d.withholdingTax.amount > 0 && String(d.withholdingTax.date || d.paymentDate || '').slice(0, 4) === year && (!businessId || d.businessId === businessId));
  const rows = list.map(d => ({
    docId: d.id, number: d.documentNumber,
    client: (data.clients || []).find(c => c.id === d.clientId)?.name || '',
    date: d.withholdingTax!.date, amount: d.withholdingTax!.amount,
    certificateReceived: !!d.withholdingTax!.certificateReceived, certificateNo: d.withholdingTax!.certificateNo || ''
  })).sort((a, b) => a.date.localeCompare(b.date));
  return { rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)), missing: rows.filter(r => !r.certificateReceived).length };
}
