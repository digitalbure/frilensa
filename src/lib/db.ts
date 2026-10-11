import { 
  auth,
  db,
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  deleteDoc,
  onSnapshot
} from './firebase';
import { CRMData, CRMDocument, SupportMessage } from '../types';
import { sanitizeForFirestore, flatDocumentId, buildFlatDocumentRow } from './flatDocuments';
import { documentsSaved } from './documentEvents';

export { sanitizeForFirestore, flatDocumentId };

const BACKUP_STORAGE_PREFIX = 'fiji_freelancer_crm_backup';
const LEGACY_STORAGE_KEYS = ['fiji_freelancer_crm_backup', 'fiji_freelancer_crm_data', 'fiji_freelancer_auth_session', 'fiji_crm_support_messages', 'client_auth_session'];

// The on-device cache belongs to exactly one signed-in user; App sets it on auth changes.
let cacheOwnerUid: string | null = null;

export function setLocalCacheOwner(uid: string | null, email?: string | null) {
  cacheOwnerUid = uid;
  // Older builds kept one shared, unscoped cache that leaked between accounts on a device.
  // Hand it to its owner once (matched by email), then drop it.
  try {
    if (uid && email) {
      const scopedKey = `${BACKUP_STORAGE_PREFIX}:${uid}`;
      if (!localStorage.getItem(scopedKey)) {
        for (const legacyKey of ['fiji_freelancer_crm_data', 'fiji_freelancer_crm_backup']) {
          const raw = localStorage.getItem(legacyKey);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const legacyEmail = (parsed?.userProfile?.email || '').trim().toLowerCase();
          if (legacyEmail && legacyEmail === email.trim().toLowerCase() && parsed.businesses?.length) {
            localStorage.setItem(scopedKey, raw);
            break;
          }
        }
      }
    }
    if (uid) LEGACY_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
  } catch (_) {}
}

function backupKey(): string | null {
  return cacheOwnerUid ? `${BACKUP_STORAGE_PREFIX}:${cacheOwnerUid}` : null;
}

/**
 * Saves an on-device copy of the signed-in user's workspace for offline use and recovery.
 */
export function saveLocalBackup(data: CRMData) {
  const key = backupKey();
  if (!key) return;
  try {
    if (!data || !data.businesses || data.businesses.length === 0) return;
    localStorage.setItem(key, JSON.stringify({
      ...data,
      backupTimestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('Unable to write local backup:', e);
  }
}

/**
 * Loads the signed-in user's on-device workspace copy, if any.
 */
export function loadLocalBackup(): CRMData | null {
  const key = backupKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.businesses) && parsed.businesses.length > 0) {
        return parsed as CRMData;
      }
    }
  } catch (e) {
    console.warn('Unable to parse local backup:', e);
  }
  return null;
}

/**
 * Helper to union two arrays of objects by their `id` property.
 * When an entity exists in both, the remote version takes precedence unless
 * the local version has a strictly newer updatedAt timestamp.
 * Offline-added entries that do not exist remotely are preserved.
 */
