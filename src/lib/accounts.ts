// Money accounts: the bank accounts, cash, cards and mobile money (M-PAiSA, MyCash) a business pays from and
// into. Kept on the workspace head (`bankAccounts`). Balances come from the journal (lib/journal.ts).
// An entry goes to the account it was given (accountId), or to the account whose payment methods match its
// method ("BSP", "M-PAiSA"), or to the default account, or else stays "not assigned" until the user picks one.

export type AccountKind = 'bank' | 'cash' | 'card' | 'mobile';
export const ACCOUNT_KINDS: Record<AccountKind, string> = { bank: 'Bank account', cash: 'Cash', card: 'Credit card', mobile: 'Mobile money' };

export interface MoneyAccount {
  id: string;
  businessId: string;
  name: string;
  kind: AccountKind;
  institution?: string;
  /** Last digits of the account or card number. */
  number?: string;
  /** The balance at the start of the opening date. A card you owe on is negative. */
  openingBalance: number;
  openingDate: string;
  /** Words in a payment method that mean this account, e.g. ["BSP", "Bank Transfer"]. */
  matchWords: string[];
  isDefault?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt?: string;
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Words a new account of this kind usually matches. */
export function suggestedMatchWords(kind: AccountKind, institution: string): string[] {
  const inst = institution.trim();
  if (kind === 'cash') return ['Cash'];
  if (kind === 'mobile') return /mycash/i.test(inst) ? ['MyCash'] : ['M-PAiSA', 'M-Paisa', 'Mpaisa'];
  if (kind === 'card') return ['Credit Card', 'Card'];
  return inst ? [inst.split(/\s+/)[0]] : ['Bank Transfer'];
}

/** Checks and tidies an account from the form. */
export function cleanAccount(raw: Partial<MoneyAccount>, now = new Date().toISOString()): MoneyAccount | string {
  const name = str(raw.name, 80);
  if (!name) return 'Give the account a name.';
  const kind: AccountKind = (['bank', 'cash', 'card', 'mobile'] as const).includes(raw.kind as AccountKind) ? raw.kind as AccountKind : 'bank';
  const opening = raw.openingBalance === undefined || (raw.openingBalance as unknown) === '' ? 0 : Number(raw.openingBalance);
  if (!Number.isFinite(opening) || Math.abs(opening) > 1e10) return 'Check the opening balance.';
  if (!isDate(raw.openingDate)) return 'Choose the date the opening balance is for.';
  const words = (raw.matchWords || []).map(w => str(w, 40)).filter(Boolean).slice(0, 10);
  return {
    id: raw.id || `acct-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    businessId: str(raw.businessId, 80),
    name, kind,
    institution: str(raw.institution, 80),
    number: str(raw.number, 20).replace(/[^0-9A-Za-z-]/g, ''),
    openingBalance: Math.round(opening * 100) / 100,
    openingDate: raw.openingDate,
    matchWords: words,
    isDefault: !!raw.isDefault,
    archived: !!raw.archived,
    createdAt: raw.createdAt || now,
    updatedAt: now
  };
}

/** Which account an entry belongs to: given, matched by payment method, or the default. Undefined: not assigned. */
export function resolveAccount(accounts: MoneyAccount[], ref: { accountId?: string; method?: string; businessId?: string }): MoneyAccount | undefined {
  const mine = accounts.filter(a => !ref.businessId || !a.businessId || a.businessId === ref.businessId);
  if (ref.accountId) {
    const a = mine.find(x => x.id === ref.accountId) || accounts.find(x => x.id === ref.accountId);
    if (a) return a;
  }
  const method = (ref.method || '').toLowerCase();
  if (method) {
    // The longest matching word wins ("BSP Fiji Bank Transfer" goes to BSP, not to the generic "Bank Transfer").
    let best: { a: MoneyAccount; len: number } | null = null;
    for (const a of mine) {
      if (a.archived) continue;
      for (const w of a.matchWords) {
        const word = w.toLowerCase();
        if (word && method.includes(word) && (!best || word.length > best.len)) best = { a, len: word.length };
      }
    }
    if (best) return best.a;
  }
  return mine.find(a => a.isDefault && !a.archived);
}
