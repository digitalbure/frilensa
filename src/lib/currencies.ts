/**
 * Fiji Freelancer CRM - Currency Management & Multi-Currency Conversion Utilities
 */

export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  region: string;
  // Indicative exchange rate to 1 FJD (for instant calculation hints)
  // E.g. 1 AUD = ~1.48 FJD, so 100 AUD = 148 FJD
  approxFjdMultiplier: number;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  {
    code: 'FJD',
    name: 'Fiji Dollar (Local)',
    symbol: 'FJ$',
    flag: '🇫🇯',
    region: 'Fiji',
    approxFjdMultiplier: 1.0
  },
  {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    flag: '🇦🇺',
    region: 'Australia',
    approxFjdMultiplier: 1.485
  },
  {
    code: 'NZD',
    name: 'New Zealand Dollar',
    symbol: 'NZ$',
    flag: '🇳🇿',
    region: 'New Zealand',
    approxFjdMultiplier: 1.365
  },
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: 'US$',
    flag: '🇺🇸',
    region: 'United States / Global',
    approxFjdMultiplier: 2.254
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    flag: '🇪🇺',
    region: 'European Union',
    approxFjdMultiplier: 2.452
  },
  {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    flag: '🇬🇧',
    region: 'United Kingdom',
    approxFjdMultiplier: 2.875
  },
  {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'CA$',
    flag: '🇨🇦',
    region: 'Canada',
    approxFjdMultiplier: 1.635
  },
  {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'SG$',
    flag: '🇸🇬',
    region: 'Singapore',
    approxFjdMultiplier: 1.712
  },
  {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    flag: '🇯🇵',
    region: 'Japan',
    approxFjdMultiplier: 0.0152
  },
  {
    code: 'PGK',
    name: 'Papua New Guinea Kina',
    symbol: 'K',
    flag: '🇵🇬',
    region: 'Papua New Guinea',
    approxFjdMultiplier: 0.575
  },
  {
    code: 'WST',
    name: 'Samoan Tālā',
    symbol: 'WS$',
    flag: '🇼🇸',
    region: 'Samoa',
    approxFjdMultiplier: 0.825
  },
  {
    code: 'SBD',
    name: 'Solomon Islands Dollar',
    symbol: 'SI$',
    flag: '🇸🇧',
    region: 'Solomon Islands',
    approxFjdMultiplier: 0.265
  },
  {
    code: 'VUV',
    name: 'Vanuatu Vatu',
    symbol: 'VT',
    flag: '🇻🇺',
    region: 'Vanuatu',
    approxFjdMultiplier: 0.0188
  },
  {
    code: 'TOP',
    name: 'Tongan Paʻanga',
    symbol: 'T$',
    flag: '🇹🇴',
    region: 'Tonga',
    approxFjdMultiplier: 0.945
  },
  {
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: 'CN¥',
    flag: '🇨🇳',
    region: 'China',
    approxFjdMultiplier: 0.312
  },
  {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    flag: '🇮🇳',
    region: 'India',
    approxFjdMultiplier: 0.0268
  }
];

export function getCurrencyConfig(code?: string): CurrencyConfig {
  if (!code) {
    return SUPPORTED_CURRENCIES[0];
  }
  const found = SUPPORTED_CURRENCIES.find(
    c => c.code.toUpperCase() === code.trim().toUpperCase()
  );
  if (found) return found;

  // Generic fallback if user typed a custom 3-letter code
  return {
    code: code.toUpperCase(),
    name: `${code.toUpperCase()} Currency`,
    symbol: `${code.toUpperCase()} $`,
    flag: '🌐',
    region: 'International',
    approxFjdMultiplier: 1.0
  };
}

export function formatCurrencyAmount(
  amount: number,
  currencyCode: string = 'FJD',
  options?: {
    showCode?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const cfg = getCurrencyConfig(currencyCode);
  const minDec = options?.minimumFractionDigits ?? 2;
  const maxDec = options?.maximumFractionDigits ?? 2;
  
  const numStr = (amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec
  });

  if (options?.showCode) {
    return `${cfg.code} ${cfg.symbol}${numStr}`;
  }
  return `${cfg.code} ${numStr}`;
}

