import express, { type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";
import { DEFAULT_BRANDING, cleanBranding, type AppBranding } from "../src/lib/brandingShared";

// Frilensa's own branding (not a business's): app name, tagline, support contacts, logo and colours,
// set by platform admins in Admin → Branding and shown to everyone: the sidebar, sign-in, setup,
// the browser tab and the installed app. Stored in the server-only 'platform' collection.

const COLLECTION = "platform";
const BRANDING_DOC = "branding";
const LOGO_DOC = "branding_logo";
// Square 512×512 PNG app icons made from the logo in the browser: "icon" is the logo on a clear
// background, "maskable" is the logo inside Android's safe zone on the primary colour (also used for iOS).
const ICON_DOCS = { icon: "branding_icon", maskable: "branding_maskable" } as const;
type IconKind = keyof typeof ICON_DOCS;
const ICON_SIZE = 512;
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_LOGO_BYTES = 400 * 1024;

const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);

let cache: { at: number; value: AppBranding } | null = null;

/** The current branding, with the logo's public address. Cached for a minute. */
export async function getBranding(): Promise<AppBranding> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const snap = await getAdminDb().collection(COLLECTION).doc(BRANDING_DOC).get();
  const stored = snap.exists ? (snap.data() as any) : {};
  const value: AppBranding = {
    ...DEFAULT_BRANDING,
    ...cleanBranding(stored),
    logoUrl: stored.logoVersion ? `/api/public/branding/logo?v=${stored.logoVersion}` : "",
    iconUrl: stored.logoVersion && stored.iconVersion ? `/api/public/branding/icon?v=${stored.iconVersion}` : "",
    maskableUrl: stored.logoVersion && stored.maskableVersion ? `/api/public/branding/maskable?v=${stored.maskableVersion}` : ""
  };
  (value as any).logoMime = stored.logoMime || "";
  if (value.logoType === "image" && !value.logoUrl) value.logoType = "default";
  cache = { at: Date.now(), value };
  return value;
}

/** Checks the file really is the image type it claims (magic bytes), so nothing else is served as a logo. */
function sniff(buf: Buffer): string | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Width and height from a PNG's header. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (sniff(buf) !== "image/png" || buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Decodes and checks an uploaded image. Icons must be 512×512 PNGs. */
function parseImage(dataUrl: unknown, icon: boolean): { buf: Buffer; mime: string } | string {
  const m = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return icon ? "App icons must be PNG images." : "Upload a PNG, JPG or WebP image.";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_LOGO_BYTES) return "That image is too large. Use one under 400 KB.";
  const mime = sniff(buf);
  if (!mime || mime !== m[1]) return "That file isn't a valid PNG, JPG or WebP image.";
  if (icon) {
    const size = pngSize(buf);
    if (!size || size.w !== ICON_SIZE || size.h !== ICON_SIZE) return `App icons must be ${ICON_SIZE}×${ICON_SIZE} PNG images.`;
  }
  return { buf, mime };
}

const version = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);

/** Saves the app icons sent with a logo upload (or regenerated after a colour change). */
async function saveIcons(body: any): Promise<string | Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const kind of Object.keys(ICON_DOCS) as IconKind[]) {
    const raw = body?.[`${kind}DataUrl`];
    if (!raw) continue;
    const img = parseImage(raw, true);
    if (typeof img === "string") return img;
    const v = version(img.buf);
    await getAdminDb().collection(COLLECTION).doc(ICON_DOCS[kind]).set({ data: img.buf.toString("base64"), mime: img.mime, version: v, bytes: img.buf.length, updatedAt: new Date().toISOString() });
    versions[`${kind}Version`] = v;
  }
  return versions;
}

async function sendStored(docId: string, req: Request, res: Response) {
  const snap = await getAdminDb().collection(COLLECTION).doc(docId).get();
  const file = snap.exists ? (snap.data() as any) : null;
  if (!file?.data || !LOGO_TYPES[file.mime]) return false;
  res.setHeader("Content-Type", file.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  // Versioned links never change, so they can be cached for good.
  res.setHeader("Cache-Control", req.query.v === file.version ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  res.send(Buffer.from(file.data, "base64"));
  return true;
}

/** GET /api/public/branding and its images (logo, icon, maskable, app-icon): anyone, IP rate limited. */
export function createPublicBrandingRouter() {
  const router = express.Router();
  router.use(rateLimit({ name: "public-branding", max: 240, windowMs: 60_000, key: req => req.ip || "anon" }));
  router.get("/", wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ branding: await getBranding() });
  }));
  router.get("/logo", wrap(async (req, res) => { if (!(await sendStored(LOGO_DOC, req, res))) res.status(404).end(); }));
  router.get("/icon", wrap(async (req, res) => { if (!(await sendStored(ICON_DOCS.icon, req, res))) res.status(404).end(); }));
  router.get("/maskable", wrap(async (req, res) => { if (!(await sendStored(ICON_DOCS.maskable, req, res))) res.status(404).end(); }));
  // A fixed address for the current app icon (notifications), falling back to the standard icon.
  router.get("/app-icon", wrap(async (req, res) => {
    const b = await getBranding();
    if (b.logoType === "image" && b.iconUrl && (await sendStored(ICON_DOCS.icon, req, res))) return;
    res.redirect(302, "/pwa-icon.svg");
  }));
  return router;
}

