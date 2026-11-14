import type { SharedWorkspace } from './db';

// Team and accountant access (server/team.ts). The books someone opens are remembered for this browser
// tab only; the server is asked each time whether they still have access, and with what role.

export type TeamRole = 'viewer' | 'editor';
export interface TeamMember { memberUid: string; email: string; name: string; role: TeamRole; addedAt: string }
export interface TeamInvite { id: string; email: string; role: TeamRole; createdAt: string; expiresAt: string }
export interface SharedBooks { ownerUid: string; ownerName: string; ownerEmail: string; role: TeamRole; addedAt: string }
export interface TeamState { members: TeamMember[]; invites: TeamInvite[]; sharedWithMe: SharedBooks[] }

export const ROLE_NAMES: Record<TeamRole, { name: string; can: string }> = {
  viewer: { name: 'Accountant (look only)', can: 'Sees your invoices, expenses, bank, payroll and reports. Can\'t change anything.' },
  editor: { name: 'Bookkeeper (can change)', can: 'Can also add and change invoices, expenses, bills and other records.' }
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body as T;
}
const send = (method: string, body?: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

export const loadTeam = () => fetch('/api/team').then(r => json<TeamState>(r));
export const inviteToTeam = (email: string, role: TeamRole) => fetch('/api/team/invites', send('POST', { email, role })).then(r => json<{ invite: TeamInvite; link: string }>(r));
export const cancelInvite = (id: string) => fetch(`/api/team/invites/${encodeURIComponent(id)}`, send('DELETE')).then(r => json(r));
export const acceptInvite = (token: string) => fetch('/api/team/accept', send('POST', { token })).then(r => json<{ shared: Omit<SharedBooks, 'addedAt'> }>(r)).then(r => r.shared);
export const changeRole = (memberUid: string, role: TeamRole) => fetch(`/api/team/members/${encodeURIComponent(memberUid)}`, send('PATCH', { role })).then(r => json(r));
export const removeMember = (memberUid: string) => fetch(`/api/team/members/${encodeURIComponent(memberUid)}`, send('DELETE')).then(r => json(r));
export const leaveBooks = (ownerUid: string) => fetch(`/api/team/shared/${encodeURIComponent(ownerUid)}`, send('DELETE')).then(r => json(r));

const KEY = 'frilensa_shared_books';
/** The books chosen in this tab (owner uid), if any. */
export function chosenBooks(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
const OWN = 'frilensa_own_books';
/** The user chose their own books in this tab (so shared books aren't opened for them automatically). */
export function ownBooksChosen() {
  try { return sessionStorage.getItem(OWN) === '1'; } catch { return false; }
}
/** Opens someone's books (or your own, with null) and reloads the app. */
export function openBooks(ownerUid: string | null) {
  try {
    if (ownerUid) { sessionStorage.setItem(KEY, ownerUid); sessionStorage.removeItem(OWN); }
    else { sessionStorage.removeItem(KEY); sessionStorage.setItem(OWN, '1'); }
  } catch {}
  window.location.assign(`${window.location.pathname}`);
}
/** The shared workspace to use for a chosen owner, from the server's answer (null when access has gone). */
export function sharedFor(team: TeamState | null, ownerUid: string | null): SharedWorkspace | null {
  const s = ownerUid && team?.sharedWithMe.find(x => x.ownerUid === ownerUid);
  return s ? { ownerUid: s.ownerUid, ownerEmail: s.ownerEmail, ownerName: s.ownerName, role: s.role } : null;
}