export function mergeEntityList<T extends { id: string; updatedAt?: string }>(localList: T[] = [], remoteList: T[] = []): T[] {
  const map = new Map<string, T>();
  
  // 1. Add all remote items first (remote cloud is authoritative)
  (remoteList || []).forEach(item => {
    if (item && item.id) {
      map.set(item.id, item);
    }
  });

  // 2. Add local items: preserve offline items, and only overwrite remote if local has a strictly newer timestamp
  (localList || []).forEach(item => {
    if (item && item.id) {
      const remoteItem = map.get(item.id);
      if (!remoteItem) {
        map.set(item.id, item);
      } else {
        const localTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
        const remoteTime = remoteItem.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;
        if (localTime > remoteTime && !isNaN(localTime)) {
          const cleanLocalItem = Object.fromEntries(
            Object.entries(item).filter(([_, v]) => v !== undefined)
          );
          map.set(item.id, { ...remoteItem, ...cleanLocalItem } as T);
        }
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Performs a comprehensive, non-destructive merge between local workspace state and remote cloud data.
 */
export function mergeCRMData(localData: CRMData, remoteData: Partial<CRMData>): CRMData {
  if (!remoteData) return localData;

  const mergedBusinesses = mergeEntityList(localData.businesses, remoteData.businesses);
  const mergedClients = mergeEntityList(localData.clients, remoteData.clients);
  const mergedServices = mergeEntityList(localData.services, remoteData.services);
  const mergedDocuments = mergeEntityList(localData.documents, remoteData.documents);
  const mergedProjects = mergeEntityList(localData.projects, remoteData.projects);
  const mergedExpenses = mergeEntityList(localData.expenses, remoteData.expenses);
  const mergedTransactions = mergeEntityList(localData.transactions, remoteData.transactions);
  const mergedRecurringInvoices = mergeEntityList(localData.recurringInvoices, remoteData.recurringInvoices);
  const mergedRateRules = mergeEntityList(localData.rateRules, remoteData.rateRules);
  const mergedBusinessTaxes = mergeEntityList(localData.businessTaxes, remoteData.businessTaxes);
  const mergedBusinessFees = mergeEntityList(localData.businessFees, remoteData.businessFees);
  const mergedEscrowContracts = mergeEntityList(localData.escrowContracts, remoteData.escrowContracts);
  const mergedDirectoryBusinesses = mergeEntityList(localData.directoryBusinesses, remoteData.directoryBusinesses);
  const mergedDirectoryBookings = mergeEntityList(localData.directoryBookings, remoteData.directoryBookings);
  const mergedSupportMessages = mergeEntityList(localData.supportMessages, remoteData.supportMessages);
  const mergedAiConversations = mergeEntityList(localData.aiConversations, remoteData.aiConversations);
  const mergedAiMemories = mergeEntityList(localData.aiMemories, remoteData.aiMemories);

  // Determine activeBusinessId safely
  let activeBizId = remoteData.activeBusinessId || localData.activeBusinessId;
  if (!mergedBusinesses.some(b => b.id === activeBizId) && mergedBusinesses.length > 0) {
    activeBizId = mergedBusinesses[0].id;
  }

  return {
    ...localData,
    ...remoteData,
    userProfile: {
      ...localData.userProfile,
      ...(remoteData.userProfile || {}),
      name: remoteData.userProfile?.name || localData.userProfile?.name || '',
      email: remoteData.userProfile?.email || localData.userProfile?.email || '',
      tin: (remoteData.userProfile?.tin || localData.userProfile?.tin || mergedBusinesses[0]?.tin || '').trim(),
      phone: (remoteData.userProfile?.phone || localData.userProfile?.phone || mergedBusinesses[0]?.phone || '').trim(),
      bankDetails: (remoteData.userProfile?.bankDetails || localData.userProfile?.bankDetails || mergedBusinesses[0]?.bankDetails || '').trim(),
      onboardingCompleted: true
    },
    businesses: mergedBusinesses.length > 0 ? mergedBusinesses : localData.businesses,
    clients: mergedClients,
    services: mergedServices,
    documents: mergedDocuments,
    projects: mergedProjects,
    expenses: mergedExpenses,
    transactions: mergedTransactions,
    recurringInvoices: mergedRecurringInvoices,
    rateRules: mergedRateRules,
    platformTaxes: remoteData.platformTaxes || localData.platformTaxes,
    platformFees: remoteData.platformFees || localData.platformFees,
    businessTaxes: mergedBusinessTaxes,
    businessFees: mergedBusinessFees,
    platformSettings: remoteData.platformSettings || localData.platformSettings,
    escrowContracts: mergedEscrowContracts,
    wallet: remoteData.wallet || localData.wallet,
    directoryBusinesses: mergedDirectoryBusinesses,
    directoryBookings: mergedDirectoryBookings,
    supportMessages: mergedSupportMessages,
    aiConversations: mergedAiConversations,
    aiMemories: mergedAiMemories,
    activeBusinessId: activeBizId,
    onboardingCompleted: true
  };
}

function currentIdentity(): { uid: string; email: string } | null {
  const user = auth.currentUser;
  if (!user) return null;
  return { uid: user.uid, email: (user.email || '').trim().toLowerCase() };
}

const FLAT_DOC_META_KEYS = [
  'consultantId', 'consultantEmail', 'clientEmail', 'clientName', 'businessName',
  'businessColorTheme', 'businessLogoType', 'businessLogoSymbol', 'businessLogoText',
  'businessLogoUrl', 'businessBrandSlogan', 'businessAddress', 'businessEmail',
  'businessPhone', 'businessTin', 'businessBankDetails', 'businessMPaisaId', 'businessMyCashId'
];

function stripFlatDocMeta(raw: Record<string, any>): CRMDocument {
  const copy = { ...raw };
  FLAT_DOC_META_KEYS.forEach(k => delete copy[k]);
  return copy as CRMDocument;
}

function toCRMData(raw: any): CRMData {
  return {
    userProfile: raw.userProfile || {},
    businesses: raw.businesses || [],
    clients: raw.clients || [],
    services: raw.services || [],
    projects: raw.projects || [],
    documents: raw.documents || [],
    expenses: raw.expenses || [],
    transactions: raw.transactions || [],
    recurringInvoices: raw.recurringInvoices || [],
    rateRules: raw.rateRules || [],
    platformTaxes: raw.platformTaxes || [],
    platformFees: raw.platformFees || [],
    businessTaxes: raw.businessTaxes || [],
    businessFees: raw.businessFees || [],
    platformSettings: raw.platformSettings || undefined,
    escrowContracts: raw.escrowContracts || [],
    wallet: raw.wallet || undefined,
    directoryBusinesses: raw.directoryBusinesses || [],
    directoryBookings: raw.directoryBookings || [],
    supportMessages: raw.supportMessages || [],
    aiConversations: raw.aiConversations || [],
    aiMemories: raw.aiMemories || [],
    activityLogs: raw.activityLogs || [],
    clientWallets: raw.clientWallets || undefined,
    activeBusinessId: raw.activeBusinessId || '',
    onboardingCompleted: raw.onboardingCompleted ?? true
  } as CRMData;
}

/**
 * Saves the signed-in consultant's workspace to /consultants/{uid} and mirrors each
 * document into the flat 'documents' collection (used by the client portal).
 * Throws on failure so callers can surface "not saved" to the user.
 */
export async function saveConsultantData(data: CRMData) {
  const identity = currentIdentity();
  if (!identity || !data) return;
  const { uid, email } = identity;

  saveLocalBackup(data);

  // Keep the workspace document under Firestore's 1MB limit: large binaries live elsewhere.
  const expenses = (data.expenses || []).map(exp => {
    if (exp?.receiptImage && typeof exp.receiptImage === 'string' && exp.receiptImage.length > 80_000) {
      return { ...exp, receiptImage: undefined, hasAttachedReceipt: true };
    }
    return exp;
  });
  const documents = data.documents || [];
  const embeddedDocuments = documents.map(crmDoc => {
    const copy = { ...crmDoc } as any;
    if (typeof copy.pdfDataUrl === 'string' && copy.pdfDataUrl.length > 60_000) delete copy.pdfDataUrl;
    return copy;
  });

  const payload: Record<string, any> = sanitizeForFirestore({
    userProfile: data.userProfile || {},
    businesses: data.businesses || [],
    clients: data.clients || [],
    services: data.services || [],
    projects: data.projects || [],
    documents: embeddedDocuments,
    expenses,
    transactions: data.transactions || [],
    recurringInvoices: data.recurringInvoices || [],
    rateRules: data.rateRules || [],
    platformTaxes: data.platformTaxes || [],
    platformFees: data.platformFees || [],
    businessTaxes: data.businessTaxes || [],
    businessFees: data.businessFees || [],
    platformSettings: data.platformSettings || null,
    escrowContracts: data.escrowContracts || [],
    wallet: data.wallet || null,
    directoryBusinesses: data.directoryBusinesses || [],
    directoryBookings: data.directoryBookings || [],
    aiConversations: data.aiConversations || [],
    aiMemories: data.aiMemories || [],
    activityLogs: (data.activityLogs || []).slice(0, 500),
    clientWallets: data.clientWallets || null,
    activeBusinessId: data.activeBusinessId || '',
    onboardingCompleted: data.onboardingCompleted ?? true,
    updatedAt: new Date().toISOString(),
    consultantEmail: email
  });

  const consultantRef = doc(db, 'consultants', uid);
  try {
    await setDoc(consultantRef, payload);
  } catch (writeErr: any) {
    const isSizeError = writeErr?.message?.includes('exceeds the maximum allowed size') ||
      writeErr?.message?.includes('exceeds maximum allowed size') ||
      writeErr?.message?.includes('1,048,576');
    if (!isSizeError) throw writeErr;
    console.warn('Workspace exceeds Firestore 1MB limit. Saving without receipt images and PDFs.');
    await setDoc(consultantRef, {
      ...payload,
      expenses: (payload.expenses || []).map((e: any) => { const { receiptImage, ...rest } = e; return rest; }),
      documents: (payload.documents || []).map((d: any) => { const { pdfDataUrl, signature, ...rest } = d; return rest; })
    });
  }

  documentsSaved(documents);

  // Mirror documents to the flat collection (ids are namespaced by owner so tenants can't collide)
  // and remove ones that were deleted locally, including un-namespaced copies from older builds.
  const keepIds = new Set(documents.filter(d => d?.id).map(d => flatDocumentId(uid, d.id)));
  const businessesById = new Map((data.businesses || []).map(b => [b.id, b]));
  const clientsById = new Map((data.clients || []).map(c => [c.id, c]));
  const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

  documents.forEach(crmDoc => {
    if (!crmDoc?.id) return;
    const row = buildFlatDocumentRow(uid, email, crmDoc, businessesById.get(crmDoc.businessId), clientsById.get(crmDoc.clientId));
    ops.push(batch => batch.set(doc(db, 'documents', flatDocumentId(uid, crmDoc.id)), row));
  });

  try {
    const existing = await getDocs(query(collection(db, 'documents'), where('consultantId', '==', uid)));
    const liveDocIds = new Set(documents.filter(d => d?.id).map(d => d.id));
    existing.forEach(snap => {
      if (keepIds.has(snap.id)) return;
      const docId = snap.data().id || snap.id;
      const isNamespaced = snap.id === flatDocumentId(uid, docId);
      // Remove a namespaced copy only when the user deleted that document. Remove an older
      // un-namespaced copy only once it has been rewritten under the new id in this same batch.
      // Anything else is left untouched.
      if (isNamespaced ? !liveDocIds.has(docId) : liveDocIds.has(docId)) {
        ops.push(batch => batch.delete(snap.ref));
      }
    });
  } catch (err) {
    console.warn('Could not list flat documents for cleanup:', err);
  }

  // Firestore batches are capped at 500 writes.
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

/**
 * Loads the signed-in consultant's workspace. If nothing exists under their uid yet,
 * falls back to the email-keyed copies written by older builds (read-only, verified email only)
 * and reports `migratedFromLegacy` so the caller saves it under the uid.
 */
export async function loadConsultantData(): Promise<{ data: CRMData; migratedFromLegacy: boolean } | null> {
  const identity = currentIdentity();
  if (!identity) return null;
  const { uid, email } = identity;

  let raw: any = null;
  let migratedFromLegacy = false;

  const snap = await getDoc(doc(db, 'consultants', uid));
  if (snap.exists()) {
    raw = snap.data();
  } else if (email && auth.currentUser?.emailVerified) {
    for (const path of ['consultants', 'consultants_by_email']) {
      try {
        const legacy = await getDoc(doc(db, path, email));
        if (legacy.exists()) {
          raw = legacy.data();
          migratedFromLegacy = true;
          break;
        }
      } catch (err) {
        console.warn(`Legacy workspace lookup in ${path} failed:`, err);
      }
    }
  }

  if (!raw) return null;
  const data = toCRMData(raw);

  // The workspace document is authoritative for which documents exist; the flat copies carry
  // full PDFs and any status changes made from the client portal.
  const flatById = new Map<string, CRMDocument>();
  const flatQueries = [where('consultantId', '==', uid)];
  if (migratedFromLegacy) flatQueries.push(where('consultantId', '==', email));
  for (const constraint of flatQueries) {
    try {
      const flatSnap = await getDocs(query(collection(db, 'documents'), constraint));
      flatSnap.forEach(s => {
        const row = s.data();
        const id = row.id || s.id;
        // Prefer the namespaced copy when both an old and a new one exist.
        if (!flatById.has(id) || s.id === flatDocumentId(uid, id)) flatById.set(id, stripFlatDocMeta(row));
      });
    } catch (err) {
      console.warn('Could not load flat documents:', err);
    }
  }
  data.documents = data.documents.map(d => {
    const flat = flatById.get(d.id);
    if (!flat) return d;
    const flatTime = new Date(flat.updatedAt || 0).getTime();
    const embeddedTime = new Date(d.updatedAt || 0).getTime();
    return flatTime >= embeddedTime ? { ...d, ...flat } : { ...flat, ...d };
  });

  return { data, migratedFromLegacy };
}

/**
 * Real-time listener for the signed-in consultant's workspace document.
 */
export function subscribeToConsultantData(onUpdate: (data: CRMData) => void) {
  const identity = currentIdentity();
  if (!identity) return () => {};
  return onSnapshot(
    doc(db, 'consultants', identity.uid),
    snap => {
      if (snap.exists() && !snap.metadata.hasPendingWrites) onUpdate(toCRMData(snap.data()));
    },
    error => console.warn('Workspace listener error:', error?.message || error)
  );
}

/**
 * Saves a consultant-authored support message. Client-authored messages go through
 * the server portal API (see lib/api.ts).
 */
export async function sendSupportMessage(msg: SupportMessage): Promise<void> {
  const identity = currentIdentity();
  if (!identity) throw new Error('Sign in to send messages.');
  await setDoc(doc(db, 'support_messages', msg.id), sanitizeForFirestore({
    ...msg,
    consultantId: identity.uid,
    sender: 'consultant',
    updatedAt: new Date().toISOString()
  }));
}

/**
 * Loads the signed-in consultant's message thread with one client.
 */
export async function loadSupportMessagesForClient(clientEmail: string): Promise<SupportMessage[]> {
  const identity = currentIdentity();
  if (!identity) return [];
  const normalizedEmail = clientEmail.trim().toLowerCase();
  const snap = await getDocs(query(
    collection(db, 'support_messages'),
    where('consultantId', '==', identity.uid),
    where('clientEmail', '==', normalizedEmail)
  ));
  const messages = snap.docs.map(d => d.data() as SupportMessage);
  messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return messages;
}

/**
 * Loads every support message addressed to the signed-in consultant, newest first.
 */
export async function loadSupportMessagesForConsultant(): Promise<SupportMessage[]> {
  const identity = currentIdentity();
  if (!identity) return [];
  const snap = await getDocs(query(collection(db, 'support_messages'), where('consultantId', '==', identity.uid)));
  const messages = snap.docs.map(d => d.data() as SupportMessage);
  messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return messages;
}

/**
 * Updates status of a support message (e.g., mark as read or resolved).
 */
export async function updateSupportMessageStatus(
  messageId: string,
  status: 'unread' | 'read' | 'in_progress' | 'resolved'
): Promise<void> {
  await updateDoc(doc(db, 'support_messages', messageId), {
    status,
    updatedAt: new Date().toISOString()
  });
}