export interface FxConversionParams {
  foreignAmount: number;
  foreignCurrency: string;
  homeCurrency: string;
  exchangeRate?: number; // 1 Foreign = X Home
  grossHomeAmount?: number; // Total received before deductions
  bankFeesDeduction?: number; // Deductions (e.g. telegraphic transfer fee)
}

export interface FxConversionResult {
  foreignAmount: number;
  foreignCurrency: string;
  homeCurrency: string;
  exchangeRate: number; // e.g. 1 AUD = 1.485 FJD
  grossHomeAmount: number; // e.g. 1485.00 FJD
  bankFeesDeduction: number; // e.g. 15.00 FJD
  netReceivedHome: number; // e.g. 1470.00 FJD
  effectiveNetExchangeRate: number; // e.g. 1.4700 FJD
}

export function computeFxConversion({
  foreignAmount,
  foreignCurrency,
  homeCurrency,
  exchangeRate,
  grossHomeAmount,
  bankFeesDeduction = 0
}: FxConversionParams): FxConversionResult {
  const fAmount = Math.max(0, Number(foreignAmount) || 0);
  const fFees = Math.max(0, Number(bankFeesDeduction) || 0);

  let finalRate = exchangeRate || 0;
  let finalGross = grossHomeAmount || 0;

  if (exchangeRate && exchangeRate > 0) {
    finalGross = fAmount * exchangeRate;
    finalRate = exchangeRate;
  } else if (grossHomeAmount && grossHomeAmount > 0 && fAmount > 0) {
    finalRate = grossHomeAmount / fAmount;
    finalGross = grossHomeAmount;
  } else {
    // Default fallback to approx multiplier
    const cfg = getCurrencyConfig(foreignCurrency);
    finalRate = cfg.approxFjdMultiplier || 1.0;
    finalGross = fAmount * finalRate;
  }

  const netReceived = Math.max(0, finalGross - fFees);
  const effectiveNetRate = fAmount > 0 ? netReceived / fAmount : finalRate;

  return {
    foreignAmount: fAmount,
    foreignCurrency,
    homeCurrency,
    exchangeRate: Number(finalRate.toFixed(4)),
    grossHomeAmount: Number(finalGross.toFixed(2)),
    bankFeesDeduction: Number(fFees.toFixed(2)),
    netReceivedHome: Number(netReceived.toFixed(2)),
    effectiveNetExchangeRate: Number(effectiveNetRate.toFixed(4))
  };
}

/**
 * Universal Currency Conversion between any two supported currencies
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string = 'FJD',
  toCurrency: string = 'FJD',
  customRate?: number
): {
  convertedAmount: number;
  rate: number;
  fromCurrency: string;
  toCurrency: string;
} {
  const fromCode = (fromCurrency || 'FJD').trim().toUpperCase();
  const toCode = (toCurrency || 'FJD').trim().toUpperCase();
  const numAmount = Math.max(0, Number(amount) || 0);

  if (fromCode === toCode) {
    return {
      convertedAmount: numAmount,
      rate: 1.0,
      fromCurrency: fromCode,
      toCurrency: toCode
    };
  }

  if (customRate && customRate > 0) {
    return {
      convertedAmount: Number((numAmount * customRate).toFixed(2)),
      rate: customRate,
      fromCurrency: fromCode,
      toCurrency: toCode
    };
  }

  const fromCfg = getCurrencyConfig(fromCode);
  const toCfg = getCurrencyConfig(toCode);

  // Both relative to 1 FJD multiplier:
  // 1 fromCode = fromCfg.approxFjdMultiplier FJD
  // 1 toCode = toCfg.approxFjdMultiplier FJD
  // So 1 fromCode = (fromCfg.approxFjdMultiplier / toCfg.approxFjdMultiplier) toCode
  const fromToFjd = fromCfg.approxFjdMultiplier || 1.0;
  const toToFjd = toCfg.approxFjdMultiplier || 1.0;
  const rate = toToFjd > 0 ? (fromToFjd / toToFjd) : 1.0;

  const convertedAmount = numAmount * rate;

  return {
    convertedAmount: Number(convertedAmount.toFixed(2)),
    rate: Number(rate.toFixed(4)),
    fromCurrency: fromCode,
    toCurrency: toCode
  };
}

/**
 * Resolve project currency from explicit project field, associated client currency, or user profile default
 */
