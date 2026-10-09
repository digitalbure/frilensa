import { getAuth } from "firebase-admin/auth";
import { getAdminDb, escapeHtml, isEmail } from "./security";
import { sendViaSendGrid } from "../src/lib/transactionalEmailServer";

// Email notifications for things that happen while the consultant isn't looking at the app:
// payments reported, quotes accepted, client messages, directory bookings.
// Best effort: failures are logged and never block the action that triggered them.

const PER_RECIPIENT_PER_HOUR = 20;
const sentLog = new Map<string, number[]>();

function allowSend(key: string): boolean {
  const now = Date.now();
  const recent = (sentLog.get(key) || []).filter(t => now - t < 60 * 60_000);
  if (recent.length >= PER_RECIPIENT_PER_HOUR) return false;
  recent.push(now);
  sentLog.set(key, recent);
  return true;
}

function appUrl(path = "") {
  return `${(process.env.APP_URL || "https://frilensa.com").replace(/\/$/, "")}${path}`;
}

interface Notice {
  subject: string;
  heading: string;
  lines: string[];      // plain text; escaped for HTML here
  actionLabel: string;
  actionPath: string;   // e.g. "/?tab=dashboard"
}

function render(n: Notice) {
  const lines = n.lines.map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#334155">${escapeHtml(l)}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px">
<h1 style="margin:0 0 14px;font-size:18px;color:#0f172a">${escapeHtml(n.heading)}</h1>${lines}
<p style="margin:20px 0 0"><a href="${escapeHtml(appUrl(n.actionPath))}" style="background:#0284c7;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600">${escapeHtml(n.actionLabel)}</a></p>
<p style="margin:22px 0 0;font-size:11px;color:#94a3b8">You can turn these emails off in Frilensa under Settings → Notifications.</p>
</div></body></html>`;
  const text = `${n.heading}\n\n${n.lines.join("\n")}\n\n${n.actionLabel}: ${appUrl(n.actionPath)}`;
  return { html, text };
}

async function deliver(key: string, to: string, n: Notice) {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey || !isEmail(to) || !allowSend(key)) return;
  const { html, text } = render(n);
  const result = await sendViaSendGrid({
    apiKey,
    fromEmail: process.env.SENDGRID_FROM_EMAIL?.trim() || "noreply@frilensa.com",
    fromName: process.env.SENDGRID_FROM_NAME?.trim() || "Frilensa",
    toEmail: to,
    subject: n.subject.slice(0, 200),
    htmlContent: html,
    textContent: text
  });
  if (!result.success) console.warn(`[notify] Email to ${key} failed: ${result.error}`);
}

/** Emails a consultant unless they've turned notifications off. */
export async function notifyConsultant(consultantId: string, notice: Notice) {
  try {
    const snap = await getAdminDb().collection("consultants").doc(consultantId).get();
    const ws = snap.data() || {};
    if (ws.userProfile?.emailNotifications === false) return;
    let to = ws.consultantEmail || ws.userProfile?.email || (isEmail(consultantId) ? consultantId : "");
    if (!to) to = (await getAuth().getUser(consultantId).catch(() => null))?.email || "";
    await deliver(`consultant:${consultantId}`, to, notice);
  } catch (err: any) {
    console.warn("[notify] Could not notify consultant:", err?.message || err);
  }
}

/** Emails any address directly (used for directory booking updates to the requester). */
export async function notifyEmail(to: string, notice: Notice) {
  try {
    await deliver(`email:${String(to).toLowerCase()}`, to, notice);
  } catch (err: any) {
    console.warn("[notify] Could not send email:", err?.message || err);
  }
}

// Fire-and-forget helper so callers never wait on email.
export function later(task: Promise<unknown>) {
  task.catch(() => {});
}
