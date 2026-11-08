import type { CRMData, PlanFeatureConfig, PlanTier } from '../types';

// Paid plans. Plans are prepaid for a month or a year; there's no automatic renewal. A user's plan is
// kept on the server (subscriptions/{uid}); the copy in their workspace is only for display.
// Until admins switch billing on, everyone can switch plans for free (early access) and limits aren't enforced.

export type BillingCycle = 'monthly' | 'annual';
export type PayMethod = 'paypal' | 'bank' | 'mpaisa' | 'mycash' | 'admin' | 'early_access';

export interface BillingSettings {
  /** Plans must be paid for, and plan limits are enforced. */
  enabled: boolean;
  /** Early-access Pro and Premium plans keep working until this date (YYYY-MM-DD) once billing is on. Empty: they end when billing starts. */
  earlyAccessUntil: string;
  /** Days a plan keeps working after it runs out, before it moves back to Free. */
  graceDays: number;
  /** PayPal and card payments, with Frilensa's own PayPal keys (set on the server). */
  paypal: boolean;
  /** PayPal can't charge FJD: the currency it charges in, and how many of it one FJD buys. */
  paypalCurrency: string;
  paypalRate: number;
  /** Manual payments, which an admin approves. */
  bankDetails: string;
  mpaisa: string;
  mycash: string;
  instructions: string;
  /** Frilensa's details for receipts and tax invoices. */
  seller: { legalName: string; tin: string; address: string; email: string; vatRegistered: boolean; vatRate: number; footer: string };
}

export const DEFAULT_BILLING: BillingSettings = {
  enabled: false, earlyAccessUntil: '', graceDays: 7,
  paypal: false, paypalCurrency: 'AUD', paypalRate: 0.66,
  bankDetails: '', mpaisa: '', mycash: '', instructions: '',
  seller: { legalName: 'Frilensa', tin: '', address: '', email: '', vatRegistered: false, vatRate: 12.5, footer: '' }
};

const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const PAYPAL_BILLING_CURRENCIES = ['AUD', 'USD', 'NZD'];

export function cleanBilling(raw: any): BillingSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rate = Number(r.paypalRate);
  return {
    enabled: r.enabled === true,
    earlyAccessUntil: isDate(r.earlyAccessUntil) ? r.earlyAccessUntil : '',
    graceDays: Number.isFinite(Number(r.graceDays)) ? Math.min(60, Math.max(0, Math.round(Number(r.graceDays)))) : DEFAULT_BILLING.graceDays,
    paypal: r.paypal === true,
    paypalCurrency: PAYPAL_BILLING_CURRENCIES.includes(r.paypalCurrency) ? r.paypalCurrency : DEFAULT_BILLING.paypalCurrency,
    paypalRate: Number.isFinite(rate) && rate > 0 && rate < 100 ? Math.round(rate * 10000) / 10000 : DEFAULT_BILLING.paypalRate,
    bankDetails: str(r.bankDetails, 500), mpaisa: str(r.mpaisa, 60), mycash: str(r.mycash, 60), instructions: str(r.instructions, 500),
    seller: {
      legalName: str(r.seller?.legalName, 120) || DEFAULT_BILLING.seller.legalName,
      tin: str(r.seller?.tin, 40), address: str(r.seller?.address, 300), email: str(r.seller?.email, 120),
      vatRegistered: r.seller?.vatRegistered === true,
      vatRate: Number.isFinite(Number(r.seller?.vatRate)) && Number(r.seller?.vatRate) >= 0 && Number(r.seller?.vatRate) <= 50 ? Math.round(Number(r.seller.vatRate) * 100) / 100 : DEFAULT_BILLING.seller.vatRate,
      footer: str(r.seller?.footer, 300)
    }
  };
}

export interface Subscription {
  uid: string;
  plan: PlanTier;
  status: 'active' | 'expired';
  method: PayMethod;
  cycle?: BillingCycle;
  /** Last day the plan is paid for (YYYY-MM-DD). Empty for early access or an open-ended admin grant. */
  paidUntil: string;
  updatedAt: string;
  note?: string;
}

