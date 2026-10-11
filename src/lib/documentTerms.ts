import type { Business } from '../types';

// Default terms for new documents, set per business (Bookkeeping → Services → Terms).

export const DEFAULT_INVOICE_TERMS = 'Please pay using the bank details below.';
export const DEFAULT_QUOTE_TERMS = (validDays: number) => `Proposed scope and estimates. Valid for ${validDays} days.`;

const days = (value: unknown, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
};

export const paymentTermsDays = (b?: Partial<Business> | null) => days(b?.paymentTermsDays, 14);
export const quoteValidDays = (b?: Partial<Business> | null) => Math.max(1, days(b?.quoteValidDays, 30));

export function addDays(isoDate: string, n: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Notes and due (or valid-until) date for a new quote or invoice from this business. */
export function documentDefaults(b: Partial<Business> | null | undefined, type: 'invoice' | 'quote', issueDate: string) {
  if (type === 'quote') {
    const valid = quoteValidDays(b);
    return { notes: b?.quoteTerms?.trim() || DEFAULT_QUOTE_TERMS(valid), dueDate: addDays(issueDate, valid) };
  }
  return { notes: b?.invoiceTerms?.trim() || DEFAULT_INVOICE_TERMS, dueDate: addDays(issueDate, paymentTermsDays(b)) };
}
