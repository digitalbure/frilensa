import type { CRMData, CRMDocument } from '../types';
import { getDocumentHomeValues } from './currencies';

// VAT return figures for a period, shared by Bookkeeping → VAT return, the CSV export, the API and
// the MCP server. Amounts are in the home currency. Frilensa doesn't file anything: these are the
// figures to check and copy into the return.
//
// Sales
//   invoice basis:  invoices issued in the period (not drafts or cancelled), plus stand-alone receipts
//   payments basis: invoices paid in the period (part payments in proportion), plus stand-alone receipts
// Credit notes (invoice basis only) reduce the period they're issued in, when the invoice they cancel
//   was issued in an earlier period. If the invoice is from the same period it's simply left out.
// Purchases: expenses dated in the period marked "VAT claimable", and bank transactions marked
//   claimable that aren't already expenses. Nothing is claimed without that flag.

export type VatBasis = 'invoice' | 'payments';

export interface VatReturnOptions {
  from: string;          // YYYY-MM-DD
  to: string;            // YYYY-MM-DD
  basis?: VatBasis;      // default 'invoice'
  businessId?: string | null; // null or undefined: all businesses
}

export interface VatReturnLine {
  kind: 'sale' | 'credit_note' | 'purchase';
  id: string;
  date: string;
  reference: string;     // document number or vendor
  party: string;         // client or supplier
  currency: string;      // original currency
  gross: number;         // home currency, including VAT
  net: number;           // home currency, excluding VAT
  vat: number;           // home currency
  note?: string;
}

