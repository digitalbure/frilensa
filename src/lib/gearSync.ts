import type { ProductService } from '../types';
import { DEFAULT_RENTAL, MAX_INCLUDED, type RentalOptions } from './marketplaceRental';

// Gear synced from another app (Packer Tools and others), through the API: PUT /api/v1/gear/{externalId}.
// The other app keeps the gear (what exists, kits, condition, check-outs); Frilensa keeps the money. Synced
// gear is a read-only copy the user can turn into a service (for quotes, invoices and rate cards) or a
// marketplace listing. Frilensa never changes the other app's gear. Stored server-side in synced_gear.

export interface KitItem { name: string; quantity: number }
export interface Unavailable { from: string; to: string; reason?: string }

export interface SyncedGear {
  /** synced_gear document id. */
  id: string;
  /** Which app it came from, e.g. "packer_tools". */
  source: string;
  sourceName: string;
  externalId: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  description: string;
  serialNumber: string;
  quantity: number;
  /** Hire rates, in `currency`. 0 means not set. */
  dayRate: number;
  weekRate: number;
  currency: string;
  replacementValue: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'worn' | '';
  status: 'available' | 'checked_out' | 'maintenance' | 'missing' | 'retired';
  /** What comes in the kit (a camera kit's lens, batteries, cards…). */
  kit: KitItem[];
  /** Dates it's booked or away, from the other app. */
  unavailable: Unavailable[];
  /** A link back to the item in the other app. */
  externalUrl: string;
  removed: boolean;
  /** When the other app last changed it (its own timestamp, or when it was sent). */
  updatedAt: string;
  syncedAt: string;
  /** What the user made from it in Frilensa, and the gear's updatedAt at that time (to spot changes). */
  links: { serviceId?: string; listingId?: string; linkedVersion?: string };
}

export const GEAR_SOURCES: Record<string, string> = { packer_tools: 'Packer Tools' };
export const MAX_SYNCED_GEAR = 2000;
export const MAX_BATCH = 100;
const CONDITIONS = ['new', 'excellent', 'good', 'fair', 'worn'];
const STATUSES = ['available', 'checked_out', 'maintenance', 'missing', 'retired'];

