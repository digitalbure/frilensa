// Utility for parsing Fiji bank statements (BSP NetBank, ANZ, Westpac, M-Paisa)
// Supports CSV, tab-separated tables, wrapped text, and unstructured lines.

export interface ParsedStatementItem {
  id?: string;
  date: string; // YYYY-MM-DD
  rawDate: string;
  description: string;
  amount: number; // Positive = Credit / Inflow, Negative = Debit / Outflow
  credit?: number;
  debit?: number;
  balance?: number;
  bankName: string;
  category: string;
  vatAmount: number;
  confidence: number;
  isForeignCurrency?: boolean;
  foreignCurrency?: string;
  foreignAmount?: number;
  exchangeRate?: number;
}

export interface ParseResult {
  transactions: ParsedStatementItem[];
  detectedFormat: 'bsp_csv' | 'bsp_table' | 'csv' | 'tsv' | 'space_delimited' | 'unstructured' | 'empty';
  bankIdentified: string;
  totalCredits: number;
  totalDebits: number;
  netFlow: number;
  rowCount: number;
}

// Format a date into YYYY-MM-DD (handling Fiji D/M/YYYY and DD/MM/YYYY)
export function parseFijiDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const clean = dateStr.trim().replace(/^["\']|["\']$/g, '');

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // D/M/YYYY or DD/MM/YYYY or D-M-YYYY or D.M.YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Fallback
  return clean;
}

// Clean and parse numbers (handling leading decimal points like .09, commas, and parentheses for negatives)
export function parseFijiNumber(val: any): number | undefined {
  if (val === undefined || val === null) return undefined;
  let clean = val.toString().trim().replace(/,/g, '').replace(/[$£€\s]/g, '');
  if (!clean) return undefined;
  if (clean.startsWith('(') && clean.endsWith(')')) {
    clean = '-' + clean.slice(1, -1);
  }
  const num = parseFloat(clean);
  return isNaN(num) ? undefined : num;
}

// Rule-based categorizer and Fiji VAT calculator
export function categorizeFijiTransaction(
  description: string,
  amount: number,
  vatRate: number = 12.5
): { category: string; vatAmount: number; confidence: number; foreignMeta?: { currency: string; amount: number; rate: number } } {
  const desc = (description || '').toLowerCase();
  const divisor = 1 + (vatRate / 100);

  // Check for Inward TT / Foreign currency remittance (e.g. AUD10500@0.6386)
  const ttMatch = description.match(/(AUD|USD|NZD|EUR|GBP|CAD|SGD|JPY)\s*([\d,]+(?:\.\d+)?)\s*@\s*([\d\.]+)/i);
  let foreignMeta: { currency: string; amount: number; rate: number } | undefined;
  if (ttMatch) {
    foreignMeta = {
      currency: ttMatch[1].toUpperCase(),
      amount: parseFloat(ttMatch[2].replace(/,/g, '')),
      rate: parseFloat(ttMatch[3])
    };
  }

  // 1. Bank Fees & Interest (Exempt financial supplies under Fiji VAT Act - 0% VAT)
  if (
    desc.includes('serv fee') ||
    desc.includes('service fee') ||
    desc.includes('ib fee') ||
    desc.includes('dr int') ||
    desc.includes('overdraft int') ||
    desc.includes('bank charge') ||
    desc.includes('interest charge') ||
    desc.includes('monthly fee') ||
    desc.includes('ledger fee')
  ) {
    return {
      category: 'Bank Fees & Charges',
      vatAmount: 0,
      confidence: 99
    };
  }

  // 2. Director Loan & Personal Drawings (Equity/Loan - 0% VAT)
  if (
    desc.includes('dir lon') ||
    desc.includes('directors loan') ||
    desc.includes('director loan') ||
    desc.includes('dir allow') ||
    desc.includes('director allowance') ||
    desc.includes('owner drawing') ||
    desc.includes('drawings')
  ) {
    return {
      category: 'Director Loan & Drawings',
      vatAmount: 0,
      confidence: 96
    };
  }

  // 3. Overseas Software & Cloud SaaS (Zero-rated / reverse-charge exempt - 0% VAT)
  if (
    desc.includes('google cloud') ||
    desc.includes('github') ||
    desc.includes('aws') ||
    desc.includes('vercel') ||
    desc.includes('adobe') ||
    desc.includes('openai') ||
    desc.includes('figma') ||
    desc.includes('apple') ||
    desc.includes('digitalocean') ||
    desc.includes('microsoft') ||
    desc.includes('subs payment') ||
    desc.includes('subscription')
  ) {
    return {
      category: 'Software SaaS',
      vatAmount: 0,
      confidence: 95
    };
  }

  // 4. Internet & Utilities (Local telecoms EFL, Starlink, Telecom Fiji, Vodafone)
  if (
    desc.includes('starlink') ||
    desc.includes('efl') ||
    desc.includes('telecom') ||
    desc.includes('tfl') ||
    desc.includes('vodafone internet') ||
    desc.includes('digicel internet') ||
    desc.includes('power station') ||
    desc.includes('electricity') ||
    desc.includes('water authority')
  ) {
    const vat = Number((amount - (amount / divisor)).toFixed(2));
    return {
      category: 'Internet & Utilities',
      vatAmount: vat,
      confidence: 92
    };
  }

  // 5. Travel & Transport (Fuel, taxi, bus, flights, transit visa)
  if (
    desc.includes('fuel') ||
    desc.includes('total') ||
    desc.includes('mobil') ||
    desc.includes('petrol') ||
    desc.includes('fiji airways') ||
    desc.includes('fiji link') ||
    desc.includes('taxi') ||
    desc.includes('parking') ||
    desc.includes('transit visa') ||
    desc.includes('visa app')
  ) {
    const isVisa = desc.includes('visa');
    const vat = isVisa ? 0 : Number((amount - (amount / divisor)).toFixed(2));
    return {
      category: 'Travel & Transport',
      vatAmount: vat,
      confidence: 90
    };
  }

  // 6. Subcontractors & Crew (Production, crewing fees, sound recordist, M-Paisa payouts to staff)
  if (
    desc.includes('crewing') ||
    desc.includes('sound recordist') ||
    desc.includes('mpaisa') ||
    desc.includes('m-paisa') ||
    desc.includes('contractor') ||
    desc.includes('freelancer') ||
    desc.includes('inv7072') ||
    desc.includes('crew') ||
    desc.includes('production assistant')
  ) {
    if (amount > 0) {
      // Income received for crewing/production
      const vat = Number((amount - (amount / divisor)).toFixed(2));
      return {
        category: 'Consulting Revenue',
        vatAmount: vat,
        confidence: 94
      };
    } else {
      // Payment to subcontractor/crew
      const vat = Number((amount - (amount / divisor)).toFixed(2));
      return {
        category: 'Subcontractors & Crew',
        vatAmount: vat,
        confidence: 92
      };
    }
  }

  // 7. Meals & Entertainment / Shopping
  if (
    desc.includes('shopping') ||
    desc.includes('shop') ||
    desc.includes('cafe') ||
    desc.includes('restaurant') ||
    desc.includes('coffee') ||
    desc.includes('lunch') ||
    desc.includes('dinner') ||
    desc.includes('food')
  ) {
    const vat = Number((amount - (amount / divisor)).toFixed(2));
    return {
      category: 'Meals & Entertainment',
      vatAmount: vat,
      confidence: 88
    };
  }

  // 8. Office Supplies & Admin
  if (
    desc.includes('admin') ||
    desc.includes('stationery') ||
    desc.includes('office') ||
    desc.includes('paper') ||
    desc.includes('mh') ||
    desc.includes('supermarket') ||
    desc.includes('hardware')
  ) {
    const vat = Number((amount - (amount / divisor)).toFixed(2));
    return {
      category: 'Office Supplies',
      vatAmount: vat,
      confidence: 87
    };
  }

  // 9. Taxes, Levies & Licensing
  if (
    desc.includes('frca') ||
    desc.includes('frcs') ||
    desc.includes('vat payment') ||
    desc.includes('provisional tax') ||
    desc.includes('business license') ||
    desc.includes('fnpf')
  ) {
    return {
      category: 'Tax & Licensing',
      vatAmount: 0,
      confidence: 96
    };
  }

  // Default fallback
  if (amount > 0) {
    // If foreign Inward TT, it's an exported service -> 0% VAT
    const isExported = desc.includes('inward tt') || foreignMeta !== undefined;
    const vat = isExported ? 0 : Number((amount - (amount / divisor)).toFixed(2));
    return {
      category: 'Consulting Revenue',
      vatAmount: vat,
      confidence: isExported ? 98 : 85,
      foreignMeta
    };
  } else {
    const vat = Number((amount - (amount / divisor)).toFixed(2));
    return {
      category: 'Other Expense',
      vatAmount: vat,
      confidence: 75
    };
  }
}

// Rejoin lines that were wrapped when pasted from browser table cells
function joinWrappedLines(rawText: string): string[] {
  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const normalized: string[] = [];
  const dateRegex = /^(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})/;

  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    const lower = l.toLowerCase();

    // Check if this is the start of a table header
    if (lower.includes('date') && (lower.includes('description') || lower.includes('balance') || lower.includes('credit') || lower.includes('debit'))) {
      normalized.push(l);
      continue;
    }

    // If line starts with a date, it starts a new transaction row
    if (dateRegex.test(l)) {
      normalized.push(l);
    } else if (normalized.length > 0 && !normalized[normalized.length - 1].toLowerCase().includes('date')) {
      // Append wrapped text to the preceding transaction line
      normalized[normalized.length - 1] += ' ' + l;
    } else {
      normalized.push(l);
    }
  }

  return normalized;
}

