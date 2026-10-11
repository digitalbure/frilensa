import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { getAdminDb, requireUser, rateLimit, sha256, type AuthedRequest } from "./security";
import type { ApiScope } from "./apiKeys";

// OAuth 2.1 authorization server for the MCP server, as the MCP authorization spec describes, so
// Frilensa can be added as a connector in claude.ai and other MCP clients:
//   - protected resource metadata (RFC 9728) and authorization server metadata (RFC 8414)
//   - dynamic client registration (RFC 7591)
//   - authorization code flow with PKCE (S256 only); the consent page is part of the web app
//     (/oauth/authorize) and approves through POST /api/oauth/approve with the user's Firebase sign-in
//   - access tokens (1 hour) and rotating refresh tokens (30 days), stored only as hashes
// Server-only collections: oauth_clients, oauth_codes, oauth_grants, oauth_tokens.

const CLIENTS = "oauth_clients";
const CODES = "oauth_codes";
const GRANTS = "oauth_grants";
const TOKENS = "oauth_tokens";

const CODE_TTL_MS = 10 * 60_000;
const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const SCOPES: ApiScope[] = ["read", "draft"];

/**
 * This server's public address as the client reached it (https://frilensa.com, or another domain or
 * the Cloud Run URL). Discovery documents must name the address the client used, so this comes
 * from the request rather than APP_URL. Anything but localhost is always https.
 */
export function publicOrigin(req: Request): string {
  const host = req.get("host") || "frilensa.com";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? req.protocol : "https"}://${host}`;
}
const mcpResourceUrl = (req: Request) => `${publicOrigin(req)}/mcp`;

interface OAuthClient {
  clientName: string;
  redirectUris: string[];
  createdAt: string;
}

interface OAuthGrant {
  uid: string;
  clientId: string;
  clientName: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface OAuthToken {
  kind: "access" | "refresh";
  grantId: string;
  uid: string;
  clientId: string;
  scopes: ApiScope[];
  expiresAt: number;
  usedAt?: number; // refresh tokens are single use
}

const random = (prefix: string) => `${prefix}${crypto.randomBytes(32).toString("base64url")}`;

function parseScopes(raw: unknown): ApiScope[] | null {
  const requested = String(raw || "").split(/\s+/).filter(Boolean);
  if (requested.length === 0) return ["read", "draft"];
  if (requested.some(s => !SCOPES.includes(s as ApiScope))) return null;
  return Array.from(new Set(["read", ...requested])) as ApiScope[];
}

/** A redirect URI a client may register: https anywhere, or http only on this machine. */
function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function cors(_req: Request, res: Response, next: NextFunction) {
  // Bearer tokens only, no cookies, so any origin may call these endpoints.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Protocol-Version");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") return res.status(204).end();
  next();
}

function oauthError(res: Response, status: number, error: string, description: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error, error_description: description });
}

/** Looks up an OAuth access token for the API and MCP server. Null if unknown, expired or revoked. */
export async function verifyAccessToken(token: string): Promise<{ id: string; uid: string; name: string; scopes: ApiScope[] } | null> {
  if (!/^fra_[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const db = getAdminDb();
  const snap = await db.collection(TOKENS).doc(sha256(token)).get();
  const t = snap.data() as OAuthToken | undefined;
  if (!t || t.kind !== "access" || t.expiresAt < Date.now()) return null;
  const grantSnap = await db.collection(GRANTS).doc(t.grantId).get();
  const grant = grantSnap.data() as OAuthGrant | undefined;
  if (!grant || grant.revokedAt) return null;
  if (!grant.lastUsedAt || Date.parse(grant.lastUsedAt) < Date.now() - 60_000) {
    grantSnap.ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => {});
  }
  return { id: `grant:${t.grantId}`, uid: t.uid, name: grant.clientName, scopes: t.scopes };
}

async function issueTokens(grantId: string, uid: string, clientId: string, scopes: ApiScope[]) {
  const access = random("fra_");
  const refresh = random("frr_");
  const now = Date.now();
  const db = getAdminDb();
  const batch = db.batch();
  batch.set(db.collection(TOKENS).doc(sha256(access)), { kind: "access", grantId, uid, clientId, scopes, expiresAt: now + ACCESS_TTL_MS } satisfies OAuthToken);
  batch.set(db.collection(TOKENS).doc(sha256(refresh)), { kind: "refresh", grantId, uid, clientId, scopes, expiresAt: now + REFRESH_TTL_MS } satisfies OAuthToken);
  await batch.commit();
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: refresh,
    scope: scopes.join(" ")
  };
}

