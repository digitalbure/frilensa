import React, { useEffect, useRef, useState } from 'react';
import { Globe, Image as ImageIcon, Mail, Palette, Phone, RotateCcw, Save, Trash2, Upload, Wand2 } from 'lucide-react';
import BrandMark from './BrandMark';
import { DEFAULT_BRANDING, loadBranding, setBranding, useBranding, type AppBranding } from '../lib/branding';
import { extractPaletteFromImage } from '../lib/colorExtractor';
import type { BrandLogoType } from '../lib/brandingShared';

const LOGO_TYPES: { id: BrandLogoType; label: string }[] = [
  { id: 'default', label: 'Built-in' },
  { id: 'image', label: 'Upload' },
  { id: 'text', label: 'Letters' },
  { id: 'emoji', label: 'Emoji' }
];
const MAX_SIDE = 512;
const MAX_BYTES = 400 * 1024;

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

/** White text on this colour: contrast ratio (WCAG). Under 3 is hard to read. */
function contrastWithWhite(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (lum + 0.05);
}

const ICON = 512;

/** Draws the logo centred in a 512×512 square: clear background for "icon", primary colour and Android's safe zone for "maskable". */
function makeIcon(img: HTMLImageElement | HTMLCanvasElement, kind: 'icon' | 'maskable', background: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = ICON; canvas.height = ICON;
  const ctx = canvas.getContext('2d')!;
  if (kind === 'maskable') { ctx.fillStyle = background; ctx.fillRect(0, 0, ICON, ICON); }
  // Maskable icons can be cut to a circle 80% wide, so the logo stays inside the square that fits in it.
  const box = kind === 'maskable' ? ICON * 0.56 : ICON * 0.88;
  const w0 = (img as HTMLImageElement).naturalWidth || img.width, h0 = (img as HTMLImageElement).naturalHeight || img.height;
  const scale = box / Math.max(w0, h0);
  const w = w0 * scale, h = h0 * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (ICON - w) / 2, (ICON - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The logo could not be loaded to make app icons.'));
    img.src = src;
  });
}

/** Reads an image file (PNG, JPG, WebP or SVG), fits it in 512×512 and returns a PNG data URL (WebP if the PNG is too big). */
function prepareLogo(file: File, background: string): Promise<{ dataUrl: string; iconDataUrl: string; maskableDataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error('Choose a PNG, JPG, WebP or SVG image.'));
    if (file.size > 5 * 1024 * 1024) return reject(new Error('That file is over 5 MB. Choose a smaller image.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w0 = img.naturalWidth || MAX_SIDE, h0 = img.naturalHeight || MAX_SIDE;
      const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Your browser could not read that image.'));
      ctx.drawImage(img, 0, 0, w, h);
      let dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length * 0.75 > MAX_BYTES) dataUrl = canvas.toDataURL('image/webp', 0.9);
      if (!dataUrl.startsWith('data:image/webp') && !dataUrl.startsWith('data:image/png')) dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length * 0.75 > MAX_BYTES) return reject(new Error('That image is too detailed to use as a logo. Try a simpler or smaller one.'));
      resolve({ dataUrl, iconDataUrl: makeIcon(canvas, 'icon', background), maskableDataUrl: makeIcon(canvas, 'maskable', background), width: w0, height: h0 });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as an image.')); };
    img.src = url;
  });
}

