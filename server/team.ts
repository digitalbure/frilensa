import crypto from "crypto";
import express, { type NextFunction, type Response } from "express";
import { getAdminDb, isEmail, rateLimit, requireUser, type AuthedRequest } from "./security";
import { readWorkspace } from "./workspace";
import { notifyEmail, later } from "./notify";
import { ACCESS } from "./access";

// Team and accountant access: a workspace owner invites people by email to their books, as an accountant
// who can only look ("viewer") or someone who can also keep the books ("editor").
//   team_invites/{sha256(token)}           pending invites (server only); the token is only in the link
//   workspace_members/{ownerUid}_{memberUid} who can open whose books, and how (server only)
// firestore.rules read workspace_members to let a member read (and an editor write) the owner's
// workspace records and documents. Only the server writes memberships, here.

const INVITES = "team_invites";
export const MEMBERS = "workspace_members";
export const MAX_TEAM = 10;
const INVITE_DAYS = 14;
export type TeamRole = "viewer" | "editor";

class TeamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const role = (v: unknown): TeamRole => v === "editor" ? "editor" : "viewer";
export const memberId = (ownerUid: string, memberUid: string) => `${ownerUid}_${memberUid}`;

async function ownerName(uid: string) {
  const ws = await readWorkspace(uid).catch(() => null);
  const d = ws?.data;
  const biz = d?.businesses.find(b => b.id === d.activeBusinessId) || d?.businesses[0];
  return { name: biz?.name || d?.userProfile?.name || "A Frilensa user", email: (ws?.raw?.consultantEmail || d?.userProfile?.email || "").toLowerCase(), exists: !!ws };
}