export function resolveProjectCurrency(
  project?: { currency?: string; clientId?: string } | null,
  client?: { currency?: string } | null,
  defaultCurrency: string = 'FJD'
): string {
  if (project?.currency && project.currency.trim()) {
    return project.currency.trim().toUpperCase();
  }
  if (client?.currency && client.currency.trim()) {
    return client.currency.trim().toUpperCase();
  }
  return (defaultCurrency || 'FJD').trim().toUpperCase();
}

export interface DocumentHomeConversion {
  homeTotal: number;
  foreignTotal: number;
  currency: string;
  baseCurrency: string;
  effectiveRate: number;
  isForeign: boolean;
  vatHome: number;
  conversionText: string;
  bankFee: number;
  isNetSettled: boolean;
}

/**
 * Accurately normalizes any document (Invoice, Quote, Receipt) into the user's base/home currency (e.g. FJD),
 * respecting ledger settlements, inward TT exchange rates, and bank charges.
 */
export function getDocumentHomeValues(
  doc: {
    id?: string;
    documentNumber?: string;
    type?: string;
    status?: string;
    currency?: string;
    total: number;
    subtotal?: number;
    vatAmount?: number;
    vatRate?: number;
    isTaxExempt?: boolean;
    paidAmountForeign?: number;
    paidAmountHome?: number;
    netReceivedHome?: number;
    exchangeRate?: number;
    bankFeesDeduction?: number;
    paymentReference?: string;
  },
  baseCurrency: string = 'FJD',
  customExchangeRates?: Record<string, number>,
  transactions?: Array<{
    id?: string;
    documentId?: string;
    referenceNumber?: string;
    description?: string;
    amount: number;
    currency?: string;
    originalAmount?: number;
    exchangeRate?: number;
    bankFee?: number;
    netReceived?: number;
  }>
): DocumentHomeConversion {
  const baseCode = (baseCurrency || 'FJD').trim().toUpperCase();
  const docCode = (doc.currency || baseCode).trim().toUpperCase();
  const rawTotal = Number(doc.total) || 0;
  const isForeign = docCode !== baseCode;

  if (!isForeign) {
    const vatAmt = doc.isTaxExempt || doc.vatRate === 0 ? 0 : (doc.vatAmount ?? 0);
    return {
      homeTotal: rawTotal,
      foreignTotal: rawTotal,
      currency: baseCode,
      baseCurrency: baseCode,
      effectiveRate: 1.0,
      isForeign: false,
      vatHome: vatAmt,
      conversionText: '',
      bankFee: doc.bankFeesDeduction || 0,
      isNetSettled: doc.status === 'paid'
    };
  }

  // Document is in a foreign currency (e.g. AUD, USD, NZD)
  const foreignTotal = doc.paidAmountForeign !== undefined && doc.paidAmountForeign > 0
    ? doc.paidAmountForeign
    : rawTotal;

  let homeTotal = 0;
  let effectiveRate = 1.0;
  let bankFee = doc.bankFeesDeduction || 0;
  let isNetSettled = false;

  // 1. Direct explicit settled values on document
  if (doc.netReceivedHome !== undefined && doc.netReceivedHome > 0) {
    homeTotal = doc.netReceivedHome;
    effectiveRate = foreignTotal > 0 ? (homeTotal / foreignTotal) : (doc.exchangeRate || 1.0);
    isNetSettled = true;
  } else if (doc.paidAmountHome !== undefined && doc.paidAmountHome > 0) {
    homeTotal = doc.paidAmountHome;
    effectiveRate = foreignTotal > 0 ? (homeTotal / foreignTotal) : (doc.exchangeRate || 1.0);
    isNetSettled = true;
  } else {
    // 2. Check linked transactions in the ledger
    let linkedTx: any = null;
    if (transactions && transactions.length > 0) {
      linkedTx = transactions.find(t => {
        if (doc.id && t.documentId && (t.documentId === doc.id || t.documentId.split(',').map(s => s.trim()).includes(doc.id))) {
          return true;
        }
        if (doc.paymentReference && t.referenceNumber && t.referenceNumber.includes(doc.paymentReference)) {
          return true;
        }
        if (doc.documentNumber && t.description && t.description.toLowerCase().includes(doc.documentNumber.toLowerCase())) {
          return true;
        }
        return false;
      });
    }

    if (linkedTx) {
      const txNet = linkedTx.netReceived ?? linkedTx.amount;
      const txOrig = linkedTx.originalAmount;
      if (txOrig && txOrig > 0 && txOrig !== foreignTotal) {
        // Multi-invoice settlement proportion
        const proportion = foreignTotal / txOrig;
        homeTotal = Number((txNet * proportion).toFixed(2));
      } else {
        homeTotal = txNet;
      }
      effectiveRate = foreignTotal > 0 ? (homeTotal / foreignTotal) : (linkedTx.exchangeRate || 1.0);
      bankFee = linkedTx.bankFee ? (linkedTx.bankFee * (foreignTotal / (txOrig || foreignTotal))) : 0;
      isNetSettled = true;
    } else if (doc.exchangeRate !== undefined && doc.exchangeRate > 0) {
      // 3. Document has explicit exchange rate recorded
      homeTotal = Number((foreignTotal * doc.exchangeRate).toFixed(2));
      effectiveRate = doc.exchangeRate;
    } else if (customExchangeRates && customExchangeRates[docCode] && customExchangeRates[docCode] > 0) {
      // 4. Business custom exchange rate
      homeTotal = Number((foreignTotal * customExchangeRates[docCode]).toFixed(2));
      effectiveRate = customExchangeRates[docCode];
    } else {
      // 5. Standard currency conversion table fallback
      const conv = convertCurrency(foreignTotal, docCode, baseCode);
      homeTotal = conv.convertedAmount;
      effectiveRate = conv.rate;
    }
  }

  // VAT in home currency
  let vatHome = 0;
  if (!doc.isTaxExempt && doc.vatRate !== 0 && (doc.vatAmount || 0) > 0) {
    vatHome = Number(((doc.vatAmount || 0) * effectiveRate).toFixed(2));
  }

  const foreignSymbol = getCurrencyConfig(docCode).symbol;
  const baseSymbol = getCurrencyConfig(baseCode).symbol;
  const conversionText = `${foreignSymbol}${foreignTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${docCode} → ${baseSymbol}${homeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCode}`;

  return {
    homeTotal: Number(homeTotal.toFixed(2)),
    foreignTotal: Number(foreignTotal.toFixed(2)),
    currency: docCode,
    baseCurrency: baseCode,
    effectiveRate: Number(effectiveRate.toFixed(4)),
    isForeign: true,
    vatHome,
    conversionText,
    bankFee: Number(bankFee.toFixed(2)),
    isNetSettled
  };
}

