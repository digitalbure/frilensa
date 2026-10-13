import type { CRMData } from '../types';
import { normalizeDocuments } from './normalizeDocuments';

/**
 * Repairs list items with missing or malformed fields so every screen can render them, the same way
 * normalizeDocuments does for documents. Old builds, imports, the assistant and the API could store
 * a service without a rate, a bank line without an amount, a number saved as text, and so on; one
 * such item used to take a whole screen down ("Cannot read properties of undefined").
 * Valid items are returned untouched, and the data object is the same one if nothing changed.
 */

interface Shape {
  /** Numbers every item must have (missing or invalid becomes the default). */
  num?: Record<string, number>;
  /** Optional numbers: kept when valid, text like "12.5" becomes a number, anything else is removed. */
  optNum?: string[];
  /** Text every item must have. */
  str?: Record<string, string>;
}

const SHAPES: Partial<Record<keyof CRMData, Shape>> = {
  services: { num: { rate: 0 }, optNum: ['costPrice', 'stockQuantity', 'rushRate', 'weekendRate', 'retainerRate', 'minQuantity', 'maxQuantity'], str: { name: 'Service', unit: 'Unit' } },
  expenses: { num: { amount: 0 }, optNum: ['vatAmount', 'originalAmount', 'exchangeRate'], str: { date: '', category: 'Other', vendor: '' } },
  transactions: { num: { amount: 0 }, optNum: ['vatAmount', 'balance', 'originalAmount', 'exchangeRate', 'bankFee', 'netReceived', 'confidence'], str: { date: '', description: '', category: 'Uncategorised', bankName: '' } },
  rateRules: { num: { value: 0 }, str: { name: 'Rate rule', description: '' } },
  projects: { num: { cost: 0 }, str: { name: 'Project', description: '', startDate: '', endDate: '' } },
  recurringInvoices: { num: { amount: 0, billingDay: 1 } },
  clients: { str: { name: 'Client' } }
};

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function normalizeItem<T>(item: T, shape: Shape): T {
  const it = item as any;
  let fixed: any = null;
  const set = (k: string, v: unknown) => { fixed = fixed || { ...it }; if (v === undefined) delete fixed[k]; else fixed[k] = v; };
  for (const [k, dflt] of Object.entries(shape.num || {})) {
    if (typeof it[k] === 'number' && Number.isFinite(it[k])) continue;
    set(k, toNum(it[k]) ?? dflt);
  }
  for (const k of shape.optNum || []) {
    if (it[k] == null || (typeof it[k] === 'number' && Number.isFinite(it[k]))) continue;
    const n = toNum(it[k]);
    set(k, n === null ? undefined : n);
  }
  for (const [k, dflt] of Object.entries(shape.str || {})) {
    if (typeof it[k] === 'string') continue;
    set(k, typeof it[k] === 'number' ? String(it[k]) : dflt);
  }
  return (fixed || it) as T;
}

/** Documents and every list above, repaired. */
export function normalizeWorkspace(data: CRMData): CRMData {
  let out: any = normalizeDocuments(data);
  for (const [list, shape] of Object.entries(SHAPES) as [keyof CRMData, Shape][]) {
    const items = (out as any)[list];
    if (items == null) continue;
    if (!Array.isArray(items)) { out = { ...out, [list]: [] }; continue; }
    let changed = false;
    const next = items.filter((x: unknown) => {
      const ok = !!x && typeof x === 'object';
      if (!ok) changed = true;
      return ok;
    }).map((x: any) => {
      const n = normalizeItem(x, shape);
      if (n !== x) changed = true;
      return n;
    });
    if (changed) out = { ...out, [list]: next };
  }
  return out;
}