export function createTeamRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "team", max: 60, windowMs: 60_000 }));
  const wrap = (h: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) =>
    h(req, res).catch(err => err instanceof TeamError ? res.status(err.status).json({ error: err.message }) : next(err));
  const db = () => getAdminDb();

  // My team (as an owner) and the books shared with me (as a member).
  router.get("/", wrap(async (req, res) => {
    const uid = req.user!.uid;
    const [members, invites, shared] = await Promise.all([
      db().collection(MEMBERS).where("ownerUid", "==", uid).get(),
      db().collection(INVITES).where("ownerUid", "==", uid).get(),
      db().collection(MEMBERS).where("memberUid", "==", uid).get()
    ]);
    const now = Date.now();
    res.json({
      members: members.docs.map(d => { const m = d.data(); return { memberUid: m.memberUid, email: m.email, name: m.name || "", role: m.role, addedAt: m.addedAt }; }),
      invites: invites.docs.map(d => d.data()).filter(i => i.expiresAt > now).map(i => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: new Date(i.expiresAt).toISOString() })),
      sharedWithMe: shared.docs.map(d => { const m = d.data(); return { ownerUid: m.ownerUid, ownerName: m.ownerName, ownerEmail: m.ownerEmail, role: m.role, addedAt: m.addedAt }; })
    });
  }));

  // Invite someone. The link (with a one-time token) goes by email; the owner can also copy it.
  router.post("/invites", rateLimit({ name: "team-invite", max: 30, windowMs: 60 * 60_000 }), wrap(async (req, res) => {
    const uid = req.user!.uid;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!isEmail(email)) throw new TeamError(400, "Enter their email address.");
    if (email === String(req.user!.email || "").toLowerCase()) throw new TeamError(400, "That's your own email.");
    const owner = await ownerName(uid);
    if (!owner.exists) throw new TeamError(400, "Set up your workspace first.");
    const [members, invites] = await Promise.all([
      db().collection(MEMBERS).where("ownerUid", "==", uid).get(),
      db().collection(INVITES).where("ownerUid", "==", uid).get()
    ]);
    if (members.docs.some(d => d.data().email === email)) throw new TeamError(409, "They already have access.");
    const live = invites.docs.filter(d => d.data().expiresAt > Date.now());
    if (members.size + live.filter(d => d.data().email !== email).length >= MAX_TEAM) throw new TeamError(400, `You can share your books with up to ${MAX_TEAM} people.`);
    // A new invite to the same email replaces the old one.
    const batch = db().batch();
    invites.docs.filter(d => d.data().email === email || d.data().expiresAt <= Date.now()).forEach(d => batch.delete(d.ref));
    const token = crypto.randomBytes(24).toString("base64url");
    const invite = { id: sha256(token).slice(0, 20), ownerUid: uid, ownerName: owner.name, ownerEmail: owner.email, email, role: role(req.body?.role), createdAt: new Date().toISOString(), expiresAt: Date.now() + INVITE_DAYS * 86_400_000 };
    batch.set(db().collection(INVITES).doc(sha256(token)), invite);
    await batch.commit();
    const link = `/?team-invite=${token}`;
    later(notifyEmail(email, {
      subject: `${owner.name} shared their books with you on Frilensa`,
      heading: `${owner.name} invited you to their books`,
      lines: [
        `${owner.name} invited you to their Frilensa books ${invite.role === "editor" ? "to keep them (add and change records)" : "to look at them (you can't change anything)"}.`,
        `Sign in or create a free account with this email address (${email}) to accept. The invitation lasts ${INVITE_DAYS} days.`
      ],
      actionLabel: "Open the books", actionPath: link,
      footer: "You're getting this because someone entered your email address in Frilensa. If you don't know them, ignore it."
    }));
    res.json({ invite: { id: invite.id, email, role: invite.role, createdAt: invite.createdAt, expiresAt: new Date(invite.expiresAt).toISOString() }, link });
  }));

  router.delete("/invites/:id", wrap(async (req, res) => {
    const snap = await db().collection(INVITES).where("ownerUid", "==", req.user!.uid).get();
    const hit = snap.docs.find(d => d.data().id === String(req.params.id));
    if (!hit) throw new TeamError(404, "Invite not found.");
    await hit.ref.delete();
    res.json({ ok: true });
  }));

  // Accept an invite: only with a verified email matching the invite. Also approves the account so an
  // accountant can sign up when sign-ups are invite-only.
  router.post("/accept", rateLimit({ name: "team-accept", max: 20, windowMs: 15 * 60_000 }), wrap(async (req, res) => {
    const uid = req.user!.uid;
    const token = String(req.body?.token || "");
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw new TeamError(400, "This invitation link isn't valid.");
    const ref = db().collection(INVITES).doc(sha256(token));
    const result = await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const inv = snap.data();
      if (!inv || inv.expiresAt < Date.now()) throw new TeamError(404, "This invitation has expired or was cancelled. Ask for a new one.");
      if (String(req.user!.email || "").toLowerCase() !== inv.email || !req.user!.email_verified) {
        throw new TeamError(403, `This invitation is for ${inv.email}. Sign in with that email address to accept it.`);
      }
      if (inv.ownerUid === uid) throw new TeamError(400, "These are your own books.");
      // Firestore transactions: every read before any write.
      const accessRef = db().collection(ACCESS).doc(uid);
      const hasAccess = (await tx.get(accessRef)).exists;
      const memberRef = db().collection(MEMBERS).doc(memberId(inv.ownerUid, uid));
      tx.set(memberRef, { ownerUid: inv.ownerUid, ownerName: inv.ownerName, ownerEmail: inv.ownerEmail, memberUid: uid, email: inv.email, name: String(req.user!.name || "").slice(0, 120), role: inv.role, addedAt: new Date().toISOString() });
      if (!hasAccess) tx.set(accessRef, { via: "team", ownerUid: inv.ownerUid, at: new Date().toISOString() });
      tx.delete(ref);
      return { ownerUid: inv.ownerUid, ownerName: inv.ownerName, ownerEmail: inv.ownerEmail, role: inv.role as TeamRole };
    });
    later(notifyEmail(result.ownerEmail, {
      subject: `${req.user!.email} can now open your books`,
      heading: "Your invitation was accepted",
      lines: [`${req.user!.email} accepted your invitation and can now ${result.role === "editor" ? "keep" : "look at"} your books. You can change or remove their access in Settings → Team and accountant.`],
      actionLabel: "Open Frilensa", actionPath: "/?tab=settings"
    }));
    res.json({ shared: result });
  }));

  // The owner changes someone's access or removes it.
  router.patch("/members/:memberUid", wrap(async (req, res) => {
    const ref = db().collection(MEMBERS).doc(memberId(req.user!.uid, String(req.params.memberUid)));
    if (!(await ref.get()).exists) throw new TeamError(404, "They don't have access.");
    await ref.update({ role: role(req.body?.role) });
    res.json({ ok: true });
  }));
  router.delete("/members/:memberUid", wrap(async (req, res) => {
    await db().collection(MEMBERS).doc(memberId(req.user!.uid, String(req.params.memberUid))).delete();
    res.json({ ok: true });
  }));
  // A member leaves someone's books.
  router.delete("/shared/:ownerUid", wrap(async (req, res) => {
    await db().collection(MEMBERS).doc(memberId(String(req.params.ownerUid), req.user!.uid)).delete();
    res.json({ ok: true });
  }));

  return router;
}
