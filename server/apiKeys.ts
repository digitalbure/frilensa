import crypto from "crypto";
import express, { type NextFunction, type Response } from "express";
import { getAdminDb, requireUser, rateLimit, sha256, type AuthedRequest } from "./security";
import { verifyAccessToken, publicOrigin } from "./oauth";

// Personal API keys for the public API and MCP server. Server-only collection (Firestore rules
// deny browser access). Keys are stored as a SHA-256 hash; the key itself is shown once.

const KEYS = "api_keys";
const MAX_KEYS_PER_USER = 10;
export type ApiScope = "read" | "draft";

export interface ApiKeyRecord {
  uid: string;
  name: string;
  prefix: string;        // first characters, shown in Settings to tell keys apart
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface ApiRequest extends AuthedRequest {
  apiKey?: { id: string; uid: string; name: string; scopes: ApiScope[] };
}

function newKey() {
  return `frk_${crypto.randomBytes(24).toString("base64url")}`;
}

const lastUseWrites = new Map<string, number>();

/** Requires `Authorization: Bearer frk_…` and the given scope. */
export function requireApiKey(scope: ApiScope = "read") {
  return async (req: ApiRequest, res: Response, next: NextFunction) => {
    const bearer = (req.headers.authorization || "").match(/^Bearer ([A-Za-z0-9_-]{20,90})$/)?.[1] || "";
    // Tells MCP clients (e.g. claude.ai) where to sign in with OAuth.
    const challenge = () => res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${publicOrigin(req)}/.well-known/oauth-protected-resource"`);
    if (bearer.startsWith("fra_")) {
      try {
        const token = await verifyAccessToken(bearer);
        if (!token) {
          challenge();
          return res.status(401).json({ error: "This sign-in has expired or was removed. Connect Frilensa again." });
        }
        if (!token.scopes.includes(scope)) return res.status(403).json({ error: "This connection is read-only." });
        req.apiKey = token;
        return next();
      } catch (err) {
        return next(err);
      }
    }
    if (!bearer.startsWith("frk_")) {
      challenge();
      return res.status(401).json({ error: "Send your Frilensa API key as: Authorization: Bearer frk_…" });
    }
    try {
      const id = sha256(bearer);
      const snap = await getAdminDb().collection(KEYS).doc(id).get();
      const key = snap.data() as ApiKeyRecord | undefined;
      if (!key || key.revokedAt) return res.status(401).json({ error: "This API key isn't valid or has been revoked." });
      if (!key.scopes.includes(scope)) {
        return res.status(403).json({ error: "This API key is read-only. Create a key with draft access in Settings → API keys." });
      }
      req.apiKey = { id, uid: key.uid, name: key.name, scopes: key.scopes };
      // Record use at most once a minute per key.
      const now = Date.now();
      if ((lastUseWrites.get(id) || 0) < now - 60_000) {
        lastUseWrites.set(id, now);
        snap.ref.update({ lastUsedAt: new Date(now).toISOString() }).catch(() => {});
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Rate limit per API key (falls back to IP before the key is checked). */
export const apiRateLimit = rateLimit({ name: "api", max: 120, windowMs: 60_000, key: r => (r as ApiRequest).apiKey?.id || r.ip || "anon" });

function view(id: string, k: ApiKeyRecord) {
  return { id: id.slice(0, 16), name: k.name, prefix: k.prefix, scopes: k.scopes, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null };
}

/** Managing your own keys from the app: GET/POST /api/keys, DELETE /api/keys/:id. */
export function createApiKeysRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "api-keys", max: 30, windowMs: 60 * 60_000 }));

  router.get("/", async (req: AuthedRequest, res, next) => {
    try {
      const snap = await getAdminDb().collection(KEYS).where("uid", "==", req.user!.uid).get();
      const keys = snap.docs
        .map(d => ({ id: d.id, k: d.data() as ApiKeyRecord }))
        .filter(({ k }) => !k.revokedAt)
        .sort((a, b) => b.k.createdAt.localeCompare(a.k.createdAt))
        .map(({ id, k }) => view(id, k));
      res.json({ keys });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req: AuthedRequest, res, next) => {
    try {
      const name = String(req.body?.name || "").trim().slice(0, 60) || "API key";
      const scopes: ApiScope[] = req.body?.access === "read" ? ["read"] : ["read", "draft"];
      const db = getAdminDb();
      const existing = await db.collection(KEYS).where("uid", "==", req.user!.uid).get();
      if (existing.docs.filter(d => !d.data().revokedAt).length >= MAX_KEYS_PER_USER) {
        return res.status(409).json({ error: `You can have up to ${MAX_KEYS_PER_USER} keys. Revoke one you no longer use.` });
      }
      const key = newKey();
      const id = sha256(key);
      const record: ApiKeyRecord = { uid: req.user!.uid, name, prefix: key.slice(0, 10), scopes, createdAt: new Date().toISOString() };
      await db.collection(KEYS).doc(id).set(record);
      res.json({ key, ...view(id, record) });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req: AuthedRequest, res, next) => {
    try {
      const short = String(req.params.id || "");
      if (!/^[0-9a-f]{16}$/.test(short)) return res.status(404).json({ error: "Key not found." });
      const snap = await getAdminDb().collection(KEYS).where("uid", "==", req.user!.uid).get();
      const match = snap.docs.find(d => d.id.startsWith(short) && !d.data().revokedAt);
      if (!match) return res.status(404).json({ error: "Key not found." });
      await match.ref.update({ revokedAt: new Date().toISOString() });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
