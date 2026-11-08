// Usage events for Frilensa's own analytics (Admin → Analytics): which screens and actions are used.
// Only names are sent (e.g. "screen: billing", "action: invoice_created"), never what anyone typed.
// Events are batched and sent every 30 seconds, and when the page is hidden.

type UsageEvent = { type: 'screen' | 'action'; name: string };
let queue: UsageEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let enabled = false;

const device = () => {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  return w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'desktop';
};

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!enabled || queue.length === 0) return;
  const events = queue.splice(0, 100);
  fetch('/api/analytics/events', {
    method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events, device: device(), version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '' })
  }).catch(() => { /* usage stats are best-effort */ });
}

function schedule() {
  if (!timer) timer = setTimeout(flush, 30_000);
}

/** Start (signed in) or stop (signed out) sending usage events. */
export function setAnalyticsEnabled(on: boolean) {
  if (!on) { flush(); queue = []; }
  enabled = on;
}

const clean = (name: string) => name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);

/** A screen was opened (e.g. 'billing'). */
export function trackScreen(name: string) {
  if (!enabled) return;
  queue.push({ type: 'screen', name: clean(name) });
  schedule();
}

/** Something was done (e.g. 'invoice_created'). */
export function trackAction(name: string) {
  if (!enabled) return;
  queue.push({ type: 'action', name: clean(name) });
  if (queue.length >= 50) flush(); else schedule();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
