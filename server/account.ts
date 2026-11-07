import express, { type Response, type NextFunction } from "express";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import type { Query } from "firebase-admin/firestore";
import { getAdminApp, getAdminDb, requireUser, rateLimit, type AuthedRequest } from "./security";

// DELETE /api/account: the signed-in user deletes their account and everything stored for it.
// Needs a sign-in within the last 10 minutes, so a session left open can't be used to do it.
// Keep this list in step with new collections that store a user's data.

const RECENT_SIGN_IN_SECONDS = 10 * 60;

/** Collections holding a user's data, and the field that names the owner. */
const OWNED: [collection: string, field: string][] = [
  ["documents", "consultantId"],
  ["support_messages", "consultantId"],
  ["portal_access", "consultantId"],
  ["paypal_captures", "consultantId"],
  ["quote_requests", "uid"],
  ["webhooks", "uid"],
  ["webhook_deliveries", "uid"],
  ["api_keys", "uid"],
  ["oauth_grants", "uid"],
  ["oauth_tokens", "uid"],
  ["oauth_codes", "uid"],
  ["rate_cards", "uid"],
  ["booking_slugs", "uid"],
  ["files", "uid"],
  ["paypal_accounts", "uid"],
  ["client_errors", "uid"],
  ["directory_bookings", "providerUid"],
  ["directory_bookings", "requesterUid"],
  ["marketplace_listings", "ownerUid"],
  ["marketplace_requests", "ownerUid"],
  ["marketplace_requests", "requesterUid"]
];
/** Documents keyed by the user's id. */
const KEYED_BY_UID = ["directory_listings", "automation_runs", "account_access"];

async function deleteQuery(q: Query) {
  let removed = 0;
  for (;;) {
    const snap = await q.limit(400).get();
    if (snap.empty) return removed;
    const batch = getAdminDb().batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) return removed;
  }
}

/** Removes everything stored for a user, then the sign-in itself. Returns a count per collection. */
export async function deleteAccountData(uid: string, email: string) {
  const db = getAdminDb();
  const removed: Record<string, number> = {};
  // The workspace: head document and every item record under it.
  await db.recursiveDelete(db.collection("consultants").doc(uid));
  if (email) {
    await db.collection("consultants").doc(email).delete().catch(() => {});
    await db.collection("consultants_by_email").doc(email).delete().catch(() => {});
  }
  for (const [name, field] of OWNED) {
    removed[`${name}.${field}`] = await deleteQuery(db.collection(name).where(field, "==", uid));
  }
  await Promise.all(KEYED_BY_UID.map(name => db.collection(name).doc(uid).delete().catch(() => {})));
  // Uploaded receipts and attachments.
  if (process.env.FILES_BUCKET) {
    await getStorage(getAdminApp()).bucket(process.env.FILES_BUCKET).deleteFiles({ prefix: `receipts/${uid}/` }).catch(err => console.warn("[account] Could not delete files:", err?.message || err));
  }
  await getAuth(getAdminApp()).deleteUser(uid).catch(err => { if (err?.code !== "auth/user-not-found") throw err; });
  return removed;
}

export function createAccountRouter() {
  const router = express.Router();
  router.delete("/", requireUser, rateLimit({ name: "account-delete", max: 5, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const authTime = Number(req.user?.auth_time || 0);
      if (!authTime || Date.now() / 1000 - authTime > RECENT_SIGN_IN_SECONDS) {
        return res.status(401).json({ error: "For your safety, sign in again before deleting your account.", reauth: true });
      }
      if (String(req.body?.confirm || "").trim().toUpperCase() !== "DELETE") {
        return res.status(400).json({ error: "Type DELETE to confirm." });
      }
      const uid = req.user!.uid;
      const email = String(req.user!.email || "").toLowerCase();
      const removed = await deleteAccountData(uid, email);
      console.log(JSON.stringify({ severity: "NOTICE", message: "[account] Account deleted", uid, removed }));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
