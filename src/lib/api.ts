import { auth } from './firebase';
import type { Business, Client, CRMDocument, DirectoryBooking, DirectoryListing, Project, ProductService, SupportMessage } from '../types';

/**
 * Patches window.fetch so every same-origin `/api/` call (except the client portal, which
 * carries its own session) is sent with the signed-in consultant's Firebase ID token.
 */
export function installAuthenticatedFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith(window.location.origin) ? url.slice(window.location.origin.length) : url;
    const needsAuth = path.startsWith('/api/') && !path.startsWith('/api/portal/') && !path.startsWith('/api/public/') && path !== '/api/health';
    const user = auth.currentUser;
    if (!needsAuth || !user) return originalFetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
    }
    return originalFetch(input, { ...init, headers });
  };
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// ---------- Consultant side: managing a client's portal access ----------

/** Creates (or rotates) a client's portal link. Returns the new raw token; the server stores only its hash. */
export async function createPortalLink(client: Pick<Client, 'id' | 'name' | 'email'>): Promise<string> {
  const res = await fetch('/api/portal/admin/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await requireIdToken()}` },
    body: JSON.stringify({ clientId: client.id, clientName: client.name, email: client.email })
  });
  return (await readJson(res)).token;
}

/** Revokes a client's portal link and PIN. */
export async function revokePortalAccess(clientEmail: string): Promise<void> {
  const res = await fetch('/api/portal/admin/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await requireIdToken()}` },
    body: JSON.stringify({ email: clientEmail })
  });
  await readJson(res);
}

/** Sets a client's portal PIN (stored hashed). */
export async function setPortalPin(client: Pick<Client, 'id' | 'name' | 'email'>, pin: string): Promise<void> {
  const res = await fetch('/api/portal/admin/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await requireIdToken()}` },
    body: JSON.stringify({ clientId: client.id, clientName: client.name, email: client.email, pin })
  });
  await readJson(res);
}

/** Whether a client currently has a PIN and/or link set. */
export async function getPortalAccessStatus(clientEmail: string): Promise<{ hasPin: boolean; hasLink: boolean }> {
  const res = await fetch(`/api/portal/admin/status?email=${encodeURIComponent(clientEmail)}`, {
    headers: { Authorization: `Bearer ${await requireIdToken()}` }
  });
  return readJson(res);
}

async function requireIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  return user.getIdToken();
}

// ---------- Client side: the portal itself ----------

export interface PortalSession {
  sessionToken: string;
  email: string;
  clientName: string;
  expiresAt: number;
}

export interface PortalData {
  client: Partial<Client> | null;
  business: Partial<Business> | null;
  documents: (CRMDocument & Record<string, any>)[];
  projects: Project[];
  services: ProductService[];
  messages: SupportMessage[];
}

const PORTAL_SESSION_KEY = 'frilensa_portal_session';

export function loadPortalSession(): PortalSession | null {
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalSession;
    if (!parsed.sessionToken || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(PORTAL_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

export function clearPortalSession() {
  try { localStorage.removeItem(PORTAL_SESSION_KEY); } catch (_) {}
}

function storePortalSession(session: PortalSession) {
  try { localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session)); } catch (_) {}
}

export async function startPortalSessionWithToken(token: string): Promise<PortalSession> {
  const res = await fetch('/api/portal/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  const session = (await readJson(res)) as PortalSession;
  storePortalSession(session);
  return session;
}

export async function startPortalSessionWithPin(email: string, pin: string): Promise<PortalSession> {
  const res = await fetch('/api/portal/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin })
  });
  const session = (await readJson(res)) as PortalSession;
  storePortalSession(session);
  return session;
}

function portalHeaders(session: PortalSession) {
  return { 'Content-Type': 'application/json', Authorization: `Portal ${session.sessionToken}` };
}

export async function fetchPortalData(session: PortalSession): Promise<PortalData> {
  const res = await fetch('/api/portal/data', { headers: portalHeaders(session) });
  return readJson(res);
}

export async function acceptPortalQuote(session: PortalSession, documentId: string): Promise<void> {
  const res = await fetch(`/api/portal/documents/${encodeURIComponent(documentId)}/accept`, {
    method: 'POST',
    headers: portalHeaders(session)
  });
  await readJson(res);
}

export async function reportPortalPayment(
  session: PortalSession,
  documentId: string,
  payment: { method: string; reference: string }
): Promise<void> {
  const res = await fetch(`/api/portal/documents/${encodeURIComponent(documentId)}/report-payment`, {
    method: 'POST',
    headers: portalHeaders(session),
    body: JSON.stringify(payment)
  });
  await readJson(res);
}

export async function sendPortalMessage(
  session: PortalSession,
  message: Pick<SupportMessage, 'subject' | 'message' | 'category'> & { documentRefId?: string }
): Promise<SupportMessage> {
  const res = await fetch('/api/portal/messages', {
    method: 'POST',
    headers: portalHeaders(session),
    body: JSON.stringify(message)
  });
  return (await readJson(res)).message;
}

// ---------- Shared business directory ----------
// (The ID token is attached automatically by installAuthenticatedFetch.)

export async function fetchDirectoryListings(): Promise<DirectoryListing[]> {
  return (await readJson(await fetch('/api/directory'))).listings;
}

export async function publishDirectoryListing(listing: Partial<DirectoryListing>): Promise<DirectoryListing> {
  const res = await fetch('/api/directory/listing', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(listing)
  });
  return (await readJson(res)).listing;
}

export async function unpublishDirectoryListing(): Promise<void> {
  await readJson(await fetch('/api/directory/listing', { method: 'DELETE' }));
}

export async function fetchDirectoryBookings(): Promise<{ sent: DirectoryBooking[]; received: DirectoryBooking[] }> {
  return readJson(await fetch('/api/directory/bookings'));
}

export async function requestDirectoryBooking(booking: Partial<DirectoryBooking>): Promise<DirectoryBooking> {
  const res = await fetch('/api/directory/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking)
  });
  return (await readJson(res)).booking;
}

export async function updateDirectoryBookingStatus(id: string, status: DirectoryBooking['status']): Promise<void> {
  const res = await fetch(`/api/directory/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  await readJson(res);
}

// ---------- Public document links (/?doc=<shareToken>) ----------

export interface PublicDocumentData {
  document: CRMDocument & Record<string, any>;
  client: { name: string };
  business: Partial<Business>;
}

export async function fetchPublicDocument(token: string): Promise<PublicDocumentData> {
  return readJson(await fetch(`/api/public/documents/${encodeURIComponent(token)}`));
}

export async function acceptPublicQuote(token: string): Promise<void> {
  await readJson(await fetch(`/api/public/documents/${encodeURIComponent(token)}/accept`, { method: 'POST' }));
}

export async function reportPublicPayment(token: string, payment: { method: string; reference: string }): Promise<void> {
  await readJson(await fetch(`/api/public/documents/${encodeURIComponent(token)}/report-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payment)
  }));
}
