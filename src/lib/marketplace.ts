import type { ListingKind } from './marketplaceTaxonomy';

// App-side helpers for the marketplace (server/marketplace.ts).

export interface MarketListing {
  id: string; kind: ListingKind; status?: 'pending' | 'live' | 'hidden' | 'rejected'; rejectReason?: string;
  providerName: string; managed: boolean;
  agent?: { contactName: string; email: string; phone: string; commissionPercent: number; notes: string };
  title: string; description: string; industry: string; category: string; city: string;
  forRent?: boolean; forSale?: boolean; rent?: { amount: number; unit: string } | null; salePrice?: number | null;
  condition?: string; brand?: string; model?: string;
  price?: { amount: number; unit: string; from: boolean } | null;
  currency: string; photos: { id: string; url: string }[];
  createdAt: string; updatedAt: string;
}

export interface SentRequest { id: string; listingId: string; title: string; mode: string; providerName: string; estimate: number; status: string; createdAt: string }

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
export const sendRequest = (id: string, body: Record<string, unknown>) => send(`/api/marketplace/listings/${id}/requests`, 'POST', body).then(r => json<{ ok: true }>(r));

const per = (unit: string) => unit === 'job' ? 'per job' : unit === 'session' ? 'per session' : `/${unit}`;
export const fjd = (n: number) => `FJD ${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "FJD 150/day", "FJD 3,200", "From FJD 800 per job" or "Ask for a quote". */
export function priceLabel(l: MarketListing, mode: 'rent' | 'buy' | 'service') {
  if (mode === 'buy') return l.salePrice ? fjd(l.salePrice) : '';
  if (l.kind === 'gear') return l.rent ? `${fjd(l.rent.amount)}${per(l.rent.unit)}` : '';
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
