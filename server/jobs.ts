import crypto from "crypto";
import express, { type Response } from "express";
import { getAdminDb, isEmail, requireUser, rateLimit, type AuthedRequest } from "./security";
import { sendDocumentEmail, sendgridConfigured } from "./documentEmail";
import { appUrl, render } from "./notify";
import { sendViaSendGrid } from "../src/lib/transactionalEmailServer";
import { runDueRetainers, todayIn } from "../src/lib/retainers";
import { planReminders, reminderMessage, type PlannedReminder } from "../src/lib/reminders";
import { normalizeDocuments } from "../src/lib/normalizeDocuments";
import { buildFlatDocumentRow, flatDocumentId, sanitizeForFirestore } from "../src/lib/flatDocuments";
import type { CRMData, CRMDocument } from "../src/types";

// Daily automation: generates retainer invoices that are due, optionally emails them, and sends
// overdue reminders. Runs once a day from Cloud Scheduler (POST /api/jobs/daily) and on demand
// from Settings (POST /api/automation/run-now). Every step is safe to repeat on the same day.

const RUNS = "automation_runs"; // server-only (Firestore rules deny browser access)
const MAX_REMINDERS_PER_RUN = 50;

export interface AutomationResult {
  ranAt: string;
  trigger: "schedule" | "manual";
  today: string;
  invoicesCreated: { id: string; documentNumber: string; total: number; currency: string; emailedTo?: string }[];
  remindersSent: { documentNumber: string; level: number; to: string }[];
  problems: string[];
}

function toData(raw: any): CRMData {
  return normalizeDocuments({
    ...raw,
    userProfile: raw.userProfile || {},
    businesses: raw.businesses || [],
    clients: raw.clients || [],
    documents: raw.documents || [],
    recurringInvoices: raw.recurringInvoices || [],
    activeBusinessId: raw.activeBusinessId || ""
  } as CRMData);
}

function needsRun(raw: any): boolean {
  const auto = raw?.userProfile?.automation || {};
  if (auto.overdueReminders) return true;
  return (raw?.recurringInvoices || []).some((r: any) => r?.status === "active" && r?.autoGenerate);
}

/** Creates the retainer invoices due today in one transaction (workspace + flat copies). */
async function generateRetainerInvoices(uid: string, today: string) {
  const db = getAdminDb();
  const wsRef = db.collection("consultants").doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(wsRef);
    if (!snap.exists) return { raw: null as any, created: [] as CRMDocument[] };
    const raw = snap.data() as any;
    const { data: next, created } = runDueRetainers(toData(raw), today, { onlyAutoGenerate: true });
    if (created.length === 0) return { raw, created };

    const now = new Date().toISOString();
    const touched = new Map((next.recurringInvoices || []).map(r => [r.id, r]));
    // Write only what changed: the new invoices and the retainers' "last generated" markers.
    const recurringInvoices = (raw.recurringInvoices || []).map((r: any) => {
      const updated = touched.get(r.id);
      if (!updated || updated.lastGeneratedDate === r.lastGeneratedDate) return r;
      return { ...r, lastGeneratedDate: updated.lastGeneratedDate, generatedDocIds: updated.generatedDocIds, updatedAt: now };
    });
    const documents = [...created.map(d => ({ ...d, updatedAt: now })), ...(raw.documents || [])];
    tx.update(wsRef, sanitizeForFirestore({ documents, recurringInvoices, updatedAt: now }));

    const consultantEmail = raw.consultantEmail || raw.userProfile?.email || "";
    for (const d of created) {
      const row = buildFlatDocumentRow(uid, consultantEmail, { ...d, updatedAt: now },
        next.businesses.find(b => b.id === d.businessId), next.clients.find(c => c.id === d.clientId));
      tx.set(db.collection("documents").doc(flatDocumentId(uid, d.id)), row);
    }
    return { raw: { ...raw, documents, recurringInvoices }, created };
  });
}

