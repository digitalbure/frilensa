import type { Business, Client, CRMDocument } from '../types';

// Shared by the app (lib/db.ts) and the server (daily job), so both write the flat
// 'documents' copy used by the client portal and "view online" links the same way.

/**
 * Deeply removes undefined fields (Firestore rejects them); undefined array entries become null.
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === undefined) {
    return null as any;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => sanitizeForFirestore(item)) as any;
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean as T;
}

export function flatDocumentId(uid: string, documentId: string) {
  return `${uid}_${documentId}`;
}

/** The flat 'documents' row for one of a consultant's documents. */
export function buildFlatDocumentRow(
  uid: string,
  consultantEmail: string,
  crmDoc: CRMDocument,
  business: Business | undefined,
  client: Client | undefined
): Record<string, any> {
  return sanitizeForFirestore({
    ...crmDoc,
    consultantId: uid,
    consultantEmail,
    clientEmail: (client?.email || '').trim().toLowerCase(),
    clientName: client?.name || '',
    businessName: business?.name || '',
    businessColorTheme: business?.colorTheme || '#0284c7',
    businessLogoType: business?.logoType || 'symbol',
    businessLogoSymbol: business?.logoSymbol || 'Waves',
    businessLogoText: business?.logoText || '',
    businessLogoUrl: business?.logoUrl || '',
    businessBrandSlogan: business?.brandSlogan || '',
    businessAddress: business?.address || '',
    businessEmail: business?.email || '',
    businessPhone: business?.phone || '',
    businessTin: business?.tin || '',
    businessBankDetails: business?.bankDetails || '',
    businessMPaisaId: (business as any)?.mPaisaId || '',
    businessMyCashId: (business as any)?.myCashId || '',
    updatedAt: crmDoc.updatedAt || new Date().toISOString()
  });
}
