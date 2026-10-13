import { useEffect, useState } from 'react';
import { DEFAULT_BRANDING, type AppBranding } from './brandingShared';

export { DEFAULT_BRANDING, type AppBranding };

// Frilensa's branding for every screen. Loaded once from /api/public/branding; the last copy is kept
// on this device so the sidebar and sign-in show the right name and logo straight away.

const CACHE_KEY = 'frilensa_branding';
let current: AppBranding = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch (_) {}
  return DEFAULT_BRANDING;
})();
const listeners = new Set<(b: AppBranding) => void>();
let loading: Promise<void> | null = null;

/** Updates the branding everywhere (after loading it, or after an admin saves it). */
export function setBranding(b: AppBranding) {
  current = { ...DEFAULT_BRANDING, ...b };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(current)); } catch (_) {}
  applyToDocument(current);
  listeners.forEach(fn => fn(current));
}

export function loadBranding() {
  if (!loading) {
    loading = fetch('/api/public/branding')
      .then(r => r.ok ? r.json() : null)
      .then(body => { if (body?.branding) setBranding(body.branding); })
      .catch(() => {});
  }
  return loading;
}

/** The current branding; re-renders when it changes. */
export function useBranding(): AppBranding {
  const [b, setB] = useState(current);
  useEffect(() => {
    listeners.add(setB);
    loadBranding();
    return () => { listeners.delete(setB); };
  }, []);
  return b;
}

/** Browser tab title, favicon, home-screen name and theme colour. */
function applyToDocument(b: AppBranding) {
  if (typeof document === 'undefined') return;
  const tagline = b.tagline ? ` — ${b.tagline}` : '';
  if (/^Frilensa\b/.test(document.title) || document.title.startsWith(b.name) || document.title === '') document.title = `${b.name}${tagline}`;
  const icon = b.logoType === 'image' && b.logoUrl ? b.logoUrl : '/pwa-icon.svg';
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(l => {
    if (l.href !== new URL(icon, location.href).href) {
      l.href = icon;
      if (l.rel === 'icon') l.type = icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    }
  });
  document.querySelectorAll<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"], meta[name="application-name"]').forEach(m => { m.content = b.name; });
}

applyToDocument(current);