/** Applies small per-document changes (email history, reminders sent) to the workspace and flat copies. */
async function patchDocuments(uid: string, patches: Map<string, (doc: any) => Record<string, any>>) {
  if (patches.size === 0) return;
  const db = getAdminDb();
  const wsRef = db.collection("consultants").doc(uid);
  await db.runTransaction(async tx => {
    const flatRefs = [...patches.keys()].map(id => db.collection("documents").doc(flatDocumentId(uid, id)));
    const [snap, ...flatSnaps] = await Promise.all([tx.get(wsRef), ...flatRefs.map(ref => tx.get(ref))]);
    if (!snap.exists) return;
    const flatExists = new Set(flatSnaps.filter(f => f.exists).map(f => f.id));
    const now = new Date().toISOString();
    const raw = snap.data() as any;
    const flatChanges: [string, Record<string, any>][] = [];
    const documents = (raw.documents || []).map((d: any) => {
      const patch = d && patches.get(d.id);
      if (!patch) return d;
      const changes = { ...patch(d), updatedAt: now };
      flatChanges.push([d.id, changes]);
      return { ...d, ...changes };
    });
    tx.update(wsRef, sanitizeForFirestore({ documents, updatedAt: now }));
    for (const [id, changes] of flatChanges) {
      // Only update online copies that exist; the app writes the full copy on its next save.
      const ref = db.collection("documents").doc(flatDocumentId(uid, id));
      if (flatExists.has(ref.id)) tx.update(ref, sanitizeForFirestore(changes));
    }
  });
}

async function sendReminder(plan: PlannedReminder, consultantEmail: string, ccMe: boolean) {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) return { success: false, error: "SendGrid isn't configured." };
  const msg = reminderMessage(plan);
  const business = plan.business;
  const token = /^[A-Za-z0-9_-]{16,64}$/.test(plan.document.shareToken || "") ? plan.document.shareToken : "";
  const { html, text } = render({
    subject: msg.subject,
    heading: msg.heading,
    lines: msg.lines,
    actionLabel: "View invoice and payment details",
    actionPath: token ? `/?doc=${encodeURIComponent(token)}` : "/",
    footer: `Sent by ${business?.name || "your supplier"} using Frilensa. Reply to this email to contact them.`
  });
  const replyTo = isEmail(business?.email) ? business!.email : isEmail(consultantEmail) ? consultantEmail : undefined;
  return sendViaSendGrid({
    apiKey,
    fromEmail: process.env.SENDGRID_FROM_EMAIL?.trim() || "invoices@frilensa.com",
    fromName: business?.name || process.env.SENDGRID_FROM_NAME?.trim() || "Frilensa Invoicing",
    toEmail: plan.client.email.trim(),
    toName: plan.client.name,
    replyToEmail: replyTo,
    replyToName: business?.name,
    ccEmail: ccMe && isEmail(consultantEmail) ? consultantEmail : undefined,
    subject: msg.subject.slice(0, 200),
    htmlContent: html,
    textContent: text
  });
}

/** Runs the daily automation for one consultant and records the outcome. */
export async function runAutomationFor(uid: string, trigger: AutomationResult["trigger"], today = todayIn()): Promise<AutomationResult> {
  const result: AutomationResult = { ranAt: new Date().toISOString(), trigger, today, invoicesCreated: [], remindersSent: [], problems: [] };
  const db = getAdminDb();
  try {
    const { raw, created } = await generateRetainerInvoices(uid, today);
    if (!raw) {
      result.problems.push("No workspace found.");
      return result;
    }
    const data = toData(raw);
    const settings = data.userProfile.automation || {};
    const consultantEmail = raw.consultantEmail || data.userProfile.email || "";
    const canEmail = sendgridConfigured();
    if (!canEmail && (settings.emailRetainerInvoices || settings.overdueReminders)) {
      result.problems.push("Emails are switched on but email delivery (SendGrid) isn't set up on the server, so nothing was emailed.");
    }

    const patches = new Map<string, (doc: any) => Record<string, any>>();

    for (const invoice of created) {
      const entry: AutomationResult["invoicesCreated"][number] = { id: invoice.id, documentNumber: invoice.documentNumber, total: invoice.total, currency: invoice.currency || "FJD" };
      result.invoicesCreated.push(entry);
      if (!settings.emailRetainerInvoices || !canEmail || invoice.status !== "sent") continue;
      const client = data.clients.find(c => c.id === invoice.clientId);
      const business = data.businesses.find(b => b.id === invoice.businessId);
      if (!client || !isEmail(client.email) || !business) {
        result.problems.push(`Invoice ${invoice.documentNumber} was created but not emailed: the client has no valid email address.`);
        continue;
      }
      const sent = await sendDocumentEmail({ document: invoice, business, client, userProfile: data.userProfile, recipientEmail: client.email.trim(), consultantEmail });
      if (!sent.ok) {
        result.problems.push(`Invoice ${invoice.documentNumber} was created but not emailed: ${sent.error}`);
        continue;
      }
      entry.emailedTo = client.email.trim();
      patches.set(invoice.id, d => ({
        emailHistory: [...(d.emailHistory || []), { sentAt: sent.timestamp, recipientEmail: entry.emailedTo, provider: "sendgrid", subject: sent.subject, status: "sent", messageId: sent.messageId }]
      }));
    }

    if (settings.overdueReminders && canEmail) {
      const plans = planReminders(data, today).slice(0, MAX_REMINDERS_PER_RUN);
      for (const plan of plans) {
        const sent = await sendReminder(plan, consultantEmail, Boolean(settings.ccMeOnReminders));
        if (!sent.success) {
          result.problems.push(`Reminder for ${plan.document.documentNumber} could not be sent: ${sent.error}`);
          continue;
        }
        const to = plan.client.email.trim();
        const sentAt = new Date().toISOString();
        result.remindersSent.push({ documentNumber: plan.document.documentNumber, level: plan.stage.level, to });
        const previous = patches.get(plan.document.id);
        patches.set(plan.document.id, d => ({
          ...(previous ? previous(d) : {}),
          remindersSent: [...(d.remindersSent || []), { level: plan.stage.level, sentAt, to }]
        }));
      }
    }

    await patchDocuments(uid, patches);
  } catch (err: any) {
    console.error(`[jobs] Automation failed for ${uid}:`, err?.message || err);
    result.problems.push("Something went wrong during the run. It will try again tomorrow.");
  }
  await db.collection(RUNS).doc(uid).set(sanitizeForFirestore({ lastRun: result, updatedAt: result.ranAt }), { merge: true })
    .catch(err => console.warn(`[jobs] Could not record run for ${uid}:`, err?.message || err));
  return result;
}

