import type { PaypalQuote } from './payNow';
import type { PortalSession } from './api';

// Browser side of "Pay now" (server/payNow.ts): the options on an invoice, PayPal checkout,
// and loading PayPal's JavaScript SDK.

export interface PayOptions {
  status: string;
  documentNumber: string;
  currency: string;
  balance: number;
  reference: string;
  bank: { details: string } | null;
  mpaisa: { number: string } | null;
  mycash: { number: string } | null;
  paypal: (PaypalQuote & { clientId: string; env: 'live' | 'sandbox'; card: boolean }) | null;
}

/** Where the invoice was opened: its public link, or the client portal. */
export type PayTarget = { kind: 'public'; token: string } | { kind: 'portal'; session: PortalSession; documentId: string };

const base = (t: PayTarget) => t.kind === 'public'
  ? `/api/public/documents/${encodeURIComponent(t.token)}/pay`
  : `/api/portal/documents/${encodeURIComponent(t.documentId)}/pay`;
const headers = (t: PayTarget): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(t.kind === 'portal' ? { Authorization: `Portal ${t.session.sessionToken}` } : {})
});

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export async function fetchPayOptions(t: PayTarget) {
  return json<PayOptions>(await fetch(base(t), { headers: headers(t) }));
}

export async function createPaypalOrder(t: PayTarget) {
  return (await json<{ orderId: string }>(await fetch(`${base(t)}/paypal/order`, { method: 'POST', headers: headers(t), body: '{}' }))).orderId;
}

export async function capturePaypalOrder(t: PayTarget, orderId: string) {
  return json<{ ok: true; receiptNumber: string | null; mismatch?: boolean }>(await fetch(`${base(t)}/paypal/capture`, {
    method: 'POST', headers: headers(t), body: JSON.stringify({ orderId })
  }));
}

let sdk: { key: string; promise: Promise<any> } | null = null;

/** Loads PayPal's SDK once per page for this account and currency. */
export function loadPaypalSdk(clientId: string, currency: string): Promise<any> {
  const key = `${clientId}|${currency}`;
  if (sdk?.key === key) return sdk.promise;
  const promise = new Promise((resolve, reject) => {
    document.querySelectorAll('script[data-frilensa-paypal]').forEach(s => s.remove());
    const s = document.createElement('script');
    const params = new URLSearchParams({ 'client-id': clientId, currency, intent: 'capture', components: 'buttons', 'enable-funding': 'card', 'disable-funding': 'paylater,venmo,credit' });
    s.src = `https://www.paypal.com/sdk/js?${params}`;
    s.async = true;
    s.dataset.frilensaPaypal = '1';
    s.onload = () => (window as any).paypal ? resolve((window as any).paypal) : reject(new Error('PayPal did not load.'));
    s.onerror = () => reject(new Error('PayPal could not be loaded. Check your connection, or choose another way to pay.'));
    document.head.appendChild(s);
  });
  sdk = { key, promise };
  promise.catch(() => { if (sdk?.key === key) sdk = null; });
  return promise;
}
