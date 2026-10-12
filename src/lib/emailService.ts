import { CRMDocument, Business, Client, UserProfile } from '../types';
import { getDocumentPdfBase64, preloadPdfLogo, PdfExportOptions } from './pdfGenerator';

export interface SendDocumentEmailOptions {
  document: CRMDocument;
  business: Business;
  client?: Client | null;
  userProfile?: UserProfile | null;
  recipientEmail: string;
  customSubject?: string;
  customMessage?: string;
  ccConsultant?: boolean;
  consultantEmail?: string;
  attachPdf?: boolean;
  pdfExportOptions?: PdfExportOptions;
}

export interface EmailServiceConfig {
  sendgridConfigured: boolean;
  sendgridFromEmail: string | null;
  sendgridFromName: string | null;
  firebaseExtensionReady: boolean;
  supportedProviders: Array<{
    id: string;
    name: string;
    active: boolean;
    description: string;
  }>;
}

export interface EmailSendResult {
  success: boolean;
  provider: 'sendgrid' | 'firebase_extension' | 'simulated';
  messageId?: string;
  recipient: string;
  subject: string;
  timestamp: string;
  deliveryNote?: string;
  previewHtml?: string;
  message: string;
  error?: string;
  updatedDocument?: CRMDocument;
}

/**
 * Fetch current status of transactional email providers (SendGrid & Firebase Extension)
 */
export async function getEmailServiceConfig(): Promise<EmailServiceConfig> {
  try {
    const res = await fetch('/api/email/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to query email service config from server:', err);
  }

  return {
    sendgridConfigured: false,
    sendgridFromEmail: null,
    sendgridFromName: null,
    firebaseExtensionReady: false,
    supportedProviders: [
      {
        id: 'sendgrid',
        name: 'Twilio SendGrid API',
        active: false,
        description: 'Needs SENDGRID_API_KEY in the server environment'
      },
      {
        id: 'firebase_extension',
        name: 'Email extension',
        active: false,
        description: 'Not used'
      },
      {
        id: 'preview_mode',
        name: 'Preview only',
        active: true,
        description: 'Emails are not sent until SendGrid is set up'
      }
    ]
  };
}

/**
 * Send an official transactional invoice, receipt, quote, or credit note to a client
 */
export async function sendDocumentEmail(options: SendDocumentEmailOptions): Promise<EmailSendResult> {
  const {
    document,
    business,
    client,
    userProfile,
    recipientEmail,
    customSubject,
    customMessage,
    ccConsultant = true,
    consultantEmail,
    attachPdf = true,
    pdfExportOptions = {}
  } = options;

  let attachPdfBase64 = '';
  let pdfFilename = '';

  if (attachPdf) {
    try {
      await preloadPdfLogo(business?.logoUrl);
      const pdfData = getDocumentPdfBase64(document, business, client, userProfile, pdfExportOptions);
      attachPdfBase64 = pdfData.base64;
      pdfFilename = pdfData.filename;
    } catch (err) {
      console.warn('Error generating PDF attachment for transactional email:', err);
    }
  }

  // 1. Dispatch via backend endpoint (handles SendGrid REST API & fallback)
  let serverResult: any = null;
  try {
    const response = await fetch('/api/email/send-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        document,
        business,
        client,
        userProfile,
        recipientEmail,
        customSubject,
        customMessage,
        ccConsultant,
        consultantEmail,
        attachPdfBase64,
        pdfFilename
      })
    });

    serverResult = await response.json();
    if (!response.ok) {
      throw new Error(serverResult?.error || `Couldn't send this document (error ${response.status}). Please try again.`);
    }
  } catch (err: any) {
    console.error('Email send server request error:', err);
    throw err;
  }

  const timestamp = serverResult.timestamp || new Date().toISOString();
  const provider = serverResult.provider || 'simulated';
  const messageId = serverResult.messageId || `msg-${Date.now()}`;
  const subject = serverResult.subject || `Document #${document.documentNumber} from ${business.name}`;

  // 4. Construct updated CRMDocument with audit trail
  const newEmailHistoryEntry = {
    sentAt: timestamp,
    recipientEmail,
    provider: provider as 'sendgrid' | 'firebase_extension' | 'simulated',
    subject,
    status: 'sent' as const,
    messageId
  };

  const updatedDoc: CRMDocument = {
    ...document,
    status: document.status === 'draft' ? 'sent' : document.status,
    lastSentAt: timestamp,
    sentToEmail: recipientEmail,
    sentCount: (document.sentCount || 0) + 1,
    emailHistory: [...(document.emailHistory || []), newEmailHistoryEntry],
    updatedAt: timestamp
  };

  // The caller saves updatedDocument through the normal workspace sync.
  return {
    success: true,
    provider,
    messageId,
    recipient: recipientEmail,
    subject,
    timestamp,
    deliveryNote: serverResult.deliveryNote,
    previewHtml: serverResult.previewHtml,
    message: serverResult.message || `Document sent to ${recipientEmail}`,
    updatedDocument: updatedDoc
  };
}

/**
 * Send a verification test email
 */
export async function sendTestEmail(recipientEmail: string, businessName?: string): Promise<{ success: boolean; message: string; provider?: string; error?: string }> {
  try {
    const res = await fetch('/api/email/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipientEmail, businessName })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Couldn't send the test email.");
    }
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Couldn't send the test email. Check your connection and try again."
    };
  }
}
