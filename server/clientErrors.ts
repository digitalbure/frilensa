import express, { type Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, requireUser, rateLimit, sha256, type AuthedRequest } from "./security";

// Crash reports from the app's "This screen couldn't be shown" panel, so a crash can be fixed
// from the details instead of a screenshot. Stored in the server-only 'client_errors' collection
// (one row per user and error, with a count) for Admin → App errors, and written to the server log.

export const CLIENT_ERRORS = "client_errors";

// Keep the report to code locations: no query strings (they can carry tokens) and no control characters.
const clean = (v: unknown, max: number) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\?[^\s):]*/g, "").slice(0, max) : "";

export function createClientErrorsRouter() {
  const router = express.Router();
  router.post("/", requireUser, rateLimit({ name: "client-errors", max: 20, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    const message = clean(b.message, 500) || "Unknown error";
    const stack = clean(b.stack, 4000);
    const report = {
      uid: req.user!.uid,
      email: String(req.user?.email || "").toLowerCase(),
      message,
      stack,
      componentStack: clean(b.componentStack, 3000),
      screen: clean(b.screen, 40),
      appVersion: clean(b.appVersion, 20),
      userAgent: clean(req.headers["user-agent"], 300)
    };
    console.error(JSON.stringify({ severity: "ERROR", message: `[client-error] ${message}`, ...report }));
    try {
      const id = sha256(`${report.uid}|${message}|${stack.split("\n")[1] || ""}`).slice(0, 32);
      const now = new Date().toISOString();
      const ref = getAdminDb().collection(CLIENT_ERRORS).doc(id);
      await getAdminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists) tx.update(ref, { ...report, count: FieldValue.increment(1), lastSeen: now });
        else tx.set(ref, { ...report, count: 1, firstSeen: now, lastSeen: now });
      });
    } catch (err: any) {
      console.warn("[client-error] Could not store report:", err?.message || err);
    }
    res.status(204).end();
  });
  return router;
}
