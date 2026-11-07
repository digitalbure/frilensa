import express, { type Response, type NextFunction } from "express";
import { getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";
import { cleanPlatformConfig, DEFAULT_PLATFORM_CONFIG, type PlatformConfig } from "../src/lib/platformConfigShared";

// Platform-wide plans, taxes and fees, and the VAT rate new accounts start with. Admins set them in
// Admin → Plans and Admin → Taxes and fees; every account reads them. Stored in the server-only
// 'platform' collection. Documents already issued keep the rates they were issued with.

const COLLECTION = "platform";
const CONFIG_DOC = "config";

const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);

type Stored = { config: PlatformConfig; saved: boolean; updatedAt: string };
let cache: { at: number; value: Stored } | null = null;

/** The current config. `saved` is false until an admin first saves it (the defaults apply until then). */
export async function getPlatformConfig(): Promise<Stored> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const snap = await getAdminDb().collection(COLLECTION).doc(CONFIG_DOC).get();
  const value: Stored = snap.exists
    ? { config: cleanPlatformConfig(snap.data()), saved: true, updatedAt: String(snap.data()?.updatedAt || "") }
    : { config: DEFAULT_PLATFORM_CONFIG, saved: false, updatedAt: "" };
  cache = { at: Date.now(), value };
  return value;
}

/** GET /api/public/platform-config: anyone (the sign-up screen and plan picker need it too). */
export function createPublicPlatformConfigRouter() {
  const router = express.Router();
  router.use(rateLimit({ name: "public-platform-config", max: 120, windowMs: 60_000 }));
  router.get("/", wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(await getPlatformConfig());
  }));
  return router;
}

/** PUT /api/admin/platform-config: platform admins only. Replaces the whole config. */
export function createAdminPlatformConfigRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin-platform-config", max: 60, windowMs: 60_000 }));
  router.put("/", wrap(async (req, res) => {
    const body = req.body || {};
    if (!body.plans || !Array.isArray(body.platformTaxes) || !Array.isArray(body.platformFees)) {
      return res.status(400).json({ error: "Send the plans, taxes and fees together." });
    }
    const vat = Number(body.defaultVatRate);
    if (!Number.isFinite(vat) || vat < 0 || vat > 100) return res.status(400).json({ error: "The default VAT rate must be between 0 and 100%." });
    for (const c of [...body.platformTaxes, ...body.platformFees]) {
      const rate = Number(c?.rate);
      if (!String(c?.name || "").trim()) return res.status(400).json({ error: "Every tax and fee needs a name." });
      if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: `Check the rate for "${String(c.name).slice(0, 60)}".` });
      if (c.rateType !== "flat" && rate > 100) return res.status(400).json({ error: `"${String(c.name).slice(0, 60)}" can't be more than 100%.` });
    }
    const config = cleanPlatformConfig(body);
    const updatedAt = new Date().toISOString();
    await getAdminDb().collection(COLLECTION).doc(CONFIG_DOC).set({ ...config, updatedAt, updatedBy: req.user?.email || "" });
    cache = null;
    res.json(await getPlatformConfig());
  }));
  return router;
}
