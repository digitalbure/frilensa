// Shareable rate cards and the quote requests they produce (server/rateCards.ts).

export interface PublicRateCard {
  business: {
    name: string; brandSlogan: string; colorTheme: string;
    logoType?: 'text' | 'symbol' | 'image'; logoSymbol?: string; logoText?: string; logoUrl?: string;
    email: string; phone: string; address: string;
  };
  intro: string;
  currency: string;
  vatRate: number;
  terms: { text: string; paymentTermsDays: number; quoteValidDays: number };
  services: {
    id: string; name: string; description: string; rate: number; unit: string; category: string;
    billingInterval: 'one-time' | 'monthly' | 'annual'; minQuantity: number; vat: boolean;
  }[];
}

export interface QuoteRequest {
  id: string;
  ref: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  items: { serviceId: string; name: string; unit: string; rate: number; quantity: number }[];
  currency: string;
  estimate: number;
  createdAt: string;
  channel?: 'rate_card' | 'directory' | 'api' | 'booking_page' | 'widget';
  details?: { label: string; value: string }[];
  eventDate?: string;
  startTime?: string;
  location?: string;
  source?: { app?: string; reference?: string; url?: string };
  via?: string;
  directoryBookingId?: string;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const rateCardUrl = (token: string) => `${window.location.origin}/?rates=${encodeURIComponent(token)}`;

export async function fetchPublicRateCard(token: string) {
  return json<PublicRateCard>(await fetch(`/api/public/rate-cards/${encodeURIComponent(token)}`));
}

export async function sendQuoteRequest(token: string, request: {
  name: string; email: string; phone?: string; company?: string; message?: string;
  items: { serviceId: string; quantity: number }[];
}) {
  return json<{ ok: true; ref: string }>(await fetch(`/api/public/rate-cards/${encodeURIComponent(token)}/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
  }));
}

/** Registers a new link for the business (retiring any earlier one). Save the token on the business. */
export async function createRateCardLink(businessId: string) {
  return (await json<{ token: string }>(await fetch('/api/rate-cards', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId })
  }))).token;
}

export async function deleteRateCardLink(token: string) {
  await json(await fetch(`/api/rate-cards/${encodeURIComponent(token)}`, { method: 'DELETE' }));
}

export async function fetchQuoteRequests() {
  return (await json<{ requests: QuoteRequest[] }>(await fetch('/api/rate-cards/requests'))).requests;
}

export async function resolveQuoteRequest(id: string, status: 'quoted' | 'dismissed', documentId?: string) {
  await json(await fetch(`/api/rate-cards/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, documentId })
  }));
}