// Main parser function for BSP / Fiji Bank Statements
export function parseBankStatement(rawText: string, defaultVatRate: number = 12.5): ParseResult {
  if (!rawText || !rawText.trim()) {
    return {
      transactions: [],
      detectedFormat: 'empty',
      bankIdentified: 'BSP Fiji',
      totalCredits: 0,
      totalDebits: 0,
      netFlow: 0,
      rowCount: 0
    };
  }

  const cleanText = rawText.trim();
  const joinedLines = joinWrappedLines(cleanText);
  if (joinedLines.length === 0) {
    return {
      transactions: [],
      detectedFormat: 'empty',
      bankIdentified: 'BSP Fiji',
      totalCredits: 0,
      totalDebits: 0,
      netFlow: 0,
      rowCount: 0
    };
  }

  // Detect header row
  let headerIndex = -1;
  let delimiter = ',';
  let headers: string[] = [];

  for (let i = 0; i < Math.min(5, joinedLines.length); i++) {
    const l = joinedLines[i].toLowerCase();
    if (
      l.includes('date') &&
      (l.includes('description') ||
        l.includes('credit') ||
        l.includes('debit') ||
        l.includes('amount') ||
        l.includes('balance') ||
        l.includes('particulars'))
    ) {
      headerIndex = i;
      if (joinedLines[i].includes('\t')) delimiter = '\t';
      else if (joinedLines[i].includes(',')) delimiter = ',';
      else if (joinedLines[i].includes(';')) delimiter = ';';
      else if (joinedLines[i].includes('|')) delimiter = '|';
      headers = joinedLines[i]
        .split(delimiter)
        .map(h => h.trim().toLowerCase().replace(/^["\']|["\']$/g, ''));
      break;
    }
  }

  // Check if first line without header has tabs or commas
  if (headerIndex === -1 && joinedLines.length > 0) {
    const firstLine = joinedLines[0];
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(',')) delimiter = ',';
  }

  let dateCol = -1;
  let descCol = -1;
  let creditCol = -1;
  let debitCol = -1;
  let amountCol = -1;
  let balanceCol = -1;

  if (headerIndex >= 0) {
    headers.forEach((h, idx) => {
      if (h.includes('date')) dateCol = idx;
      else if (h.includes('desc') || h.includes('particular') || h.includes('narrative') || h.includes('detail')) descCol = idx;
      else if (h.includes('credit') || h === 'cr') creditCol = idx;
      else if (h.includes('debit') || h === 'dr') debitCol = idx;
      else if (h.includes('balance')) balanceCol = idx;
      else if (h.includes('amount')) amountCol = idx;
    });
  }

  const items: ParsedStatementItem[] = [];
  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;
  const dateRegex = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;

  // Check if structured delimiter parsing works
  const hasDelimiter = joinedLines.some(l => l.includes(delimiter));

  if (hasDelimiter && (headerIndex >= 0 || delimiter === '\t' || delimiter === ',')) {
    for (let i = startRow; i < joinedLines.length; i++) {
      const line = joinedLines[i];
      if (!line) continue;

      const cols = line.split(delimiter).map(c => c.trim().replace(/^["\']|["\']$/g, ''));
      if (cols.length < 2) continue;

      const rawDate = dateCol >= 0 ? cols[dateCol] : cols[0];
      const rawDesc = descCol >= 0 ? cols[descCol] : cols[1];
      const rawCredit = creditCol >= 0 ? parseFijiNumber(cols[creditCol]) : undefined;
      const rawDebit = debitCol >= 0 ? parseFijiNumber(cols[debitCol]) : undefined;
      const rawAmount = amountCol >= 0 ? parseFijiNumber(cols[amountCol]) : undefined;
      const rawBalance = balanceCol >= 0 ? parseFijiNumber(cols[balanceCol]) : undefined;

      let amount = 0;
      if (rawCredit !== undefined && !isNaN(rawCredit) && rawCredit > 0) {
        amount = rawCredit;
      } else if (rawDebit !== undefined && !isNaN(rawDebit) && rawDebit > 0) {
        amount = -rawDebit;
      } else if (rawAmount !== undefined) {
        amount = rawAmount;
      }

      if (rawDate || rawDesc || amount !== 0) {
        const catInfo = categorizeFijiTransaction(rawDesc, amount, defaultVatRate);
        items.push({
          id: `bsp-${Date.now()}-${i}`,
          date: parseFijiDate(rawDate),
          rawDate,
          description: rawDesc || 'Bank Transaction',
          amount: Number(amount.toFixed(2)),
          credit: rawCredit,
          debit: rawDebit,
          balance: rawBalance,
          bankName: 'BSP Fiji',
          category: catInfo.category,
          vatAmount: catInfo.vatAmount,
          confidence: catInfo.confidence,
          isForeignCurrency: !!catInfo.foreignMeta,
          foreignCurrency: catInfo.foreignMeta?.currency,
          foreignAmount: catInfo.foreignMeta?.amount,
          exchangeRate: catInfo.foreignMeta?.rate
        });
      }
    }
  }

  // Fallback: If delimiter parsing yielded nothing, parse as space-separated BSP NetBank table
  if (items.length === 0) {
    const rawRows: { rawDate: string; desc: string; rawAmt: number; balance?: number }[] = [];

    for (let i = 0; i < joinedLines.length; i++) {
      const line = joinedLines[i];
      if (line.toLowerCase().includes('date') && line.toLowerCase().includes('balance')) continue;

      const m = line.match(dateRegex);
      if (!m) continue;

      const rawDate = m[1];
      const rest = line.substring(m[0].length).trim();

      // Find currency numbers with 2 decimals at the end of the line: e.g. "1000.00 10191.10" or ".09 -6.12"
      const moneyMatches = [...rest.matchAll(/(?:^|\s)(-?\d*[\d,]*\.\d{2})(?=\s|$)/g)];
      if (moneyMatches.length >= 2) {
        const balanceStr = moneyMatches[moneyMatches.length - 1][1];
        const amountStr = moneyMatches[moneyMatches.length - 2][1];
        const matchIndex = moneyMatches[moneyMatches.length - 2].index || 0;
        const desc = rest.substring(0, matchIndex).trim();

        const balance = parseFloat(balanceStr.replace(/,/g, ''));
        const rawAmt = parseFloat(amountStr.replace(/,/g, ''));

        rawRows.push({
          rawDate,
          desc: desc || 'Bank Transaction',
          rawAmt: Math.abs(rawAmt),
          balance: isNaN(balance) ? undefined : balance
        });
      } else if (moneyMatches.length === 1) {
        const amountStr = moneyMatches[0][1];
        const matchIndex = moneyMatches[0].index || 0;
        const desc = rest.substring(0, matchIndex).trim();
        const rawAmt = parseFloat(amountStr.replace(/,/g, ''));

        rawRows.push({
          rawDate,
          desc: desc || 'Bank Transaction',
          rawAmt: Math.abs(rawAmt)
        });
      }
    }

    // Determine direction using balance delta and keywords
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const nextR = rawRows[i + 1];
      let isCredit = false;

      if (r.balance !== undefined && nextR?.balance !== undefined) {
        const diff = Math.round((r.balance - nextR.balance) * 100) / 100;
        if (Math.abs(diff - r.rawAmt) < 0.05) {
          isCredit = true;
        } else if (Math.abs(diff + r.rawAmt) < 0.05) {
          isCredit = false;
        }
      } else {
        const descLower = r.desc.toLowerCase();
        if (descLower.includes('dep trf') || descLower.includes('inward tt') || descLower.includes('deposit')) {
          isCredit = true;
        } else if (
          descLower.includes('ib funds transfer to') ||
          descLower.includes('ib bank transfer to') ||
          descLower.includes('serv fee') ||
          descLower.includes('ib fee') ||
          descLower.includes('dr int')
        ) {
          isCredit = false;
        }
      }

      const finalAmount = isCredit ? r.rawAmt : -r.rawAmt;
      const catInfo = categorizeFijiTransaction(r.desc, finalAmount, defaultVatRate);

      items.push({
        id: `bsp-${Date.now()}-${i}`,
        date: parseFijiDate(r.rawDate),
        rawDate: r.rawDate,
        description: r.desc,
        amount: Number(finalAmount.toFixed(2)),
        credit: isCredit ? r.rawAmt : undefined,
        debit: !isCredit ? r.rawAmt : undefined,
        balance: r.balance,
        bankName: 'BSP Fiji',
        category: catInfo.category,
        vatAmount: catInfo.vatAmount,
        confidence: catInfo.confidence,
        isForeignCurrency: !!catInfo.foreignMeta,
        foreignCurrency: catInfo.foreignMeta?.currency,
        foreignAmount: catInfo.foreignMeta?.amount,
        exchangeRate: catInfo.foreignMeta?.rate
      });
    }
  }

  // Calculate totals
  const totalCredits = items
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = items
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netFlow = totalCredits - totalDebits;

  // Identify bank
  let bankIdentified = 'BSP Fiji';
  const fullTextLower = rawText.toLowerCase();
  if (
    fullTextLower.includes('bsp') ||
    fullTextLower.includes('netbank') ||
    fullTextLower.includes('ib funds transfer') ||
    fullTextLower.includes('serv fee') ||
    fullTextLower.includes('dr int') ||
    fullTextLower.includes('dep trf') ||
    fullTextLower.includes('balance (fjd)') ||
    fullTextLower.includes('credit (fjd)')
  ) {
    bankIdentified = 'BSP Fiji';
  } else if (fullTextLower.includes('anz')) {
    bankIdentified = 'ANZ Fiji';
  } else if (fullTextLower.includes('westpac')) {
    bankIdentified = 'Westpac Fiji';
  } else if (fullTextLower.includes('m-paisa') || fullTextLower.includes('mpaisa')) {
    bankIdentified = 'Vodafone M-PAiSA';
  }

  return {
    transactions: items,
    detectedFormat: delimiter === ',' ? 'bsp_csv' : delimiter === '\t' ? 'bsp_table' : 'space_delimited',
    bankIdentified,
    totalCredits: Number(totalCredits.toFixed(2)),
    totalDebits: Number(totalDebits.toFixed(2)),
    netFlow: Number(netFlow.toFixed(2)),
    rowCount: items.length
  };
}

