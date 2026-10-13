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
    logoUrl: stored.logoVersion ? `/api/public/branding/logo?v=${stored.logoVersion}` : ""
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

/** GET /api/public/branding and GET /api/public/branding/logo: anyone, IP rate limited. */
export function createPublicBrandingRouter() {
  const router = express.Router();
  router.use(rateLimit({ name: "public-branding", max: 240, windowMs: 60_000, key: req => req.ip || "anon" }));
  router.get("/", wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ branding: await getBranding() });
  }));
  router.get("/logo", wrap(async (req, res) => {
    const snap = await getAdminDb().collection(COLLECTION).doc(LOGO_DOC).get();
    const logo = snap.exists ? (snap.data() as any) : null;
    if (!logo?.data || !LOGO_TYPES[logo.mime]) return res.status(404).end();
    res.setHeader("Content-Type", logo.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    // Versioned links never change, so they can be cached for good.
    res.setHeader("Cache-Control", req.query.v === logo.version ? "public, max-age=31536000, immutable" : "public, max-age=300");
    res.send(Buffer.from(logo.data, "base64"));
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
    const m = String(req.body?.dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ error: "Upload a PNG, JPG or WebP image." });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_LOGO_BYTES) return res.status(413).json({ error: "That image is too large. Use one under 400 KB." });
    const mime = sniff(buf);
    if (!mime || mime !== m[1]) return res.status(400).json({ error: "That file isn't a valid PNG, JPG or WebP image." });
    const version = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(LOGO_DOC).set({ data: buf.toString("base64"), mime, version, bytes: buf.length, updatedAt: new Date().toISOString() });
    await db.collection(COLLECTION).doc(BRANDING_DOC).set({ logoVersion: version, logoMime: mime, logoType: "image", updatedAt: new Date().toISOString(), updatedBy: req.user?.email || "" }, { merge: true });
    cache = null;
    res.json({ branding: await getBranding() });
  }));

  router.delete("/logo", wrap(async (_req, res) => {
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(LOGO_DOC).delete();
    const ref = db.collection(COLLECTION).doc(BRANDING_DOC);
    const current = (await ref.get()).data() || {};
    await ref.set({ logoVersion: "", logoType: current.logoType === "image" ? "default" : current.logoType || "default", updatedAt: new Date().toISOString() }, { merge: true });
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
    if (b.logoType === "image" && b.logoUrl) {
      const icon = { src: b.logoUrl, sizes: "512x512", type: b.logoMime || "image/png" };
      manifest.icons = [{ ...icon, purpose: "any" }, ...(base.icons || [])];
    }
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(JSON.stringify(manifest));
  }).catch(() => {
    res.setHeader("Content-Type", "application/manifest+json");
    res.send(JSON.stringify(base));
  });
}