export interface BusinessFinancialStats {
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  totalQuotes: number;
  totalVatCollected: number;
  paidInvoicesCount: number;
  totalItemsQuantity: number;
  foreignCurrenciesPaid: Record<string, { foreignAmount: number; homeAmount: number; count: number; effectiveRate: number }>;
  hasForeignIncome: boolean;
  primaryForeignSummary: string;
  currencyBreakdown: Array<{
    code: string;
    symbol: string;
    flag: string;
    foreignTotal: number;
    homeTotal: number;
    count: number;
    effectiveRate: number;
  }>;
}

/**
 * Calculates unified business financial statistics normalized to base currency
 */
export function calculateBusinessFinancialStats(
  documents: any[] = [],
  transactions: any[] = [],
  activeBusinessId?: string,
  baseCurrency: string = 'FJD',
  customExchangeRates?: Record<string, number>
): BusinessFinancialStats {
  const baseCode = (baseCurrency || 'FJD').trim().toUpperCase();
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let totalQuotes = 0;
  let totalVatCollected = 0;
  let paidInvoicesCount = 0;
  let totalItemsQuantity = 0;

  const foreignCurrenciesPaid: Record<string, { foreignAmount: number; homeAmount: number; count: number; effectiveRate: number }> = {};

  const filteredDocs = documents.filter(doc => !activeBusinessId || doc.businessId === activeBusinessId);

  filteredDocs.forEach(doc => {
    const conv = getDocumentHomeValues(doc, baseCode, customExchangeRates, transactions);

    if (doc.type === 'invoice') {
      totalInvoiced += conv.homeTotal;
      if (doc.status === 'paid') {
        totalPaid += conv.homeTotal;
        totalVatCollected += conv.vatHome;
        paidInvoicesCount++;

        if (conv.isForeign) {
          if (!foreignCurrenciesPaid[conv.currency]) {
            foreignCurrenciesPaid[conv.currency] = {
              foreignAmount: 0,
              homeAmount: 0,
              count: 0,
              effectiveRate: conv.effectiveRate
            };
          }
          foreignCurrenciesPaid[conv.currency].foreignAmount += conv.foreignTotal;
          foreignCurrenciesPaid[conv.currency].homeAmount += conv.homeTotal;
          foreignCurrenciesPaid[conv.currency].count++;
        }
      } else if (doc.status === 'draft' || doc.status === 'sent' || doc.status === 'partial') {
        if (doc.status === 'partial' && doc.partiallyPaidAmount) {
          const partialPaidConv = getDocumentHomeValues({ ...doc, total: doc.partiallyPaidAmount }, baseCode, customExchangeRates, transactions);
          totalPaid += partialPaidConv.homeTotal;
          totalPending += Math.max(0, conv.homeTotal - partialPaidConv.homeTotal);
        } else {
          totalPending += conv.homeTotal;
        }
      }
    } else if (doc.type === 'receipt') {
      totalPaid += conv.homeTotal;
      totalVatCollected += conv.vatHome;
      paidInvoicesCount++;

      if (conv.isForeign) {
        if (!foreignCurrenciesPaid[conv.currency]) {
          foreignCurrenciesPaid[conv.currency] = {
            foreignAmount: 0,
            homeAmount: 0,
            count: 0,
            effectiveRate: conv.effectiveRate
          };
        }
        foreignCurrenciesPaid[conv.currency].foreignAmount += conv.foreignTotal;
        foreignCurrenciesPaid[conv.currency].homeAmount += conv.homeTotal;
        foreignCurrenciesPaid[conv.currency].count++;
      }
    } else if (doc.type === 'quote') {
      totalQuotes += conv.homeTotal;
    }

    if (Array.isArray(doc.items)) {
      doc.items.forEach((it: any) => {
        totalItemsQuantity += Number(it.quantity || 1);
      });
    }
  });

  const foreignKeys = Object.keys(foreignCurrenciesPaid);
  const hasForeignIncome = foreignKeys.length > 0;
  let primaryForeignSummary = '';

  const currencyBreakdown = foreignKeys.map(code => {
    const cfg = getCurrencyConfig(code);
    const item = foreignCurrenciesPaid[code];
    const avgRate = item.foreignAmount > 0 ? (item.homeAmount / item.foreignAmount) : item.effectiveRate;
    return {
      code,
      symbol: cfg.symbol,
      flag: cfg.flag,
      foreignTotal: Number(item.foreignAmount.toFixed(2)),
      homeTotal: Number(item.homeAmount.toFixed(2)),
      count: item.count,
      effectiveRate: Number(avgRate.toFixed(4))
    };
  });

  if (hasForeignIncome) {
    const parts = currencyBreakdown.map(b => `${b.symbol}${b.foreignTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${b.code} converted`);
    primaryForeignSummary = parts.join(', ');
  }

  return {
    totalInvoiced: Number(totalInvoiced.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalPending: Number(totalPending.toFixed(2)),
    totalQuotes: Number(totalQuotes.toFixed(2)),
    totalVatCollected: Number(totalVatCollected.toFixed(2)),
    paidInvoicesCount,
    totalItemsQuantity,
    foreignCurrenciesPaid,
    hasForeignIncome,
    primaryForeignSummary,
    currencyBreakdown
  };
}
