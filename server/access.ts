import express, { type Response, type NextFunction } from "express";
import crypto from "crypto";
import { getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";
import { requireAdmin } from "./admin";

// Who may start using Frilensa. Signing up (Firebase Auth) is open, but a new account can only create
// its workspace once the server has approved it here: firestore.rules let a user write
// consultants/{uid} only when account_access/{uid} exists or the workspace already does (everyone who
// signed up before this check). The mode (open / invite-only / closed) and invite codes are set in
// Admin → Access and stored in the server-only 'platform' and 'platform_invites' collections.

export type RegistrationMode = "open" | "invite_only" | "disabled";
const PLATFORM = "platform";
const REGISTRATION_DOC = "registration";
const INVITES = "platform_invites";
export const ACCESS = "account_access";

const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) => h(req, res).catch(next);
const adminEmails = () => String(process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const normCode = (v: unknown) => String(v || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);

export async function registrationMode(): Promise<RegistrationMode> {
  const snap = await getAdminDb().collection(PLATFORM).doc(REGISTRATION_DOC).get();
  const mode = snap.data()?.mode;
  return mode === "invite_only" || mode === "disabled" ? mode : "open";
}

interface Invite {
  code: string; email?: string; plan: "free" | "pro" | "premium"; notes?: string;
  maxUses: number; uses: number; usedBy: { email: string; uid: string; at: string }[];
  createdAt: string; createdBy?: string; expiresAt?: string;
}

/** Why an invite can't be used by this email, or null if it can. */
function inviteProblem(inv: Invite | undefined, email: string): string | null {
  if (!inv) return "That invite code isn't valid.";
  if (inv.expiresAt && inv.expiresAt < new Date().toISOString()) return "That invite code has expired.";
  if (inv.uses >= inv.maxUses) return "That invite code has already been used.";
  if (inv.email && email && inv.email !== email) return "That invite code is for a different email address.";
  return null;
}

async function hasOlderWorkspace(uid: string, email: string) {
  const db = getAdminDb();
  const checks = [db.collection("consultants").doc(uid).get()];
  if (email) checks.push(db.collection("consultants").doc(email).get(), db.collection("consultants_by_email").doc(email).get());
  return (await Promise.all(checks)).some(s => s.exists);
}

/** Public: the sign-up mode (for the sign-up form), and an invite check before an account is made. */
export function createPublicRegistrationRouter() {
  const router = express.Router();
  router.get("/", rateLimit({ name: "public-registration", max: 120, windowMs: 60_000, key: r => r.ip || "anon" }), wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ mode: await registrationMode() });
  }));
  router.post("/check-invite", rateLimit({ name: "check-invite", max: 20, windowMs: 10 * 60_000, key: r => r.ip || "anon" }), wrap(async (req, res) => {
    const code = normCode(req.body?.code);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const snap = code ? await getAdminDb().collection(INVITES).doc(code).get() : null;
    const inv = snap?.exists ? (snap.data() as Invite) : undefined;
    const problem = inviteProblem(inv, email);
    res.status(problem ? 400 : 200).json(problem ? { error: problem } : { ok: true, plan: inv!.plan });
  }));
  return router;
}

/** POST /api/account/register: approves the signed-in account (once) under the current mode. */
export function createAccountAccessRouter() {
  const router = express.Router();
  router.post("/register", requireUser, rateLimit({ name: "account-register", max: 20, windowMs: 10 * 60_000 }), wrap(async (req, res) => {
    const uid = req.user!.uid;
    const email = String(req.user!.email || "").toLowerCase();
    const db = getAdminDb();
    const ref = db.collection(ACCESS).doc(uid);
    const existing = await ref.get();
    if (existing.exists) return res.json({ ok: true, plan: existing.data()?.plan || null });
    const now = new Date().toISOString();

    if (adminEmails().includes(email) || await hasOlderWorkspace(uid, email)) {
      await ref.set({ email, via: adminEmails().includes(email) ? "admin" : "existing", approvedAt: now });
      return res.json({ ok: true, plan: null });
    }
    const mode = await registrationMode();
    if (mode === "disabled") return res.status(403).json({ error: "New sign-ups are closed right now.", mode });
    if (mode === "open") {
      await ref.set({ email, via: "open", approvedAt: now });
      return res.json({ ok: true, plan: null });
    }
    // Invite only: use one place on the invite, in a transaction so two people can't take the last one.
    const code = normCode(req.body?.inviteCode);
    if (!code) return res.status(403).json({ error: "Frilensa is invite-only right now. Enter your invite code.", mode, needsInvite: true });
    const invRef = db.collection(INVITES).doc(code);
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(invRef);
      const inv = snap.exists ? (snap.data() as Invite) : undefined;
      const problem = inviteProblem(inv, email);
      if (problem) return { problem };
      tx.update(invRef, { uses: inv!.uses + 1, usedBy: [...(inv!.usedBy || []), { email, uid, at: now }] });
      tx.set(ref, { email, via: "invite", inviteCode: code, plan: inv!.plan, approvedAt: now });
      return { plan: inv!.plan };
    });
    if ("problem" in result) return res.status(403).json({ error: result.problem, mode, needsInvite: true });
    res.json({ ok: true, plan: result.plan });
  }));
  return router;
}

/** /api/admin/access: the sign-up mode and invite codes. */
export function createAdminAccessRouter() {
  const router = express.Router();
  router.use(requireUser, requireAdmin, rateLimit({ name: "admin-access", max: 120, windowMs: 60_000 }));

  router.get("/", wrap(async (_req, res) => {
    const invites = await getAdminDb().collection(INVITES).orderBy("createdAt", "desc").limit(500).get();
    res.json({ mode: await registrationMode(), invites: invites.docs.map(d => d.data()) });
  }));
  router.put("/mode", wrap(async (req, res) => {
    const mode = req.body?.mode;
    if (!["open", "invite_only", "disabled"].includes(mode)) return res.status(400).json({ error: "Choose open, invite only or closed." });
    await getAdminDb().collection(PLATFORM).doc(REGISTRATION_DOC).set({ mode, updatedAt: new Date().toISOString(), updatedBy: req.user?.email || "" });
    res.json({ mode });
  }));
  router.post("/invites", wrap(async (req, res) => {
    const b = req.body || {};
    const code = normCode(b.code) || `FRILENSA-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const email = String(b.email || "").trim().toLowerCase();
    if (email && !isEmail(email)) return res.status(400).json({ error: "Enter a valid email, or leave it empty." });
    const maxUses = Math.min(1000, Math.max(1, Math.floor(Number(b.maxUses) || 1)));
    const days = Math.floor(Number(b.expiresInDays) || 0);
    const invite: Invite = {
      code, ...(email ? { email } : {}),
      plan: ["pro", "premium"].includes(b.plan) ? b.plan : "free",
      ...(typeof b.notes === "string" && b.notes.trim() ? { notes: b.notes.trim().slice(0, 200) } : {}),
      maxUses, uses: 0, usedBy: [],
      createdAt: new Date().toISOString(), createdBy: req.user?.email || "",
      ...(days > 0 ? { expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() } : {})
    };
    const ref = getAdminDb().collection(INVITES).doc(code);
    try {
      await ref.create(invite);
    } catch {
      return res.status(409).json({ error: "That code already exists. Choose another." });
    }
    res.json({ invite });
  }));
  router.delete("/invites/:code", wrap(async (req, res) => {
    await getAdminDb().collection(INVITES).doc(normCode(req.params.code)).delete();
    res.json({ ok: true });
  }));
  return router;
}