/** Admin panel → Branding: Frilensa's name, logo and colours, shown to everyone. */
export default function AdminBrandingView({ showToast }: { showToast: (msg: string) => void }) {
  const live = useBranding();
  const [draft, setDraft] = useState<AppBranding>(live);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<'save' | 'upload' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Show the saved branding once it has loaded, unless the admin has started editing.
  useEffect(() => { loadBranding(); }, []);
  useEffect(() => { if (!touched) setDraft(live); }, [live, touched]);

  const dirty = (Object.keys(DEFAULT_BRANDING) as (keyof AppBranding)[]).some(k => k !== 'logoUrl' && draft[k] !== live[k]);
  const edit = (patch: Partial<AppBranding>) => { setTouched(true); setDraft(d => ({ ...d, ...patch })); };

  const save = async () => {
    setBusy('save'); setProblem(null);
    try {
      let r = await json<{ branding: AppBranding }>(await fetch('/api/admin/branding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }));
      // The Android/iPhone icon sits on the primary colour, so remake it when that colour changes
      // (and make icons for a logo uploaded before they existed).
      if (r.branding.logoUrl && (draft.primaryColor !== live.primaryColor || !r.branding.maskableUrl || !r.branding.iconUrl)) {
        const logo = await loadImage(r.branding.logoUrl);
        r = await json<{ branding: AppBranding }>(await fetch('/api/admin/branding/icons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iconDataUrl: makeIcon(logo, 'icon', r.branding.primaryColor), maskableDataUrl: makeIcon(logo, 'maskable', r.branding.primaryColor) }) }));
      }
      setBranding(r.branding); setDraft(r.branding); setTouched(false);
      showToast('Branding saved. Everyone sees it the next time they open Frilensa.');
    } catch (err: any) { setProblem(err.message); } finally { setBusy(null); }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy('upload'); setProblem(null); setNote(null);
    try {
      const { dataUrl, iconDataUrl, maskableDataUrl, width, height } = await prepareLogo(file, draft.primaryColor);
      const r = await json<{ branding: AppBranding }>(await fetch('/api/admin/branding/logo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl, iconDataUrl, maskableDataUrl }) }));
      setBranding(r.branding);
      setDraft(d => ({ ...d, logoType: 'image', logoUrl: r.branding.logoUrl, iconUrl: r.branding.iconUrl, maskableUrl: r.branding.maskableUrl }));
      if (Math.max(width, height) < 192) setNote(`This image is only ${width}×${height} pixels, so it may look blurry as an app icon. 512×512 or larger works best.`);
      else if (Math.abs(width - height) > Math.max(width, height) * 0.25) setNote('Square logos work best as app icons. Wide logos are shrunk to fit.');
      showToast('Logo uploaded and in use.');
    } catch (err: any) { setProblem(err.message); } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!confirm('Remove the uploaded logo? The built-in mark is used instead.')) return;
    try {
      const r = await json<{ branding: AppBranding }>(await fetch('/api/admin/branding/logo', { method: 'DELETE' }));
      setBranding(r.branding); setDraft(d => ({ ...d, logoType: r.branding.logoType, logoUrl: '' }));
      showToast('Logo removed.');
    } catch (err: any) { setProblem(err.message); }
  };

  const coloursFromLogo = async () => {
    if (!draft.logoUrl) return;
    const p = await extractPaletteFromImage(draft.logoUrl);
    edit({ primaryColor: p.primary, accentColor: p.accent });
  };

  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500';
  const label = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';
  const lowContrast = contrastWithWhite(draft.primaryColor) < 3;

  return (
    <div className="space-y-5">
      {/* Save bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Frilensa branding</h3>
          <p className="text-xs text-slate-400 mt-0.5">The app's own name, logo and colours, shown to everyone on the sign-in page, the sidebar, the browser tab and the installed app. Businesses set their own branding for their documents in Settings.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => { setTouched(true); setDraft({ ...DEFAULT_BRANDING, logoUrl: live.logoUrl }); }}
            className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-slate-700">
            <RotateCcw className="w-3.5 h-3.5" /> Defaults
          </button>
          <button type="button" disabled={!dirty || busy !== null} onClick={save}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Save className="w-3.5 h-3.5" /> {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>
      {problem && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">{problem}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {/* Details */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2"><Globe className="w-4 h-4 text-sky-400" /> App details</h4>
            <label className="block"><span className={label}>App name</span>
              <input className={input} value={draft.name} maxLength={60} onChange={e => edit({ name: e.target.value })} placeholder="Frilensa" />
            </label>
            <label className="block"><span className={label}>Tagline</span>
              <input className={input} value={draft.tagline} maxLength={140} onChange={e => edit({ tagline: e.target.value })} placeholder={DEFAULT_BRANDING.tagline} />
              <span className="text-[10px] text-slate-500">Shown under the name on the sign-in page and in the browser tab.</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="block"><span className={label}>Support email</span>
                <div className="relative"><Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input type="email" className={`${input} pl-8`} value={draft.supportEmail} onChange={e => edit({ supportEmail: e.target.value })} placeholder="support@frilensa.com" /></div>
              </label>
              <label className="block"><span className={label}>Support phone</span>
                <div className="relative"><Phone className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input className={`${input} pl-8`} value={draft.supportPhone} maxLength={40} onChange={e => edit({ supportPhone: e.target.value })} placeholder="+679 …" /></div>
              </label>
            </div>
            <label className="block"><span className={label}>Footer text</span>
              <input className={input} value={draft.footerNote} maxLength={140} onChange={e => edit({ footerNote: e.target.value })} placeholder="frilensa.com" />
            </label>
          </section>

          {/* Logo */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-teal-400" /> Logo</h4>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Logo type">
              {LOGO_TYPES.map(t => (
                <button key={t.id} type="button" role="radio" aria-checked={draft.logoType === t.id}
                  onClick={() => t.id === 'image' && !draft.logoUrl ? fileRef.current?.click() : edit({ logoType: t.id })}
                  className={`py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${draft.logoType === t.id ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => upload(e.target.files?.[0])} />
            {(draft.logoType === 'image' || !draft.logoUrl) && (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files?.[0]); }}
                className={`rounded-xl border-2 border-dashed p-4 flex items-center gap-4 ${dragging ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700 bg-slate-950'}`}>
                {draft.logoUrl
                  ? <img src={draft.logoUrl} alt="Uploaded logo" className="w-16 h-16 object-contain rounded-lg bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] [background-size:12px_12px]" />
                  : <div className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center"><Upload className="w-5 h-5 text-slate-500" /></div>}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-xs text-slate-300">{draft.logoUrl ? 'Your uploaded logo.' : 'Drop your logo here, or choose a file.'}</p>
                  <p className="text-[10px] text-slate-500">PNG, JPG, WebP or SVG. A square image of 512×512 or larger, with a transparent background, looks best.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
                      <Upload className="w-3.5 h-3.5" /> {busy === 'upload' ? 'Uploading…' : draft.logoUrl ? 'Replace' : 'Choose file'}
                    </button>
                    {draft.logoUrl && <button type="button" onClick={removeLogo} className="px-3 py-1.5 rounded-lg text-rose-300 hover:bg-rose-500/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> Remove</button>}
                  </div>
                </div>
              </div>
            )}
            {note && <p className="text-[11px] text-amber-300">{note}</p>}

            {draft.logoType === 'text' && (
              <label className="block"><span className={label}>Letters (1–4)</span>
                <input className={`${input} font-mono font-bold uppercase tracking-widest`} value={draft.logoText} maxLength={4} onChange={e => edit({ logoText: e.target.value.toUpperCase() })} placeholder="F" />
              </label>
            )}
            {draft.logoType === 'emoji' && (
              <div><span className={label}>Emoji</span>
                <div className="flex flex-wrap items-center gap-2">
                  {['🌴', '🌺', '🌊', '⚡', '💼', '🚀', '⭐', '🐚'].map(e => (
                    <button key={e} type="button" onClick={() => edit({ logoEmoji: e })}
                      className={`w-9 h-9 rounded-xl text-base border cursor-pointer ${draft.logoEmoji === e ? 'bg-sky-500/20 border-sky-400' : 'bg-slate-950 border-slate-800'}`}>{e}</button>
                  ))}
                  <input className="w-14 bg-slate-950 border border-slate-800 rounded-xl text-center text-base py-1 text-white" value={draft.logoEmoji} maxLength={8} onChange={e => edit({ logoEmoji: e.target.value })} aria-label="Custom emoji" />
                </div>
              </div>
            )}
          </section>

          {/* Colours */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2"><Palette className="w-4 h-4 text-amber-400" /> Colours</h4>
              {draft.logoUrl && <button type="button" onClick={coloursFromLogo} className="text-[11px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"><Wand2 className="w-3.5 h-3.5" /> Use logo colours</button>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['primaryColor', 'accentColor'] as const).map(k => (
                <label key={k} className="block"><span className={label}>{k === 'primaryColor' ? 'Primary' : 'Accent'}</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={draft[k]} onChange={e => edit({ [k]: e.target.value } as Partial<AppBranding>)} className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border-0" />
                    <input className={`${input} font-mono`} value={draft[k]} maxLength={7}
                      onChange={e => { const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) edit({ [k]: v.toLowerCase() } as Partial<AppBranding>); }} />
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">Used for the built-in, letter and emoji logo tiles, and the installed app's colour.</p>
            {lowContrast && <p className="text-[11px] text-amber-300">White letters are hard to read on this primary colour. Choose a darker one.</p>}
          </section>
        </div>

        {/* Preview */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 lg:sticky lg:top-0 self-start">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Preview{dirty && <span className="ml-2 text-[9px] text-amber-300 normal-case tracking-normal">Not saved yet</span>}</h4>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Sidebar</p>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
              <BrandMark size={36} branding={draft} />
              <div className="min-w-0"><p className="font-extrabold text-white text-sm truncate">{draft.name || DEFAULT_BRANDING.name}</p><p className="text-[10px] text-slate-400">Online</p></div>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Sign-in page</p>
            <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 flex flex-col items-center text-center">
              <BrandMark size={56} rounded="rounded-2xl" branding={draft} />
              <p className="mt-2 text-lg font-black text-white">{draft.name || DEFAULT_BRANDING.name}</p>
              <p className="text-[11px] text-slate-400 max-w-xs">{draft.tagline}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-slate-500 mb-1">Browser tab</p>
              <div className="bg-white rounded-t-lg px-2 py-1.5 flex items-center gap-1.5 text-[10px] text-slate-700 border border-slate-300">
                {draft.logoType === 'image' && draft.logoUrl ? <img src={draft.iconUrl || draft.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" /> : <img src="/pwa-icon.svg" alt="" className="w-3.5 h-3.5" />}
                <span className="truncate">{draft.name}{draft.tagline ? ` — ${draft.tagline}` : ''}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-1">Phone home screen</p>
              <div className="bg-gradient-to-br from-indigo-900 to-slate-800 rounded-xl p-3 flex flex-col items-center gap-1">
                {draft.logoType === 'image' && draft.logoUrl
                  ? (draft.maskableUrl && draft.primaryColor === live.primaryColor
                      ? <img src={draft.maskableUrl} alt="" className="w-11 h-11 rounded-[12px]" />
                      : <div className="w-11 h-11 rounded-[12px] flex items-center justify-center" style={{ background: draft.primaryColor }}><img src={draft.logoUrl} alt="" className="w-6 h-6 object-contain" /></div>)
                  : <img src="/pwa-icon.svg" alt="" className="w-11 h-11 rounded-[12px]" />}
                <span className="text-[10px] text-white truncate max-w-full">{(draft.name || 'Frilensa').slice(0, 12)}</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">The browser tab and home screen need an image, so they use the standard icon unless you upload a logo. Uploading makes square app icons for you: the home screen icon puts your logo on the primary colour, sized so Android's round and squircle shapes don't cut it off. Phones that already installed the app may keep the old icon until it's reinstalled.</p>
        </section>
      </div>
    </div>
  );
}