/** Discovery documents and the OAuth endpoints a client talks to directly. */
export function createOAuthRouter() {
  const router = express.Router();
  router.use(["/.well-known", "/oauth/register", "/oauth/token", "/oauth/revoke"], cors);

  const protectedResource = (req: Request, res: Response) => res.json({
    resource: mcpResourceUrl(req),
    authorization_servers: [publicOrigin(req)],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Frilensa"
  });
  router.get("/.well-known/oauth-protected-resource", protectedResource);
  router.get("/.well-known/oauth-protected-resource/mcp", protectedResource);

  const authServer = (req: Request, res: Response) => res.json({
    issuer: publicOrigin(req),
    authorization_endpoint: `${publicOrigin(req)}/oauth/authorize`,
    token_endpoint: `${publicOrigin(req)}/oauth/token`,
    registration_endpoint: `${publicOrigin(req)}/oauth/register`,
    revocation_endpoint: `${publicOrigin(req)}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES
  });
  router.get("/.well-known/oauth-authorization-server", authServer);
  router.get("/.well-known/openid-configuration", authServer);

  // Dynamic client registration. Clients are public (PKCE, no secret).
  router.post("/oauth/register", rateLimit({ name: "oauth-register", max: 100, windowMs: 60 * 60_000, key: r => r.ip || "anon" }), async (req, res, next) => {
    try {
      const body = req.body || {};
      const redirectUris: unknown[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      if (redirectUris.length === 0 || redirectUris.length > 5 || !redirectUris.every(validRedirectUri)) {
        return oauthError(res, 400, "invalid_redirect_uri", "Give 1 to 5 redirect URIs using https (or http on localhost).");
      }
      const clientName = String(body.client_name || "").trim().slice(0, 80) || new URL(redirectUris[0] as string).hostname;
      const clientId = random("frc_");
      const client: OAuthClient = { clientName, redirectUris: redirectUris as string[], createdAt: new Date().toISOString() };
      await getAdminDb().collection(CLIENTS).doc(clientId).set(client);
      res.status(201).json({
        client_id: clientId,
        client_name: clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(Date.now() / 1000)
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/oauth/token", rateLimit({ name: "oauth-token", max: 60, windowMs: 60_000, key: r => r.ip || "anon" }), async (req, res, next) => {
    try {
      const body = req.body || {};
      const db = getAdminDb();
      if (body.grant_type === "authorization_code") {
        const { code, redirect_uri, client_id, code_verifier } = body;
        if (typeof code !== "string" || typeof code_verifier !== "string") return oauthError(res, 400, "invalid_request", "code and code_verifier are required.");
        const ref = db.collection(CODES).doc(sha256(code));
        // Single use: read and delete in one transaction.
        const stored = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) return null;
          tx.delete(ref);
          return snap.data() as any;
        });
        if (!stored || stored.expiresAt < Date.now()) return oauthError(res, 400, "invalid_grant", "The authorization code is invalid or has expired.");
        if (stored.clientId !== client_id || stored.redirectUri !== redirect_uri) return oauthError(res, 400, "invalid_grant", "The code was issued to a different client or redirect URI.");
        const challenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
        if (challenge !== stored.codeChallenge) return oauthError(res, 400, "invalid_grant", "PKCE verification failed.");
        res.setHeader("Cache-Control", "no-store");
        return res.json(await issueTokens(stored.grantId, stored.uid, stored.clientId, stored.scopes));
      }

      if (body.grant_type === "refresh_token") {
        const { refresh_token, client_id } = body;
        if (typeof refresh_token !== "string") return oauthError(res, 400, "invalid_request", "refresh_token is required.");
        const ref = db.collection(TOKENS).doc(sha256(refresh_token));
        const t = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          const data = snap.data() as OAuthToken | undefined;
          if (!data || data.kind !== "refresh" || data.usedAt) return { data, reused: Boolean(data?.usedAt) };
          tx.update(ref, { usedAt: Date.now() });
          return { data, reused: false };
        });
        if (t.reused && t.data) {
          // A refresh token used twice may have been stolen: end the whole connection.
          await db.collection(GRANTS).doc(t.data.grantId).update({ revokedAt: new Date().toISOString() }).catch(() => {});
          return oauthError(res, 400, "invalid_grant", "This refresh token was already used. Connect Frilensa again.");
        }
        const data = t.data;
        if (!data || data.kind !== "refresh" || data.expiresAt < Date.now() || data.clientId !== client_id) {
          return oauthError(res, 400, "invalid_grant", "The refresh token is invalid or has expired.");
        }
        const grant = (await db.collection(GRANTS).doc(data.grantId).get()).data() as OAuthGrant | undefined;
        if (!grant || grant.revokedAt) return oauthError(res, 400, "invalid_grant", "This connection was removed in Frilensa. Connect again.");
        res.setHeader("Cache-Control", "no-store");
        return res.json(await issueTokens(data.grantId, data.uid, data.clientId, data.scopes));
      }

      return oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
    } catch (err) {
      next(err);
    }
  });

  // Token revocation (RFC 7009): revoking either token ends the connection.
  router.post("/oauth/revoke", rateLimit({ name: "oauth-revoke", max: 60, windowMs: 60_000, key: r => r.ip || "anon" }), async (req, res, next) => {
    try {
      const token = String(req.body?.token || "");
      if (token) {
        const snap = await getAdminDb().collection(TOKENS).doc(sha256(token)).get();
        const t = snap.data() as OAuthToken | undefined;
        if (t) await getAdminDb().collection(GRANTS).doc(t.grantId).update({ revokedAt: new Date().toISOString() });
      }
      res.status(200).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Used by the consent page in the web app (signed-in consultant). */
export function createOAuthAppRouter() {
  const router = express.Router();

  async function loadClient(clientId: unknown, redirectUri: unknown) {
    if (typeof clientId !== "string" || !/^frc_[A-Za-z0-9_-]{30,80}$/.test(clientId)) return null;
    const client = (await getAdminDb().collection(CLIENTS).doc(clientId).get()).data() as OAuthClient | undefined;
    if (!client || typeof redirectUri !== "string" || !client.redirectUris.includes(redirectUri)) return null;
    return client;
  }

  // Lets the consent page check a request before showing it. Never redirects.
  router.get("/client", rateLimit({ name: "oauth-client", max: 60, windowMs: 60_000, key: r => r.ip || "anon" }), async (req, res, next) => {
    try {
      const client = await loadClient(req.query.client_id, req.query.redirect_uri);
      if (!client) return res.status(400).json({ error: "This connection request isn't valid. Start again from the app you're connecting." });
      res.json({ clientName: client.clientName, redirectHost: new URL(String(req.query.redirect_uri)).host });
    } catch (err) {
      next(err);
    }
  });

  router.use(requireUser, rateLimit({ name: "oauth-app", max: 30, windowMs: 60 * 60_000 }));

  router.post("/approve", async (req: AuthedRequest, res, next) => {
    try {
      const p = req.body || {};
      const client = await loadClient(p.client_id, p.redirect_uri);
      if (!client) return res.status(400).json({ error: "This connection request isn't valid. Start again from the app you're connecting." });
      const redirect = new URL(p.redirect_uri);
      if (typeof p.state === "string") redirect.searchParams.set("state", p.state.slice(0, 500));

      if (p.decision !== "allow") {
        redirect.searchParams.set("error", "access_denied");
        return res.json({ redirectTo: redirect.toString() });
      }
      if (p.response_type !== "code") return res.status(400).json({ error: "Unsupported response_type." });
      if (p.code_challenge_method !== "S256" || typeof p.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) {
        return res.status(400).json({ error: "This app didn't send a valid PKCE code challenge." });
      }
      if (p.resource && p.resource !== mcpResourceUrl(req)) return res.status(400).json({ error: "This request is for a different server." });
      const requested = parseScopes(p.scope);
      if (!requested) return res.status(400).json({ error: "This app asked for permissions Frilensa doesn't offer." });
      // The user may narrow the access on the consent page, never widen it.
      const scopes: ApiScope[] = p.access === "read" || !requested.includes("draft") ? ["read"] : ["read", "draft"];

      const db = getAdminDb();
      const grantRef = db.collection(GRANTS).doc();
      const grant: OAuthGrant = { uid: req.user!.uid, clientId: p.client_id, clientName: client.clientName, scopes, createdAt: new Date().toISOString() };
      const code = random("frx_");
      const batch = db.batch();
      batch.set(grantRef, grant);
      batch.set(db.collection(CODES).doc(sha256(code)), {
        grantId: grantRef.id, uid: grant.uid, clientId: p.client_id, redirectUri: p.redirect_uri,
        codeChallenge: p.code_challenge, scopes, expiresAt: Date.now() + CODE_TTL_MS
      });
      await batch.commit();
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("iss", publicOrigin(req));
      res.json({ redirectTo: redirect.toString() });
    } catch (err) {
      next(err);
    }
  });

  // Connected apps, listed and removed in Settings.
  router.get("/connections", async (req: AuthedRequest, res, next) => {
    try {
      const snap = await getAdminDb().collection(GRANTS).where("uid", "==", req.user!.uid).get();
      const connections = snap.docs
        .map(d => ({ id: d.id, g: d.data() as OAuthGrant }))
        .filter(({ g }) => !g.revokedAt)
        .sort((a, b) => b.g.createdAt.localeCompare(a.g.createdAt))
        .map(({ id, g }) => ({ id, name: g.clientName, scopes: g.scopes, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt || null }));
      res.json({ connections });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/connections/:id", async (req: AuthedRequest, res, next) => {
    try {
      const ref = getAdminDb().collection(GRANTS).doc(String(req.params.id));
      const grant = (await ref.get()).data() as OAuthGrant | undefined;
      if (!grant || grant.uid !== req.user!.uid || grant.revokedAt) return res.status(404).json({ error: "Connection not found." });
      await ref.update({ revokedAt: new Date().toISOString() });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
