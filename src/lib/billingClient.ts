import { useEffect, useState } from 'react';
import type { CRMData, PlanTier } from '../types';
import { limitProblem, usageOf, type BillingCycle, type BillingSettings, type LimitKind, type Subscription } from './billing';
import { DEFAULT_PLATFORM_CONFIG } from './platformConfigShared';
import { publishedPlatformConfig } from './platformConfig';

export * from './billing';

// The signed-in user's plan as the server has it (/api/billing), and the upgrade prompt any screen can open.

export interface PlanPayment { id: string; plan: PlanTier; planName: string; cycle: BillingCycle; amount: number; currency: string; method: string; reference: string; status: 'pending' | 'approved' | 'rejected' | 'failed'; reason?: string; createdAt: string; charged?: number; chargedCurrency?: string }
export interface BillingState {
  loaded: boolean;
  plan: PlanTier;
  subscription: Subscription | null;
  daysLeft: number | null;
  today: string;
  aiScansUsed: number;
  payments: PlanPayment[];
  billing: BillingSettings & { paypalClientId: string };
}

let state: BillingState | null = null;
const listeners = new Set<(s: BillingState | null) => void>();
let loading: Promise<BillingState | null> | null = null;

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Loads (or reloads) the plan from the server. */
export function refreshBilling(): Promise<BillingState | null> {
  loading = fetch('/api/billing').then(r => json<Omit<BillingState, 'loaded'>>(r))
    .then(b => { state = { ...b, loaded: true }; listeners.forEach(fn => fn(state)); return state; })
    .catch(() => state)
    .finally(() => { loading = null; });
  return loading;
}
export const loadBilling = () => loading || (state ? Promise.resolve(state) : refreshBilling());
/** Forget the plan (sign-out). */
export function clearBilling() { state = null; listeners.forEach(fn => fn(null)); }
export const currentBilling = () => state;

export function useBilling(): BillingState | null {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); return () => { listeners.delete(setS); }; }, []);
  return s;
}

export const switchPlanEarlyAccess = (plan: PlanTier) => post('/api/billing/early-access', { plan }).then(r => json<{ plan: PlanTier }>(r)).then(async r => { await refreshBilling(); return r; });
export const payManually = (plan: PlanTier, cycle: BillingCycle, method: 'bank' | 'mpaisa' | 'mycash', reference: string) =>
  post('/api/billing/manual', { plan, cycle, method, reference }).then(r => json<{ payment: PlanPayment }>(r)).then(async r => { await refreshBilling(); return r; });
export const startPaypalPayment = (plan: PlanTier, cycle: BillingCycle) => post('/api/billing/paypal/order', { plan, cycle }).then(r => json<{ orderId: string }>(r)).then(r => r.orderId);
export const finishPaypalPayment = (orderId: string) => post('/api/billing/paypal/capture', { orderId }).then(r => json<{ ok: true; plan: PlanTier }>(r)).then(async r => { await refreshBilling(); return r; });

// ---------- Limits and the upgrade prompt ----------

const upgradeListeners = new Set<(reason: string) => void>();
/** Opens the plan picker with a reason, e.g. after reaching a limit. */
export function openUpgrade(reason = '') { upgradeListeners.forEach(fn => fn(reason)); }
export function onUpgradeRequest(fn: (reason: string) => void) { upgradeListeners.add(fn); return () => { upgradeListeners.delete(fn); }; }

/**
 * Before adding something: whether the plan allows one more. When it doesn't, opens the plan picker and
 * returns false. Always allowed until billing is switched on.
 */
export function allowAnother(data: CRMData, kind: Exclude<LimitKind, 'aiScans'>): boolean {
  const s = state;
  const config = publishedPlatformConfig() || DEFAULT_PLATFORM_CONFIG;
  if (!s?.billing.enabled) return true;
  const plan = config.plans[s.plan] || DEFAULT_PLATFORM_CONFIG.plans[s.plan];
  const problem = limitProblem(plan, kind, usageOf(data, (s.today || new Date().toISOString()).slice(0, 7))[kind]);
  if (!problem) return true;
  openUpgrade(problem);
  return false;
}
