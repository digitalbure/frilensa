import type { StoredFile } from '../types';
import type { PortalSession } from './api';

// Receipts kept in server file storage (server/files.ts).

export async function uploadFile(dataUrl: string, name: string): Promise<StoredFile> {
  const type = (dataUrl.match(/^data:([^;]+);/) || [])[1] || '';
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, dataUrl })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Upload failed (${res.status})`);
  return body as StoredFile;
}

async function openBlob(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'The file could not be opened.');
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens one of the signed-in user's own files (the ID token is added by installAuthenticatedFetch). */
export async function openOwnFile(fileId: string) {
  await openBlob(await fetch(`/api/files/${encodeURIComponent(fileId)}`));
}

/** Opens a receipt on a document from the client portal. */
export async function openPortalFile(session: PortalSession, documentId: string, fileId: string) {
  await openBlob(await fetch(`/api/portal/documents/${encodeURIComponent(documentId)}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Portal ${session.sessionToken}` }
  }));
}

/** Link to a receipt on a document opened from its "view online" link. */
export const publicFileUrl = (shareToken: string, fileId: string) =>
  `/api/public/documents/${encodeURIComponent(shareToken)}/files/${encodeURIComponent(fileId)}`;
