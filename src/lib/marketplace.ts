import type { ListingKind } from './marketplaceTaxonomy';
import type { RentalOptions, RentalQuote } from './marketplaceRental';
import type { PriceOption } from './rateConditions';

// App-side helpers for the marketplace (server/marketplace.ts).

export interface MarketListing {
  id: string; kind: ListingKind; status?: 'pending' | 'live' | 'hidden' | 'rejected'; rejectReason?: string;
  providerName: string; managed: boolean;
  agent?: { contactName: string; email: string; phone: string; commissionPercent: number; notes: string };
  title: string; description: string; industry: string; category: string; city: string;
  forRent?: boolean; forSale?: boolean; rent?: { amount: number; unit: string } | null; salePrice?: number | null;
  condition?: string; brand?: string; brandId?: string; model?: string;
  rental?: RentalOptions | null;
  price?: { amount: number; unit: string; from: boolean } | null;
  priceOptions?: PriceOption[];
  currency: string; photos: { id: string; url: string }[];
  createdAt: string; updatedAt: string;
}

export interface SentRequest { id: string; listingId: string; title: string; mode: string; providerName: string; estimate: number; currency?: string; status: string; createdAt: string }

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

export const browseListings = (q: Record<string, string>) =>
  fetch(`/api/public/marketplace/listings?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`)
    .then(r => json<{ listings: MarketListing[]; total: number; cities: string[]; mode: string }>(r));
export const myMarketplace = () => fetch('/api/marketplace/mine').then(r => json<{ listings: MarketListing[]; sent: SentRequest[]; trusted: boolean }>(r));
export const createListing = (l: Partial<MarketListing> & { businessId?: string }) => send('/api/marketplace/listings', 'POST', l).then(r => json<{ listing: MarketListing }>(r));
export const updateListing = (id: string, patch: Record<string, unknown>) => send(`/api/marketplace/listings/${id}`, 'PATCH', patch).then(r => json<{ listing: MarketListing }>(r));
export const deleteListing = (id: string) => send(`/api/marketplace/listings/${id}`, 'DELETE').then(r => json(r));
export const addPhoto = (id: string, dataUrl: string, admin = false) =>
  send(`/api/${admin ? 'admin/' : ''}marketplace/listings/${id}/photos`, 'POST', { dataUrl }).then(r => json<{ listing: MarketListing }>(r));
export const removePhoto = (id: string, photoId: string) => send(`/api/marketplace/listings/${id}/photos/${photoId}`, 'DELETE').then(r => json<{ listing: MarketListing }>(r));
export interface Brand { id: string; name: string; logoUrl: string }
export interface Hold { id: string; kind: 'booking' | 'block'; from: string; to: string; quantity: number; status: string; name?: string; note?: string; requestId?: string }
export interface CalendarRequest { id: string; name: string; email: string; phone: string; message: string; estimate: number; rental: RentalQuote; bookingId: string; status: string; createdAt: string }
export interface Availability { from: string; to: string; today: string; quantity: number; available: Record<string, number> }

let brandsLoad: Promise<Brand[]> | null = null;
/** The brand list admins keep (cached for the session; pass true after a change). */
export const fetchBrands = (fresh = false) => {
  if (fresh || !brandsLoad) brandsLoad = fetch('/api/public/marketplace/brands').then(r => json<{ brands: Brand[] }>(r)).then(b => b.brands).catch(err => { brandsLoad = null; throw err; });
  return brandsLoad;
};
export const fetchAvailability = (id: string, from?: string, days = 180) =>
  fetch(`/api/public/marketplace/listings/${id}/availability?${new URLSearchParams({ ...(from ? { from } : {}), days: String(days) })}`).then(r => json<Availability>(r));

/** A rental listing's calendar: for the owner, or for admins (agent listings). */
export const calendarApi = (admin: boolean) => {
  const base = `/api/${admin ? 'admin/' : ''}marketplace/listings`;
  return {
    load: (id: string) => fetch(`${base}/${id}/calendar`).then(r => json<{ quantity: number; holds: Hold[]; requests: CalendarRequest[] }>(r)),
    block: (id: string, from: string, to: string, quantity: number, note: string) => send(`${base}/${id}/blocks`, 'POST', { from, to, quantity, note }).then(r => json<{ hold: Hold }>(r)),
    confirm: (id: string, requestId: string) => send(`${base}/${id}/confirm`, 'POST', { requestId }).then(r => json<{ hold: Hold }>(r)),
    release: (id: string, holdId: string) => send(`${base}/${id}/holds/${holdId}`, 'DELETE').then(r => json(r))
  };
};

/** Admin: the brand list. */
export const brandAdmin = {
  create: (name: string, logoDataUrl?: string) => send('/api/admin/marketplace/brands', 'POST', { name, ...(logoDataUrl ? { logoDataUrl } : {}) }).then(r => json<{ brand: Brand }>(r)),
  update: (id: string, patch: { name?: string; logoDataUrl?: string; removeLogo?: boolean }) => send(`/api/admin/marketplace/brands/${id}`, 'PATCH', patch).then(r => json<{ brand: Brand }>(r)),
  remove: (id: string) => send(`/api/admin/marketplace/brands/${id}`, 'DELETE').then(r => json<{ ok: true; listingsUpdated: number }>(r))
};

/** Resizes a logo in the browser (longest side 400px, PNG to keep transparency). */
export function prepareLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type)) return reject(new Error('Choose a PNG, JPG, WebP or SVG logo.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || 400, h = img.naturalHeight || 400;
      const scale = Math.min(1, 400 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Your browser could not read that logo.'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as an image.')); };
    img.src = url;
  });
}

export const sendRequest = (id: string, body: Record<string, unknown>) => send(`/api/marketplace/listings/${id}/requests`, 'POST', body).then(r => json<{ ok: true }>(r));

const per = (unit: string) => unit === 'job' ? 'per job' : unit === 'session' ? 'per session' : `/${unit}`;
/** "AUD 1,000" */
export const money = (currency: string, n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "FJD 150/day", "FJD 3,200", "From FJD 800 per job" or "Ask for a quote". */
export function priceLabel(l: MarketListing, mode: 'rent' | 'buy' | 'service') {
  if (mode === 'buy') return l.salePrice ? fjd(l.salePrice) : '';
  if (l.kind === 'gear') return l.rent ? `${fjd(l.rent.amount)}${per(l.rent.unit)}` : '';
  const first = l.priceOptions?.[0];
  if (first && l.price) return `${l.priceOptions!.length > 1 ? 'From ' : ''}${money(first.currency, first.amount)} ${per(l.price.unit)}`.replace(' /', '/');
  return l.price ? `${l.price.from ? 'From ' : ''}${fjd(l.price.amount)} ${per(l.price.unit)}`.replace(' /', '/') : 'Ask for a quote';
}

/** Resizes a photo in the browser (longest side 1600px, JPEG) before upload. */
export function preparePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return reject(new Error('Choose a JPG, PNG or WebP photo.'));
    if (file.size > 25 * 1024 * 1024) return reject(new Error('That photo is over 25 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Your browser could not read that photo.'));
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as a photo.')); };
    img.src = url;
  });
}
