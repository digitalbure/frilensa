import type { CRMData, FeeConfig, PlanFeatureConfig, PlanFeatures, PlanLimits, PlanTier, TaxConfig } from '../types';
import { DEFAULT_PLATFORM_SETTINGS, INITIAL_CRM_DATA } from '../data/mockData';

// Platform-wide settings that admins set once for every account: the plans (names, prices, limits,
// features), the taxes and fees every business can apply, and the VAT rate new accounts start with.
// Stored on the server (platform/config); shared by the app and the server.

export interface PlatformConfig {
  plans: Record<PlanTier, PlanFeatureConfig>;
  platformTaxes: TaxConfig[];
  platformFees: FeeConfig[];
  defaultVatRate: number;
}

export const PLAN_TIERS: PlanTier[] = ['free', 'pro', 'premium'];
export const LIMIT_KEYS: (keyof PlanLimits)[] = ['maxInvoicesPerMonth', 'maxClients', 'maxServices', 'maxBusinesses', 'maxProjects', 'maxAiScansPerMonth'];
export const FEATURE_KEYS: (keyof PlanFeatures)[] = ['allowAiReceiptOcr', 'allowClientPortal', 'allowRecurringInvoices', 'allowMultiCurrency', 'allowCustomBranding', 'allowBankReconciliation', 'allowCustomTaxRules', 'allowDirectSupportChat', 'allowExportPdf'];
const TAX_CATEGORIES = ['vat', 'ecal', 'stt', 'levy', 'custom'];
const FEE_CATEGORIES = ['service', 'handling', 'processing', 'delivery', 'setup', 'custom'];
const MAX_CHARGES = 30;

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  plans: DEFAULT_PLATFORM_SETTINGS.plans,
  platformTaxes: INITIAL_CRM_DATA.platformTaxes || [],
  platformFees: INITIAL_CRM_DATA.platformFees || [],
  defaultVatRate: DEFAULT_PLATFORM_SETTINGS.defaultVatRate
};

const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const money = (v: unknown, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 100) / 100;
};
const limit = (v: unknown, fallback: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return -1; // -1 means unlimited
  return Math.min(Math.round(n), 1_000_000);
};

function cleanPlan(tier: PlanTier, raw: any): PlanFeatureConfig {
  const base = DEFAULT_PLATFORM_CONFIG.plans[tier];
  const r = raw && typeof raw === 'object' ? raw : {};
  const limits = {} as PlanLimits;
  for (const k of LIMIT_KEYS) limits[k] = limit(r.limits?.[k], base.limits[k]);
  const features = {} as PlanFeatures;
  for (const k of FEATURE_KEYS) features[k] = typeof r.features?.[k] === 'boolean' ? r.features[k] : base.features[k];
  return {
    id: tier,
    name: text(r.name, 40) || base.name,
    description: r.description === undefined ? base.description : text(r.description, 200),
    price: money(r.price ?? base.price, 100_000),
    badgeColor: /^#[0-9a-f]{6}$/i.test(String(r.badgeColor)) ? String(r.badgeColor) : base.badgeColor,
    limits,
    features
  };
}

function cleanCharges<T extends TaxConfig | FeeConfig>(raw: unknown, categories: string[], prefix: string): T[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of raw.slice(0, MAX_CHARGES)) {
    if (!c || typeof c !== 'object') continue;
    const name = text((c as any).name, 100);
    if (!name) continue;
    let id = text((c as any).id, 60).replace(/[^A-Za-z0-9_-]/g, '');
    if (!id || seen.has(id)) id = `${prefix}-${out.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    const rateType = (c as any).rateType === 'flat' ? 'flat' : 'percentage';
    const category = categories.includes((c as any).category) ? (c as any).category : 'custom';
    const description = text((c as any).description, 300);
    out.push({
      id, name, rateType, category,
      rate: money((c as any).rate, rateType === 'percentage' ? 100 : 1_000_000),
      scope: 'platform',
      isDefault: !!(c as any).isDefault,
      isActive: (c as any).isActive !== false,
      ...(description ? { description } : {})
    } as T);
  }
  return out;
}

/** Checks and tidies a config from an admin (or from storage). Anything missing falls back to the defaults. */
export function cleanPlatformConfig(raw: any): PlatformConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const plans = {} as Record<PlanTier, PlanFeatureConfig>;
  for (const tier of PLAN_TIERS) plans[tier] = cleanPlan(tier, r.plans?.[tier]);
  return {
    plans,
    platformTaxes: Array.isArray(r.platformTaxes) ? cleanCharges<TaxConfig>(r.platformTaxes, TAX_CATEGORIES, 'ptax') : DEFAULT_PLATFORM_CONFIG.platformTaxes,
    platformFees: Array.isArray(r.platformFees) ? cleanCharges<FeeConfig>(r.platformFees, FEE_CATEGORIES, 'pfee') : DEFAULT_PLATFORM_CONFIG.platformFees,
    defaultVatRate: r.defaultVatRate === undefined ? DEFAULT_PLATFORM_CONFIG.defaultVatRate : money(r.defaultVatRate, 100)
  };
}

/**
 * Puts the platform-wide plans and taxes/fees into a workspace as it loads. Each account keeps its own
 * plan choice and its own VAT rate (Settings); only the shared definitions come from the platform.
 */
export function applyPlatformConfig<T extends Partial<CRMData>>(data: T, config: PlatformConfig | null): T {
  if (!config || !data) return data;
  return {
    ...data,
    platformSettings: {
      ...DEFAULT_PLATFORM_SETTINGS,
      ...(data.platformSettings || {}),
      plans: config.plans,
      defaultVatRate: config.defaultVatRate
    },
    platformTaxes: config.platformTaxes,
    platformFees: config.platformFees
  };
}

/** Annual price: twelve months less 20%. */
export const annualPrice = (monthly: number) => Math.round(monthly * 12 * 0.8 * 100) / 100;

/** Plain-words highlights of a plan for the plan picker, from its limits and features. */
export function planHighlights(plan: PlanFeatureConfig): string[] {
  const l = plan.limits;
  const f = plan.features;
  const upTo = (n: number, one: string, many: string, unlimited: string) => n < 0 ? unlimited : `Up to ${n} ${n === 1 ? one : many}`;
  const list = [
    upTo(l.maxInvoicesPerMonth, 'invoice a month', 'invoices a month', 'Unlimited invoices'),
    upTo(l.maxClients, 'client', 'clients', 'Unlimited clients'),
    upTo(l.maxProjects, 'project', 'projects', 'Unlimited projects'),
    l.maxBusinesses < 0 ? 'Unlimited business profiles' : `${l.maxBusinesses} business profile${l.maxBusinesses === 1 ? '' : 's'}`
  ];
  if (f.allowAiReceiptOcr) list.push(l.maxAiScansPerMonth < 0 ? 'Unlimited AI receipt scans' : `${l.maxAiScansPerMonth} AI receipt scans a month`);
  if (f.allowRecurringInvoices) list.push('Recurring invoices and retainers');
  if (f.allowCustomBranding) list.push('Your own logo and brand colour');
  if (f.allowClientPortal) list.push('Client portal');
  if (f.allowMultiCurrency) list.push('Invoices in FJD, AUD, USD and NZD');
  if (f.allowBankReconciliation) list.push('Bank statement import and reconciliation');
  if (f.allowExportPdf) list.push('PDF export');
  return list;
}
