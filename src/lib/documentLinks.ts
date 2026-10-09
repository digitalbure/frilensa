import type { CRMData, CRMDocument } from '../types';

/**
 * Public "view online" links for documents.
 *
 * Each document gets a random shareToken (stored with it and synced to the flat 'documents' copy).
 * A link is /?doc=<shareToken>; the server looks the token up and shows that one document, so the
 * link can't be guessed from the invoice number. Changing the token invalidates old links.
 */
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns data with a shareToken on every document; returns the same object if nothing changed. */
export function ensureShareTokens(data: CRMData): CRMData {
  if (!data.documents?.some(d => d && !d.shareToken)) return data;
  return {
    ...data,
    documents: data.documents.map(d => (d && !d.shareToken ? { ...d, shareToken: generateShareToken() } : d))
  };
}

function appOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'https://frilensa.com';
}

/** Public link for a document, or null for a document that hasn't been saved yet. */
export function documentPublicUrl(doc: Pick<CRMDocument, 'shareToken'> | null | undefined): string | null {
  return doc?.shareToken ? `${appOrigin()}/?doc=${encodeURIComponent(doc.shareToken)}` : null;
}
