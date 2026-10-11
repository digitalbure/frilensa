import { generateDocumentEmailHtml, sendViaSendGrid, type SendDocumentEmailPayload } from "../src/lib/transactionalEmailServer";
import { escapeHtml, isEmail } from "./security";

// Sends a quote, invoice or receipt to a client. Used by POST /api/email/send-document and the daily job.

export interface DocumentEmailResult {
  ok: boolean;
  status?: number;   // HTTP status for a failure
  error?: string;
  messageId?: string;
  subject?: string;
  html?: string;
  timestamp?: string;
}

export function sendgridConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY?.trim());
}

export async function sendDocumentEmail(payload: SendDocumentEmailPayload): Promise<DocumentEmailResult> {
  const { document, business, client, recipientEmail, ccConsultant, consultantEmail, attachPdfBase64, pdfFilename } = payload;
  if (!document || !business || !isEmail(recipientEmail)) {
    return { ok: false, status: 400, error: "Enter a valid recipient email address and try again." };
  }
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, error: "Email delivery isn't set up yet. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to the server environment, or download the PDF and send it yourself." };
  }

  // HTML is rendered from an escaped copy so user-entered text can't inject markup.
  const { subject, text } = generateDocumentEmailHtml(payload);
  const escapeDeep = (v: any): any => typeof v === "string" ? escapeHtml(v)
    : Array.isArray(v) ? v.map(escapeDeep)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escapeDeep(x)]))
    : v;
  const { attachPdfBase64: _pdf, ...htmlFields } = payload as any;
  const { html } = generateDocumentEmailHtml({ ...escapeDeep(htmlFields), onlinePortalUrl: undefined } as SendDocumentEmailPayload);

  console.log(`[SendGrid] Dispatching ${document.type} #${document.documentNumber} to ${recipientEmail}...`);
  const result = await sendViaSendGrid({
    apiKey,
    // The From address must be a SendGrid-verified sender; replies go to the business.
    fromEmail: process.env.SENDGRID_FROM_EMAIL?.trim() || "invoices@frilensa.com",
    fromName: process.env.SENDGRID_FROM_NAME?.trim() || business.name || "Frilensa Invoicing",
    toEmail: recipientEmail,
    toName: client?.name,
    replyToEmail: isEmail(consultantEmail) ? consultantEmail : (isEmail(business.email) ? business.email : undefined),
    replyToName: business.name,
    ccEmail: ccConsultant && isEmail(consultantEmail) ? consultantEmail : undefined,
    subject,
    htmlContent: html,
    textContent: text,
    pdfAttachmentBase64: attachPdfBase64,
    pdfFilename: pdfFilename || `${document.type}-${document.documentNumber}.pdf`
  });
  if (!result.success) {
    console.warn(`[SendGrid] Dispatch failed: ${result.error}`);
    return { ok: false, status: 502, error: `Couldn't send the email: ${result.error}` };
  }
  return { ok: true, messageId: result.messageId || `msg-${Date.now()}`, subject, html, timestamp: new Date().toISOString() };
}
