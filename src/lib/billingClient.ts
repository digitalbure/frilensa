import { useEffect, useState } from 'react';
import type { CRMData, PlanTier } from '../types';
import { featureProblem, limitProblem, usageOf, type BillingCycle, type BillingSettings, type FeatureKey, type LimitKind, type Subscription } from './billing';
import { DEFAULT_PLATFORM_CONFIG } from './platformConfigShared';
import { publishedPlatformConfig } from './platformConfig';

export * from './billing';

// The signed-in user's plan as the server has it (/api/billing), and the upgrade prompt any screen can open.

export interface PlanPayment { receipt?: import('./billing').PlanReceipt; id: string; plan: PlanTier; planName: string; cycle: BillingCycle; amount: number; currency: string; method: string; reference: string; status: 'pending' | 'approved' | 'rejected' | 'failed'; reason?: string; createdAt: string; charged?: number; chargedCurrency?: string }
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

/**
 * Before using a plan feature (e.g. the client portal): whether the plan includes it. When it doesn't,
 * opens the plan picker and returns false. Always allowed until billing is switched on.
 */
export function allowFeature(feature: FeatureKey): boolean {
  const s = state;
  if (!s?.billing.enabled) return true;
  const config = publishedPlatformConfig() || DEFAULT_PLATFORM_CONFIG;
  const problem = featureProblem(config.plans, s.plan, feature);
  if (!problem) return true;
  openUpgrade(problem);
  return false;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const METHOD_NAMES: Record<string, string> = { paypal: 'PayPal', bank: 'Bank transfer', mpaisa: 'M-PAiSA', mycash: 'MyCash' };

/** Opens a plan payment's receipt (or tax invoice) in a new tab, ready to print or save as PDF. */
export async function openPlanReceipt(paymentId: string, admin = false) {
  const win = window.open('', '_blank');
  try {
    const { receipt: r } = await json<{ receipt: import('./billing').PlanReceipt }>(await fetch(`/api/${admin ? 'admin/' : ''}billing/receipts/${encodeURIComponent(paymentId)}`));
    const money = (n: number) => `${esc(r.currency)} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const title = r.taxInvoice ? 'Tax invoice' : 'Receipt';
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} ${esc(r.number)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:640px;margin:32px auto;padding:0 16px;font-size:14px}
h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #e2e8f0}
td.r{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#64748b}.row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.paid{display:inline-block;background:#dcfce7;color:#166534;font-weight:700;padding:2px 8px;border-radius:6px;font-size:12px}button{margin-top:24px}@media print{button{display:none}}</style></head><body>
<div class="row"><div><h1>${title}</h1><p class="muted">${esc(r.number)} · ${esc(r.issuedAt.slice(0, 10))}</p></div>
<div style="text-align:right"><strong>${esc(r.seller.legalName)}</strong><br>${esc(r.seller.address).replace(/\n/g, '<br>')}${r.seller.tin ? `<br>TIN ${esc(r.seller.tin)}` : ''}${r.seller.email ? `<br>${esc(r.seller.email)}` : ''}</div></div>
<p><span class="muted">To</span><br><strong>${esc(r.customer.name || r.customer.email)}</strong>${r.customer.name ? `<br>${esc(r.customer.email)}` : ''}</p>
<table><tr><td>${esc(r.line)}</td><td class="r">${money(r.amount)}</td></tr>
${r.taxInvoice ? `<tr><td class="muted">Includes VAT at ${esc(r.seller.vatRate)}%</td><td class="r muted">${money(r.vat)}</td></tr>` : ''}
<tr><td><strong>Total paid</strong></td><td class="r"><strong>${money(r.amount)}</strong></td></tr></table>
<p><span class="paid">PAID</span> ${esc(METHOD_NAMES[r.method] || r.method)} · reference ${esc(r.reference)}</p>
${r.seller.footer ? `<p class="muted">${esc(r.seller.footer)}</p>` : ''}
<button onclick="window.print()">Print or save as PDF</button></body></html>`;
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
  } catch (err: any) {
    if (win) win.close();
    alert(err?.message || 'The receipt could not be opened.');
  }
}