const PAID: PlanTier[] = ['pro', 'premium'];
export const isPaidPlan = (p: unknown): p is 'pro' | 'premium' => PAID.includes(p as PlanTier);

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** The last day of a period starting on `start`: a month (or a year) less a day. */
export function periodEnd(start: string, cycle: BillingCycle) {
  const d = new Date(`${start}T00:00:00Z`);
  const day = d.getUTCDate();
  if (cycle === 'annual') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else {
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The plan someone is on today. Paid time counts until paidUntil plus the grace days. Before billing is
 * on, their chosen plan applies (early access); after, early-access plans last until earlyAccessUntil.
 * `legacyPlan` is the plan saved in their workspace by older versions.
 */
export function effectivePlan(sub: Subscription | null | undefined, legacyPlan: unknown, billing: BillingSettings, today: string): PlanTier {
  const chosen: PlanTier = sub?.plan || (isPaidPlan(legacyPlan) ? legacyPlan : 'free');
  if (!billing.enabled) return chosen;
  if (sub && sub.status === 'active' && isPaidPlan(sub.plan) && sub.method !== 'early_access') {
    if (!sub.paidUntil || addDays(sub.paidUntil, billing.graceDays) >= today) return sub.plan;
    return 'free';
  }
  const earlyAccess = (!sub || sub.method === 'early_access') && isPaidPlan(chosen);
  if (earlyAccess && billing.earlyAccessUntil && today <= billing.earlyAccessUntil) return chosen;
  return 'free';
}

/** Days left on a paid plan (negative once it has run out), or null when it doesn't run out. */
export function daysLeft(sub: Subscription | null | undefined, today: string) {
  if (!sub?.paidUntil) return null;
  return Math.round((Date.parse(`${sub.paidUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** What a plan costs for a cycle, in FJD. */
export const planPrice = (plan: PlanFeatureConfig, cycle: BillingCycle) => cycle === 'annual' ? Math.round(plan.price * 12 * 0.8 * 100) / 100 : plan.price;

/** The PayPal charge for an FJD price. */
export const paypalCharge = (fjd: number, billing: BillingSettings) => Math.round(fjd * billing.paypalRate * 100) / 100;

// ---------- Usage and limits ----------

export type LimitKind = 'invoices' | 'clients' | 'services' | 'businesses' | 'projects' | 'aiScans';
export const LIMIT_NAMES: Record<LimitKind, { key: keyof PlanFeatureConfig['limits']; one: string; many: string; monthly?: boolean }> = {
  invoices: { key: 'maxInvoicesPerMonth', one: 'invoice', many: 'invoices', monthly: true },
  clients: { key: 'maxClients', one: 'client', many: 'clients' },
  services: { key: 'maxServices', one: 'service', many: 'services' },
  businesses: { key: 'maxBusinesses', one: 'business', many: 'businesses' },
  projects: { key: 'maxProjects', one: 'project', many: 'projects' },
  aiScans: { key: 'maxAiScansPerMonth', one: 'AI scan', many: 'AI scans', monthly: true }
};

/** How much of each limit a workspace uses (invoices count those issued this month). */
export function usageOf(data: Pick<CRMData, 'documents' | 'clients' | 'services' | 'businesses' | 'projects'>, month: string): Record<Exclude<LimitKind, 'aiScans'>, number> {
  return {
    invoices: (data.documents || []).filter(d => d?.type === 'invoice' && String(d.issueDate || '').slice(0, 7) === month).length,
    clients: (data.clients || []).length,
    services: (data.services || []).length,
    businesses: (data.businesses || []).length,
    projects: (data.projects || []).length
  };
}

/** Why adding one more isn't allowed on this plan, or null when it is. -1 means unlimited. */
export function limitProblem(plan: PlanFeatureConfig, kind: LimitKind, used: number): string | null {
  const meta = LIMIT_NAMES[kind];
  const max = Number(plan.limits[meta.key]);
  if (!Number.isFinite(max) || max < 0 || used < max) return null;
  return `The ${plan.name} plan includes ${max} ${max === 1 ? meta.one : meta.many}${meta.monthly ? ' a month' : ''}, and you've used ${used >= max ? 'them all' : used}. Upgrade to add more.`;
}

// ---------- Features ----------

export type FeatureKey = keyof PlanFeatureConfig['features'];
export const FEATURE_NAMES: Record<FeatureKey, string> = {
  allowAiReceiptOcr: 'AI receipt scanning',
  allowClientPortal: 'The client portal',
  allowRecurringInvoices: 'Recurring invoices and retainers',
  allowMultiCurrency: 'Quotes and invoices in other currencies',
  allowCustomBranding: 'Your own logo and brand colours',
  allowBankReconciliation: 'Bank statement import',
  allowCustomTaxRules: 'Your own taxes and fees',
  allowDirectSupportChat: 'Support chat',
  allowExportPdf: 'PDF downloads'
};

/** Which plans include a feature, cheapest first. */
export function plansWith(plans: Record<string, PlanFeatureConfig>, feature: FeatureKey) {
  return Object.values(plans).filter(p => p.features[feature]).sort((a, b) => a.price - b.price);
}

/** Why a feature isn't available on this plan, or null when it is. */
export function featureProblem(plans: Record<string, PlanFeatureConfig>, planId: string, feature: FeatureKey): string | null {
  const plan = plans[planId];
  if (!plan || plan.features[feature]) return null;
  const up = plansWith(plans, feature)[0];
  return `${FEATURE_NAMES[feature]} ${FEATURE_NAMES[feature].endsWith('s') && !FEATURE_NAMES[feature].startsWith('The') ? 'are' : 'is'} not part of the ${plan.name} plan${up ? `. Upgrade to ${up.name} to use ${FEATURE_NAMES[feature].startsWith('The') ? 'it' : 'them'}` : ''}.`;
}

// ---------- Receipts for plan payments ----------

export interface PlanReceipt {
  number: string;
  issuedAt: string;
  taxInvoice: boolean;
  seller: BillingSettings['seller'];
  customer: { email: string; name: string };
  line: string;
  amount: number;
  currency: string;
  vat: number;
  method: string;
  reference: string;
  periodEnd: string;
}

/** The VAT inside a VAT-inclusive price (plan prices include VAT when Frilensa is VAT-registered). */
export const vatIncluded = (amount: number, rate: number) => Math.round(amount * rate / (100 + rate) * 100) / 100;
export const receiptNumber = (year: number, n: number) => `FRL-${year}-${String(n).padStart(4, '0')}`;
