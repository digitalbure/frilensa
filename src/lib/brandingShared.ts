// Frilensa's own branding, shared by the app (lib/branding.ts) and the server (server/branding.ts).

export type BrandLogoType = 'default' | 'image' | 'text' | 'emoji';

export interface AppBranding {
  name: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  footerNote: string;
  logoType: BrandLogoType;
  /** Letters for a text logo (up to 4). */
  logoText: string;
  /** An emoji for an emoji logo. */
  logoEmoji: string;
  /** Where the uploaded logo is served (set by the server). */
  logoUrl: string;
  /** Square 512×512 app icons made from the logo (set by the server): plain, and padded on the primary colour. */
  iconUrl?: string;
  maskableUrl?: string;
  primaryColor: string;
  accentColor: string;
}

export const DEFAULT_BRANDING: AppBranding = {
  name: 'Frilensa',
  tagline: 'Invoicing, bookkeeping and Fiji tax for freelancers',
  supportEmail: '',
  supportPhone: '',
  footerNote: 'frilensa.com',
  logoType: 'default',
  logoText: 'F',
  logoEmoji: '🌴',
  logoUrl: '',
  primaryColor: '#0284c7',
  accentColor: '#14b8a6'
};

const HEX = /^#[0-9a-f]{6}$/i;
const text = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : undefined;

/** Keeps only valid branding fields (anything missing or invalid is left out, so defaults apply). */
export function cleanBranding(input: any): Partial<AppBranding> {
  const b = input || {};
  const out: Partial<AppBranding> = {};
  const set = <K extends keyof AppBranding>(k: K, v: AppBranding[K] | undefined) => { if (v !== undefined) out[k] = v; };
  const name = text(b.name, 60);
  set('name', name || undefined);
  set('tagline', text(b.tagline, 140));
  set('supportEmail', text(b.supportEmail, 120));
  set('supportPhone', text(b.supportPhone, 40));
  set('footerNote', text(b.footerNote, 140));
  if (['default', 'image', 'text', 'emoji'].includes(b.logoType)) out.logoType = b.logoType;
  const letters = text(b.logoText, 4);
  set('logoText', letters ? letters.toUpperCase() : undefined);
  const emoji = text(b.logoEmoji, 8);
  set('logoEmoji', emoji || undefined);
  if (typeof b.primaryColor === 'string' && HEX.test(b.primaryColor)) out.primaryColor = b.primaryColor.toLowerCase();
  if (typeof b.accentColor === 'string' && HEX.test(b.accentColor)) out.accentColor = b.accentColor.toLowerCase();
  return out;
}
