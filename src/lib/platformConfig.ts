import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { DEFAULT_PLATFORM_CONFIG, cleanPlatformConfig, type PlatformConfig } from './platformConfigShared';

export * from './platformConfigShared';

// The platform-wide plans, taxes and fees for every screen. Loaded from /api/public/platform-config;
// the last copy is kept on this device. `saved` is false until an admin first publishes them, and
// until then each workspace keeps its own copy (so nothing an admin set earlier is lost).

export interface PlatformConfigState { config: PlatformConfig; saved: boolean; loaded: boolean; updatedAt: string }

const CACHE_KEY = 'frilensa_platform_config';
let current: PlatformConfigState = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { config: cleanPlatformConfig(p.config), saved: !!p.saved, loaded: false, updatedAt: String(p.updatedAt || '') };
    }
  } catch (_) {}
  return { config: DEFAULT_PLATFORM_CONFIG, saved: false, loaded: false, updatedAt: '' };
})();
const listeners = new Set<(s: PlatformConfigState) => void>();
let loading: Promise<void> | null = null;

function publish(body: any) {
  current = { config: cleanPlatformConfig(body.config), saved: !!body.saved, loaded: true, updatedAt: String(body.updatedAt || '') };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ config: current.config, saved: current.saved, updatedAt: current.updatedAt })); } catch (_) {}
  listeners.forEach(fn => fn(current));
}

export function loadPlatformConfig() {
  if (!loading) {
    loading = fetch('/api/public/platform-config')
      .then(r => r.ok ? r.json() : null)
      .then(body => { if (body?.config) publish(body); })
      .catch(() => {});
  }
  return loading;
}

/** The config the workspace should use: the published one, or null while none is published. */
export const publishedPlatformConfig = () => current.saved ? current.config : null;

/** The current platform config; re-renders when it changes. */
export function usePlatformConfig(): PlatformConfigState {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    loadPlatformConfig();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

/** Admin only: publishes a new config to every account. */
export async function savePlatformConfig(config: PlatformConfig): Promise<PlatformConfigState> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/admin/platform-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(config)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Couldn't save (${res.status}).`);
  publish(body);
  return current;
}
