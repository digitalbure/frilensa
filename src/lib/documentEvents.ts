import type { CRMDocument } from '../types';

// After a save that changed documents (a quote sent, a payment confirmed…), tell the server so it
// can send booking webhooks straight away (server/webhooks.ts). Debounced, and skipped when no
// document's status or edit time changed.

let lastSignature = '';
let timer: ReturnType<typeof setTimeout> | null = null;

export function documentsSaved(documents: CRMDocument[]) {
  const signature = documents.map(d => `${d.id}:${d.status}:${d.updatedAt || ''}`).join('|');
  if (!lastSignature) { lastSignature = signature; return; }
  if (signature === lastSignature) return;
  lastSignature = signature;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    fetch('/api/events/document-changed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  }, 3000);
}
