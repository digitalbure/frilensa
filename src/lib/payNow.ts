import type { Business, CRMDocument } from '../types';
import { getCurrencyConfig } from './currencies';

// "Pay now" on invoices: which methods a business offers, and what a PayPal or card payment
// will charge. Shared by the server (which creates the PayPal order) and the browser (which shows it).

/** Currencies PayPal accepts for payments. */
export const PAYPAL_CURRENCIES = ['AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'ILS', 'JPY', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'SEK', 'SGD', 'THB', 'TWD', 'USD'];
/** Offered as the charge currency for invoices in a currency PayPal doesn't take. */
export const PAYPAL_CHARGE_CURRENCIES = ['AUD', 'NZD', 'USD'];
const ZERO_DECIMAL = ['HUF', 'JPY', 'TWD'];

export function manualPayMethods(b?: Partial<Business> | null) {
  const p = b?.payNow || {};
  return {
    bank: Boolean(b?.bankDetails?.trim()) && p.bank !== false,
    mpaisa: Boolean(b?.mPaisaId?.trim()) && p.mpaisa !== false,
    mycash: Boolean(b?.myCashId?.trim()) && p.mycash !== false
  };
}

const round = (n: number, currency: string) => {
  const f = ZERO_DECIMAL.includes(currency) ? 1 : 100;
  return Math.round(n * f) / f;
};

/** What's left to pay on an invoice, in its own currency. */
export function balanceDue(d: Pick<CRMDocument, 'total' | 'status' | 'partiallyPaidAmount'>) {
  if (d.status === 'paid') return 0;
  const paid = d.status === 'partial' ? (d.partiallyPaidAmount || 0) : 0;
  return Math.max(0, Math.round((d.total - paid) * 100) / 100);
}

/** Value of one unit of `currency` in the home currency: the business's custom rate, else the app's approximate one. */
export function homeRate(currency: string, business: Partial<Business> | null | undefined, homeCurrency = 'FJD') {
  const cur = currency.toUpperCase(), home = homeCurrency.toUpperCase();
  if (cur === home) return 1;
  const custom = business?.customExchangeRates || {};
  return custom[cur] > 0 ? custom[cur] : (getCurrencyConfig(cur).approxFjdMultiplier || 1) / (getCurrencyConfig(home).approxFjdMultiplier || 1);
}

export interface PaypalQuote {
  /** Balance due in the invoice's currency. */
  balance: number;
  invoiceCurrency: string;
  /** Currency the client is charged in. */
  currency: string;
  /** Invoice currency units per one charge-currency unit (1 when they're the same). */
  rate: number;
  /** Balance converted to the charge currency. */
  amount: number;
  surchargePercent: number;
  surcharge: number;
  /** What the client pays. */
  total: number;
}

/**
 * The PayPal or card charge for an invoice. Invoices in a PayPal currency are charged as they are;
 * others (FJD, WST, TOP…) are converted to the business's PayPal currency at its custom exchange
 * rate, or the app's approximate rate when none is set.
 */
export function paypalQuote(
  d: Pick<CRMDocument, 'total' | 'status' | 'partiallyPaidAmount' | 'currency'>,
  business: Partial<Business> | null | undefined,
  homeCurrency = 'FJD'
): PaypalQuote | null {
  const balance = balanceDue(d);
  if (balance <= 0) return null;
  const invoiceCurrency = (d.currency || homeCurrency).toUpperCase();
  const currency = PAYPAL_CURRENCIES.includes(invoiceCurrency)
    ? invoiceCurrency
    : (PAYPAL_CURRENCIES.includes(String(business?.payNow?.paypalCurrency)) ? String(business!.payNow!.paypalCurrency) : 'AUD');
  const rate = currency === invoiceCurrency ? 1 : homeRate(currency, business, homeCurrency) / homeRate(invoiceCurrency, business, homeCurrency);
  const amount = round(balance / rate, currency);
  const surchargePercent = Math.min(10, Math.max(0, Number(business?.payNow?.surchargePercent) || 0));
  const surcharge = round(amount * surchargePercent / 100, currency);
  return { balance, invoiceCurrency, currency, rate: Math.round(rate * 1e6) / 1e6, amount, surchargePercent, surcharge, total: round(amount + surcharge, currency) };
}

export const formatMoney = (currency: string, n: number) =>
  `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: ZERO_DECIMAL.includes(currency) ? 0 : 2, maximumFractionDigits: ZERO_DECIMAL.includes(currency) ? 0 : 2 })}`;
