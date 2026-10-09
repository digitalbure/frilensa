import type { User } from './firebase';

// Platform admin access is limited to verified accounts listed in VITE_ADMIN_EMAILS (comma-separated).
// The admin panel only edits the admin's own workspace settings; it never reads other tenants.
const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export function isPlatformAdmin(user: User | null | undefined): boolean {
  if (!user || !user.emailVerified || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}