/** /api/admin/branding: platform admins only. */
export function createAdminBrandingRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin-branding", max: 60, windowMs: 60_000 }));

  router.put("/", wrap(async (req, res) => {
    const b = req.body || {};
    if (b.supportEmail && !isEmail(String(b.supportEmail))) return res.status(400).json({ error: "Enter a valid support email, or leave it empty." });
    const clean = cleanBranding(b);
    const ref = getAdminDb().collection(COLLECTION).doc(BRANDING_DOC);
    const current = (await ref.get()).data() || {};
    if (clean.logoType === "image" && !current.logoVersion) return res.status(400).json({ error: "Upload a logo image first." });
    await ref.set({ ...clean, updatedAt: new Date().toISOString(), updatedBy: req.user?.email || "" }, { merge: true });
    cache = null;
    res.json({ branding: await getBranding() });
  }));

  // The browser sends a PNG/JPEG/WebP data URL it has already resized (SVGs are converted to PNG first).
  router.post("/logo", wrap(async (req, res) => {
    const img = parseImage(req.body?.dataUrl, false);
    if (typeof img === "string") return res.status(img.includes("too large") ? 413 : 400).json({ error: img });
    const icons = await saveIcons(req.body);
    if (typeof icons === "string") return res.status(400).json({ error: icons });
    const v = version(img.buf);
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(LOGO_DOC).set({ data: img.buf.toString("base64"), mime: img.mime, version: v, bytes: img.buf.length, updatedAt: new Date().toISOString() });
    await db.collection(COLLECTION).doc(BRANDING_DOC).set({ logoVersion: v, logoMime: img.mime, logoType: "image", iconVersion: "", maskableVersion: "", ...icons, updatedAt: new Date().toISOString(), updatedBy: req.user?.email || "" }, { merge: true });
    cache = null;
    res.json({ branding: await getBranding() });
  }));

  // New app icons for the current logo, e.g. after the primary colour changed.
  router.post("/icons", wrap(async (req, res) => {
    const ref = getAdminDb().collection(COLLECTION).doc(BRANDING_DOC);
    if (!((await ref.get()).data() || {}).logoVersion) return res.status(400).json({ error: "Upload a logo first." });
    const icons = await saveIcons(req.body);
    if (typeof icons === "string") return res.status(400).json({ error: icons });
    await ref.set({ ...icons, updatedAt: new Date().toISOString() }, { merge: true });
    cache = null;
    res.json({ branding: await getBranding() });
  }));

  router.delete("/logo", wrap(async (_req, res) => {
    const db = getAdminDb();
    await Promise.all([LOGO_DOC, ...Object.values(ICON_DOCS)].map(id => db.collection(COLLECTION).doc(id).delete()));
    const ref = db.collection(COLLECTION).doc(BRANDING_DOC);
    const current = (await ref.get()).data() || {};
    await ref.set({ logoVersion: "", iconVersion: "", maskableVersion: "", logoType: current.logoType === "image" ? "default" : current.logoType || "default", updatedAt: new Date().toISOString() }, { merge: true });
    cache = null;
    res.json({ branding: await getBranding() });
  }));
  return router;
}

/** GET /manifest.webmanifest: the install manifest with the app name, colour and uploaded logo. */
export function manifestHandler(req: Request, res: Response) {
  const file = [path.join(process.cwd(), "dist", "manifest.webmanifest"), path.join(process.cwd(), "public", "manifest.webmanifest")].find(f => fs.existsSync(f));
  let base: any = {};
  try { base = file ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; } catch { base = {}; }
  getBranding().then((b: AppBranding & { logoMime?: string }) => {
    const manifest: any = { ...base, name: b.tagline ? `${b.name} — ${b.tagline}` : b.name, short_name: b.name.slice(0, 12), theme_color: b.primaryColor };
    if (b.logoType === "image" && b.iconUrl && b.maskableUrl) {
      // Only the uploaded logo's icons, so no device falls back to the standard Frilensa icon.
      manifest.icons = [
        { src: b.iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: b.maskableUrl, sizes: "512x512", type: "image/png", purpose: "maskable" }
      ];
      manifest.shortcuts = (base.shortcuts || []).map((sc: any) => ({ ...sc, icons: [{ src: b.iconUrl, sizes: "512x512", type: "image/png" }] }));
    } else if (b.logoType === "image" && b.logoUrl) {
      // A logo uploaded before app icons were made: offer it first, with the standard icons as a fallback.
      manifest.icons = [{ src: b.logoUrl, sizes: "512x512", type: b.logoMime || "image/png", purpose: "any" }, ...(base.icons || [])];
    }
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(JSON.stringify(manifest));
  }).catch(() => {
    res.setHeader("Content-Type", "application/manifest+json");
    res.send(JSON.stringify(base));
  });
}