/** Runs automation for every workspace that has something to do. */
export async function runDailyAutomation(today = todayIn()) {
  const db = getAdminDb();
  const snap = await db.collection("consultants").select("userProfile", "recurringInvoices").get();
  const summary = { workspaces: 0, invoicesCreated: 0, remindersSent: 0, problems: 0 };
  for (const docSnap of snap.docs) {
    // Workspaces keyed by email are copies left by older versions; the live one is keyed by uid.
    if (docSnap.id.includes("@") || !needsRun(docSnap.data())) continue;
    const result = await runAutomationFor(docSnap.id, "schedule", today);
    summary.workspaces++;
    summary.invoicesCreated += result.invoicesCreated.length;
    summary.remindersSent += result.remindersSent.length;
    summary.problems += result.problems.length;
  }
  return summary;
}

function secretMatches(given: unknown): boolean {
  const expected = process.env.JOBS_SECRET || "";
  if (!expected || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** POST /api/jobs/daily, called by Cloud Scheduler with the X-Job-Secret header. */
export function createJobsRouter() {
  const router = express.Router();
  router.post("/daily", rateLimit({ name: "jobs", max: 10, windowMs: 60 * 60_000, key: r => r.ip || "anon" }), async (req, res: Response) => {
    if (!process.env.JOBS_SECRET) return res.status(503).json({ error: "Scheduled jobs aren't configured (JOBS_SECRET is not set)." });
    if (!secretMatches(req.headers["x-job-secret"])) return res.status(401).json({ error: "Not allowed." });
    try {
      const summary = await runDailyAutomation();
      console.log("[jobs] Daily automation finished:", JSON.stringify(summary));
      res.json({ ok: true, ...summary });
    } catch (err: any) {
      console.error("[jobs] Daily automation failed:", err?.message || err);
      res.status(500).json({ error: "Daily automation failed." });
    }
  });
  return router;
}

/** GET /api/automation/status and POST /api/automation/run-now for the signed-in consultant. */
export function createAutomationRouter() {
  const router = express.Router();
  router.use(requireUser, rateLimit({ name: "automation", max: 60, windowMs: 60 * 60_000 }));

  router.get("/status", async (req: AuthedRequest, res, next) => {
    try {
      const snap = await getAdminDb().collection(RUNS).doc(req.user!.uid).get();
      res.json({
        lastRun: snap.exists ? snap.data()?.lastRun || null : null,
        emailConfigured: sendgridConfigured(),
        scheduleConfigured: Boolean(process.env.JOBS_SECRET)
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/run-now", rateLimit({ name: "automation-run", max: 6, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res, next) => {
    try {
      const result = await runAutomationFor(req.user!.uid, "manual");
      res.json({ lastRun: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
