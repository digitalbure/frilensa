import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// ---------- Firebase Admin ----------
// Uses Application Default Credentials (automatic on Cloud Run; locally set
// GOOGLE_APPLICATION_CREDENTIALS to a service-account key file).

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

export function getAdminApp(): App {
  if (adminApp) return adminApp;
  adminApp = getApps()[0] || initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId
  });
  return adminApp;
}

export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || (firebaseConfig as any).firestoreDatabaseId;
  adminDb = databaseId && databaseId !== "(default)"
    ? getFirestore(getAdminApp(), databaseId)
    : getFirestore(getAdminApp());
  return adminDb;
}

// ---------- Consultant authentication ----------

export interface AuthedRequest extends Request {
  user?: DecodedIdToken;
}

/** Requires a valid Firebase ID token from a verified-email account. */
export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: "Please sign in to use this feature." });
  }
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(match[1]);
    if (!decoded.email_verified) {
      return res.status(403).json({ error: "Please verify your email address first." });
    }
    req.user = decoded;
    next();
  } catch (err: any) {
    console.warn("[auth] Rejected ID token:", err?.code || err?.message);
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

// ---------- Rate limiting (in-memory, per process) ----------

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: { name: string; max: number; windowMs: number; key?: (req: AuthedRequest) => string }) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const who = opts.key ? opts.key(req) : (req.user?.uid || req.ip || "anon");
    const k = `${opts.name}:${who}`;
    const now = Date.now();
    const bucket = buckets.get(k);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(k, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (bucket.count >= opts.max) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }
    bucket.count++;
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

// ---------- Helpers ----------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | undefined): boolean {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, saltHex, hashHex] = stored.split("$");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- Client portal sessions (HMAC-signed, stateless) ----------

let sessionSecret = process.env.PORTAL_SESSION_SECRET || "";
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("[portal] PORTAL_SESSION_SECRET is not set; using a random secret. Client portal sessions will end when the server restarts.");
}

export interface PortalClaims {
  consultantId: string;
  clientId: string;
  email: string;
  clientName: string;
  exp: number;
}

export const PORTAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function signPortalSession(claims: Omit<PortalClaims, "exp">): { token: string; exp: number } {
  const exp = Date.now() + PORTAL_SESSION_TTL_MS;
  const body = Buffer.from(JSON.stringify({ ...claims, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
  return { token: `${body}.${sig}`, exp };
}

export function verifyPortalSession(token: string): PortalClaims | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as PortalClaims;
    return claims.exp > Date.now() ? claims : null;
  } catch {
    return null;
  }
}