export interface VatReturn {
  period: { from: string; to: string };
  basis: VatBasis;
  currency: string;
  businessIds: string[];
  sales: { standardRated: number; zeroRatedOrExempt: number; outputVat: number; count: number };
  creditNotes: { net: number; vat: number; count: number };
  purchases: { gross: number; net: number; inputVat: number; count: number; notClaimedGross: number; notClaimedCount: number };
  /** Output VAT less credit-note VAT less input VAT. Negative means a refund is due. */
  netVat: number;
  lines: VatReturnLine[];
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (s?: string) => (s || '').slice(0, 10);
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function computeVatReturn(data: CRMData, opts: VatReturnOptions): VatReturn {
  const basis: VatBasis = opts.basis || 'invoice';
  const { from, to } = opts;
  const home = data.userProfile?.defaultCurrency || 'FJD';
  const inBusiness = (bid?: string) => !opts.businessId || bid === opts.businessId;
  const rates = (bid?: string) => data.businesses.find(b => b.id === bid)?.customExchangeRates;
  const clientName = (id: string) => data.clients.find(c => c.id === id)?.name || '';
  const conv = (d: CRMDocument) => getDocumentHomeValues(d, home, rates(d.businessId), data.transactions);

  const lines: VatReturnLine[] = [];
  const warnings: string[] = [];
  const sales = { standardRated: 0, zeroRatedOrExempt: 0, outputVat: 0, count: 0 };
  const creditNotes = { net: 0, vat: 0, count: 0 };
  let foreign = 0, drafts = 0, partials = 0, skippedCreditNotes = 0;

  const addSale = (d: CRMDocument, date: string, share = 1, note?: string) => {
    const c = conv(d);
    const gross = c.homeTotal * share;
    const vat = c.vatHome * share;
    const net = gross - vat;
    if (vat > 0) sales.standardRated += net; else sales.zeroRatedOrExempt += net;
    sales.outputVat += vat;
    sales.count++;
    if ((d.currency || home) !== home) foreign++;
    lines.push({ kind: 'sale', id: d.id, date, reference: d.documentNumber, party: clientName(d.clientId), currency: d.currency || home, gross: r2(gross), net: r2(net), vat: r2(vat), note });
  };

  const docs = (data.documents || []).filter(d => inBusiness(d.businessId));
  const byId = new Map(docs.map(d => [d.id, d]));

  for (const d of docs) {
    const issued = day(d.issueDate);
    if (d.type === 'invoice') {
      if (d.status === 'draft') {
        if (inRange(issued, from, to)) drafts++;
        continue;
      }
      if (d.status === 'cancelled') continue;
      if (basis === 'invoice') {
        if (inRange(issued, from, to)) addSale(d, issued);
      } else {
        const paidOn = day(d.paymentDate) || issued;
        if (!inRange(paidOn, from, to)) continue;
        if (d.status === 'paid') addSale(d, paidOn);
        else if (d.status === 'partial' && d.total > 0 && (d.partiallyPaidAmount || 0) > 0) {
          partials++;
          addSale(d, paidOn, Math.min(1, (d.partiallyPaidAmount || 0) / d.total), 'Part payment');
        }
      }
    } else if (d.type === 'receipt') {
      // Receipts issued for an invoice are the same sale; only stand-alone receipts count.
      if (!d.originalInvoiceId && d.status !== 'cancelled' && inRange(issued, from, to)) addSale(d, issued, 1, 'Receipt');
    } else if (d.type === 'credit_note' && inRange(issued, from, to)) {
      const original = d.originalInvoiceId ? byId.get(d.originalInvoiceId) : undefined;
      const declaredEarlier = original && day(original.issueDate) < from;
      if (basis !== 'invoice' || !declaredEarlier) {
        skippedCreditNotes++;
        continue;
      }
      const c = conv(d);
      creditNotes.net += c.homeTotal - c.vatHome;
      creditNotes.vat += c.vatHome;
      creditNotes.count++;
      lines.push({ kind: 'credit_note', id: d.id, date: issued, reference: d.documentNumber, party: clientName(d.clientId), currency: d.currency || home, gross: r2(-c.homeTotal), net: r2(-(c.homeTotal - c.vatHome)), vat: r2(-c.vatHome), note: original ? `Cancels ${original.documentNumber}` : undefined });
    }
  }

  const purchases = { gross: 0, net: 0, inputVat: 0, count: 0, notClaimedGross: 0, notClaimedCount: 0 };
  let claimableWithoutVat = 0;
  const expenseIds = new Set<string>();
  for (const e of data.expenses || []) {
    expenseIds.add(e.id);
    if (!inBusiness(e.businessId) || !inRange(day(e.date), from, to)) continue;
    const gross = e.amount || 0;
    if (!e.isVatClaimable) {
      purchases.notClaimedGross += gross;
      purchases.notClaimedCount++;
      continue;
    }
    const vat = e.vatAmount || 0;
    if (vat <= 0) claimableWithoutVat++;
    purchases.gross += gross;
    purchases.inputVat += vat;
    purchases.net += gross - vat;
    purchases.count++;
    lines.push({ kind: 'purchase', id: e.id, date: day(e.date), reference: e.description || e.vendor, party: e.vendor, currency: e.currency || home, gross: r2(gross), net: r2(gross - vat), vat: r2(vat) });
  }
  for (const t of data.transactions || []) {
    if (t.amount >= 0 || expenseIds.has(t.id) || !inBusiness(t.businessId) || !inRange(day(t.date), from, to)) continue;
    if (t.isVatClaimable !== true || !(t.vatAmount && t.vatAmount > 0)) continue;
    const gross = Math.abs(t.amount);
    purchases.gross += gross;
    purchases.inputVat += t.vatAmount;
    purchases.net += gross - t.vatAmount;
    purchases.count++;
    lines.push({ kind: 'purchase', id: t.id, date: day(t.date), reference: t.description, party: t.vendor || t.bankName || '', currency: home, gross: r2(gross), net: r2(gross - t.vatAmount), vat: r2(t.vatAmount), note: 'Bank transaction' });
  }

  const businessIds = opts.businessId ? [opts.businessId] : data.businesses.map(b => b.id);
  const missingTin = data.businesses.filter(b => businessIds.includes(b.id) && !(b.tin || '').trim());
  if (missingTin.length) warnings.push(`${missingTin.map(b => b.name).join(', ')} has no TIN. Add it in Settings so it shows on your tax invoices.`);
  if (claimableWithoutVat) warnings.push(`${claimableWithoutVat} expense${claimableWithoutVat === 1 ? ' is' : 's are'} marked VAT claimable but has no VAT amount, so nothing is claimed for ${claimableWithoutVat === 1 ? 'it' : 'them'}.`);
  if (drafts) warnings.push(`${drafts} draft invoice${drafts === 1 ? '' : 's'} dated in this period ${drafts === 1 ? 'is' : 'are'} not included.`);
  if (foreign) warnings.push(`${foreign} sale${foreign === 1 ? ' is' : 's are'} in another currency and converted to ${home} at the payment or exchange rate on record. Check the rate your accountant uses.`);
  if (partials) warnings.push(`${partials} part-paid invoice${partials === 1 ? ' is' : 's are'} included in proportion to the amount received.`);
  if (skippedCreditNotes) {
    warnings.push(basis === 'payments'
      ? `${skippedCreditNotes} credit note${skippedCreditNotes === 1 ? '' : 's'} in this period ${skippedCreditNotes === 1 ? 'is' : 'are'} not used on the payments basis; any refund you paid should be adjusted separately.`
      : `${skippedCreditNotes} credit note${skippedCreditNotes === 1 ? ' cancels an invoice' : 's cancel invoices'} from this same period, which ${skippedCreditNotes === 1 ? 'is' : 'are'} already left out.`);
  }

  lines.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const outputVat = r2(sales.outputVat);
  const cnVat = r2(creditNotes.vat);
  const inputVat = r2(purchases.inputVat);
  return {
    period: { from, to },
    basis,
    currency: home,
    businessIds,
    sales: { standardRated: r2(sales.standardRated), zeroRatedOrExempt: r2(sales.zeroRatedOrExempt), outputVat, count: sales.count },
    creditNotes: { net: r2(creditNotes.net), vat: cnVat, count: creditNotes.count },
    purchases: { gross: r2(purchases.gross), net: r2(purchases.net), inputVat, count: purchases.count, notClaimedGross: r2(purchases.notClaimedGross), notClaimedCount: purchases.notClaimedCount },
    netVat: r2(outputVat - cnVat - inputVat),
    lines,
    warnings
  };
}

/** Common VAT periods, as [from, to] for the period containing `today` (YYYY-MM-DD). */
export function vatPeriod(kind: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_half' | 'last_half' | 'this_year' | 'last_year', today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1-12
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const range = (yy: number, startM: number, months: number) => {
    const endM = startM + months - 1;
    const endY = yy + Math.floor((endM - 1) / 12);
    const endMonth = ((endM - 1) % 12) + 1;
    return { from: `${yy}-${pad(startM)}-01`, to: `${endY}-${pad(endMonth)}-${pad(lastDay(endY, endMonth))}` };
  };
  const shift = (yy: number, mm: number, by: number) => { const t = yy * 12 + (mm - 1) + by; return [Math.floor(t / 12), (t % 12) + 1] as const; };
  switch (kind) {
    case 'this_month': return range(y, m, 1);
    case 'last_month': { const [yy, mm] = shift(y, m, -1); return range(yy, mm, 1); }
    case 'this_quarter': return range(y, Math.floor((m - 1) / 3) * 3 + 1, 3);
    case 'last_quarter': { const [yy, mm] = shift(y, Math.floor((m - 1) / 3) * 3 + 1, -3); return range(yy, mm, 3); }
    case 'this_half': return range(y, m <= 6 ? 1 : 7, 6);
    case 'last_half': return m <= 6 ? range(y - 1, 7, 6) : range(y, 1, 6);
    case 'this_year': return range(y, 1, 12);
    case 'last_year': return range(y - 1, 1, 12);
  }
}