const str = (v: unknown, max: number) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const amt = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 10_000_000) * 100) / 100 : 0; };
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Slug for the source app: lower-case letters, digits and underscores. */
export const sourceSlug = (v: unknown) => str(v, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'packer_tools';
export const sourceName = (slug: string, given?: unknown) => GEAR_SOURCES[slug] || str(given, 60) || slug.replace(/_/g, ' ');

/** Checks and tidies one item sent by another app. Returns an error message when it can't be used. */
export function cleanGearItem(raw: any, externalId: unknown): Omit<SyncedGear, 'id' | 'source' | 'sourceName' | 'syncedAt' | 'links' | 'removed'> | string {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ext = str(externalId ?? r.externalId ?? r.id, 120);
  if (!ext) return 'Each item needs an externalId (its id in your app).';
  const name = str(r.name, 140);
  if (!name) return `Item ${ext}: a name is required.`;
  const url = str(r.externalUrl ?? r.url, 500);
  const kitRaw = Array.isArray(r.kit) ? r.kit : Array.isArray(r.kitContents) ? r.kitContents : [];
  const kit: KitItem[] = kitRaw.slice(0, MAX_INCLUDED * 2).map((k: any) => typeof k === 'string' ? { name: str(k, 80), quantity: 1 } : { name: str(k?.name, 80), quantity: Math.max(1, Math.min(999, Math.round(Number(k?.quantity) || 1))) })
    .filter((k: KitItem) => k.name);
  const unavailable: Unavailable[] = (Array.isArray(r.unavailable) ? r.unavailable : []).slice(0, 200)
    .filter((u: any) => isDate(u?.from) && isDate(u?.to) && u.from <= u.to)
    .map((u: any) => ({ from: u.from, to: u.to, ...(str(u.reason, 80) ? { reason: str(u.reason, 80) } : {}) }));
  const updated = str(r.updatedAt, 40);
  return {
    externalId: ext, name,
    brand: str(r.brand, 60), model: str(r.model, 80), category: str(r.category, 60), description: str(r.description, 2000),
    serialNumber: str(r.serialNumber ?? r.serial, 80),
    quantity: Math.max(1, Math.min(999, Math.round(Number(r.quantity) || 1))),
    dayRate: amt(r.dayRate ?? r.rates?.day), weekRate: amt(r.weekRate ?? r.rates?.week),
    currency: /^[A-Z]{3}$/.test(String(r.currency || '')) ? String(r.currency) : 'FJD',
    replacementValue: amt(r.replacementValue),
    condition: CONDITIONS.includes(r.condition) ? r.condition : '',
    status: STATUSES.includes(r.status) ? r.status : 'available',
    kit, unavailable,
    externalUrl: /^https:\/\/[^\s"'<>]+$/.test(url) ? url : '',
    updatedAt: updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated).toISOString() : new Date().toISOString()
  };
}

/** Changed in the other app since the user made a service or listing from it. */
export const changedSinceLinked = (g: Pick<SyncedGear, 'updatedAt' | 'links'>) =>
  !!(g.links.serviceId || g.links.listingId) && !!g.links.linkedVersion && g.updatedAt > g.links.linkedVersion;

/** "Brand name", without repeating the brand when the name already starts with it. */
export const gearTitle = (g: Pick<SyncedGear, 'brand' | 'name'>) =>
  g.brand && !g.name.toLowerCase().startsWith(g.brand.toLowerCase()) ? `${g.brand} ${g.name}` : g.name;

const kitLine = (kit: KitItem[]) => kit.map(k => k.quantity > 1 ? `${k.quantity} × ${k.name}` : k.name).join(', ');

/** A service for quotes, invoices and rate cards, from synced gear (a new one, or `existing` updated). */
export function serviceFromGear(g: SyncedGear, businessId: string | undefined, existing?: ProductService): ProductService {
  const title = gearTitle(g);
  const description = [g.model && !g.name.includes(g.model) ? g.model : '', g.description, g.kit.length ? `Kit: ${kitLine(g.kit)}.` : ''].filter(Boolean).join(' ').slice(0, 1000);
  const notes = [g.weekRate ? `Weekly rate ${g.currency} ${g.weekRate.toFixed(2)}.` : '', g.replacementValue ? `Replacement value ${g.currency} ${g.replacementValue.toFixed(2)}.` : '', `Synced from ${g.sourceName}.`].filter(Boolean).join(' ');
  return {
    ...(existing || {}),
    id: existing?.id || `svc-gear-${Date.now()}`,
    name: (existing && existing.name !== title ? existing.name : title).slice(0, 140) || g.name,
    description,
    rate: g.dayRate || existing?.rate || 0,
    unit: existing?.unit || 'Day',
    type: 'service',
    itemType: 'equipment_rental',
    category: g.category || existing?.category || 'Equipment hire',
    ...(g.serialNumber ? { sku: g.serialNumber } : {}),
    stockQuantity: g.quantity,
    isActive: existing?.isActive ?? g.status !== 'retired',
    isTaxable: existing?.isTaxable ?? true,
    businessId: existing?.businessId || businessId,
    notes,
    tags: Array.from(new Set([...(existing?.tags || []), 'gear', g.source]))
  } as ProductService;
}

/** Starting values for a marketplace listing from synced gear. */
export function listingStartFromGear(g: SyncedGear): { title: string; description: string; brand: string; model: string; rentAmount: string; rentUnit: string; condition: string; rental: RentalOptions } {
  const rental: RentalOptions = JSON.parse(JSON.stringify(DEFAULT_RENTAL));
  rental.quantity = g.quantity;
  rental.included = g.kit.slice(0, MAX_INCLUDED).map(k => k.quantity > 1 ? `${k.quantity} × ${k.name}` : k.name);
  return {
    title: gearTitle(g).slice(0, 120),
    description: g.description,
    brand: g.brand, model: g.model,
    rentAmount: g.dayRate ? String(g.dayRate) : g.weekRate ? String(g.weekRate) : '',
    rentUnit: g.dayRate ? 'day' : g.weekRate ? 'week' : 'day',
    condition: g.condition === 'excellent' ? 'like_new' : g.condition === 'worn' ? 'fair' : g.condition || 'good',
    rental
  };
}
