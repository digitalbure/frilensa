import { CRMDocument, Business, Client, UserProfile } from '../types';

export interface SendDocumentEmailPayload {
  document: CRMDocument;
  business: Business;
  client?: Client | null;
  userProfile?: UserProfile | null;
  recipientEmail: string;
  customSubject?: string;
  customMessage?: string;
  ccConsultant?: boolean;
  consultantEmail?: string;
  attachPdfBase64?: string;
  pdfFilename?: string;
  onlinePortalUrl?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  provider: 'sendgrid' | 'firebase_extension' | 'simulated';
  messageId?: string;
  recipient: string;
  subject: string;
  timestamp: string;
  previewHtml: string;
  message: string;
  error?: string;
}

/**
 * Generates an executive, responsive HTML email template for invoices, receipts, quotes, and credit notes
 */
export function generateDocumentEmailHtml(payload: SendDocumentEmailPayload): { html: string; subject: string; text: string } {
  const { document, business, client, userProfile, recipientEmail, customSubject, customMessage, onlinePortalUrl } = payload;
  
  const docTypeLabel = document.type === 'quote' ? 'Quotation' :
                       document.type === 'receipt' ? 'Official Receipt' :
                       document.type === 'credit_note' ? 'Credit Note' : 'Tax Invoice';

  const docCurrency = document.type ? (document.currency || userProfile?.defaultCurrency || 'FJD') : 'FJD';
  const totalFormatted = `${docCurrency} $${document.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  
  const defaultSubject = document.type === 'receipt'
    ? `Payment Receipt #${document.documentNumber} from ${business.name} (${totalFormatted})`
    : document.type === 'quote'
    ? `Quotation #${document.documentNumber} from ${business.name} (${totalFormatted})`
    : `${docTypeLabel} #${document.documentNumber} from ${business.name} (${totalFormatted})`;

  const subject = customSubject?.trim() || defaultSubject;

  const brandColor = business.colorTheme || '#0284c7'; // Default Pacific sky
  const clientName = client?.name || 'Client';
  const issueDateFormatted = document.issueDate || new Date().toISOString().split('T')[0];
  const dueDateFormatted = document.dueDate || 'On receipt';
  
  // The "view online" link is always built here from the document's share token; a URL supplied
  // by the browser (onlinePortalUrl) is ignored so emails can't be made to link elsewhere.
  void onlinePortalUrl;
  const appUrl = ((typeof process !== 'undefined' && process.env.APP_URL) || 'https://frilensa.com').replace(/\/$/, '');
  const shareToken = /^[A-Za-z0-9_-]{16,64}$/.test(document.shareToken || '') ? document.shareToken : '';
  const portalUrl = shareToken ? `${appUrl}/?doc=${shareToken}` : appUrl;

  const verificationHash = `FRCS-FJ-${document.documentNumber}-${(business.tin || 'TAX').replace(/[^0-9]/g, '').slice(0, 6)}`;

  // Plain-text representation
  const textContent = `
${business.name.toUpperCase()} - ${docTypeLabel.toUpperCase()} #${document.documentNumber}
----------------------------------------------------------------------
Bula ${client?.name || 'there'},

${customMessage ? customMessage + '\n\n' : ''}Here is your ${docTypeLabel} #${document.documentNumber} from ${business.name}.

Summary:
- Document: ${docTypeLabel} #${document.documentNumber}
- Issue date: ${issueDateFormatted}
- Due date: ${dueDateFormatted}
- Total: ${totalFormatted}
- Status: ${document.status.toUpperCase()}

View and pay online:
${portalUrl}

${business.bankDetails ? `Payment details:\n${business.bankDetails}\n` : ''}
${business.tin ? `TIN: ${business.tin}\n` : ''}Reference: ${verificationHash}

Vinaka vaka levu for your business.
${business.name}
----------------------------------------------------------------------
Sent using Frilensa (frilensa.com)
`.trim();

  // HTML Email Template
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f8fafc;
      padding: 32px 12px;
    }
    .card {
      max-width: 620px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 18px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.06), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
      overflow: hidden;
    }
    .header-banner {
      background: linear-gradient(135deg, ${brandColor}, #0f172a);
      color: #ffffff;
      padding: 32px 28px 26px 28px;
    }
    .biz-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 6px 0;
      color: #ffffff;
    }
    .biz-subtitle {
      font-size: 13px;
      color: #e2e8f0;
      margin: 0;
      opacity: 0.95;
    }
    .badge-pill {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #ffffff;
      margin-top: 14px;
    }
    .body-content {
      padding: 32px 28px;
    }
    .greeting {
      font-size: 15px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 12px 0;
    }
    .custom-message-box {
      background-color: #f0fdf4;
      border-left: 4px solid #10b981;
      padding: 14px 18px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 13.5px;
      color: #166534;
      line-height: 1.5;
    }
    .summary-grid {
      display: table;
      width: 100%;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .summary-col {
      display: table-cell;
      width: 50%;
      vertical-align: top;
    }
    .meta-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 3px;
    }
    .meta-value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 10px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table th {
      text-align: left;
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      padding: 10px 12px;
      border-bottom: 2px solid #e2e8f0;
    }
    .items-table td {
      padding: 12px;
      font-size: 13px;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }
    .total-box {
      background-color: #f8fafc;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 26px;
      border: 1px solid #e2e8f0;
    }
    .calc-row {
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
      color: #475569;
      margin-bottom: 6px;
    }
    .calc-row.total {
      border-top: 2px solid #cbd5e1;
      padding-top: 10px;
      margin-top: 8px;
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
    }
    .btn-portal {
      display: block;
      width: 100%;
      text-align: center;
      background-color: ${brandColor};
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
      padding: 14px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
      margin-bottom: 24px;
      box-sizing: border-box;
    }
    .instructions-box {
      background-color: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 14px 18px;
      font-size: 12px;
      color: #334155;
      margin-bottom: 24px;
    }
    .instructions-box h5 {
      margin: 0 0 6px 0;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0f172a;
    }
    .footer-bar {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 20px 28px;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      
      <!-- Top Banner -->
      <div class="header-banner">
        <h1 class="biz-title">${business.name}</h1>
        <p class="biz-subtitle">${business.tagline || ''}</p>
        <div>
          <span class="badge-pill">
            ${docTypeLabel.toUpperCase()} #${document.documentNumber}
          </span>
        </div>
      </div>

      <!-- Main Body -->
      <div class="body-content">
        <div class="greeting">Bula ${client?.name || 'there'},</div>
        <p style="font-size: 13.5px; line-height: 1.6; color: #334155; margin-top: 0;">
          Here are the details of your ${docTypeLabel.toLowerCase()} #${document.documentNumber} from <strong>${business.name}</strong>.
        </p>

        ${customMessage ? `
          <div class="custom-message-box">
            <strong>Note from ${business.name}:</strong><br/>
            ${customMessage.replace(/\n/g, '<br/>')}
          </div>
        ` : ''}

        <!-- Summary Grid -->
        <table class="summary-grid" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="width: 50%; vertical-align: top; padding: 6px;">
              <div class="meta-label">Billed to</div>
              <div class="meta-value">${clientName}</div>
              ${client?.email ? `<div style="font-size: 11px; color: #64748b; margin-top: -6px; margin-bottom: 8px;">${client.email}</div>` : ''}
              ${client?.tin ? `<div style="font-size: 11px; color: #64748b;">TIN: <strong>${client.tin}</strong></div>` : ''}
            </td>
            <td style="width: 50%; vertical-align: top; padding: 6px;">
              <div class="meta-label">Issue date</div>
              <div class="meta-value">${issueDateFormatted}</div>
              
              <div class="meta-label">Due date</div>
              <div class="meta-value">${dueDateFormatted}</div>
            </td>
          </tr>
        </table>

        <!-- Line Items -->
        <table class="items-table" cellpadding="0" cellspacing="0">
          <thead>
            <tr>
              <th style="width: 55%;">Description</th>
              <th style="width: 20%; text-align: right;">Qty &times; rate</th>
              <th style="width: 25%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(document.items || []).map(item => `
              <tr>
                <td>
                  <strong>${item.name}</strong>
                  ${item.kind === 'reimbursement' ? `<div style="font-size: 11px; color: #92400e; margin-top: 2px;">Reimbursable expense${item.taxable ? '' : ', no VAT'}${item.receiptFileId ? ' &middot; receipt online' : ''}</div>` : ''}
                  ${item.description ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${item.description}</div>` : ''}
                </td>
                <td style="text-align: right; color: #64748b; font-family: monospace;">
                  ${item.quantity} &times; $${item.rate.toFixed(2)}
                </td>
                <td style="text-align: right; font-weight: 700; font-family: monospace;">
                  $${item.total.toFixed(2)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Total Calculation -->
        <div class="total-box">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="font-size: 12.5px; color: #475569; padding-bottom: 6px;">Subtotal:</td>
              <td style="text-align: right; font-family: monospace; font-weight: 600; color: #334155;">
                ${docCurrency} $${document.subtotal.toFixed(2)}
              </td>
            </tr>
            
            ${document.appliedTaxes && document.appliedTaxes.length > 0 ? document.appliedTaxes.map(t => `
              <tr>
                <td style="font-size: 12.5px; color: #0284c7; padding-bottom: 6px;">
                  ${t.name} (${t.rateType === 'flat' ? '$' + t.rate : t.rate + '%'}):
                </td>
                <td style="text-align: right; font-family: monospace; font-weight: 600; color: #0284c7;">
                  ${docCurrency} $${t.amount.toFixed(2)}
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td style="font-size: 12.5px; color: #475569; padding-bottom: 6px;">
                  Fiji VAT (${document.vatRate || 12.5}%):
                </td>
                <td style="text-align: right; font-family: monospace; font-weight: 600; color: #334155;">
                  ${docCurrency} $${(document.vatAmount || 0).toFixed(2)}
                </td>
              </tr>
            `}

            <tr>
              <td style="font-size: 15px; font-weight: 900; color: #0f172a; padding-top: 8px; border-top: 2px solid #cbd5e1;">
                Total:
              </td>
              <td style="text-align: right; font-family: monospace; font-size: 16px; font-weight: 900; color: ${brandColor}; padding-top: 8px; border-top: 2px solid #cbd5e1;">
                ${totalFormatted}
              </td>
            </tr>
          </table>
        </div>

        <!-- Call to action button -->
        <a href="${portalUrl}" target="_blank" class="btn-portal">
          View and pay online
        </a>

        <!-- Payment Instructions & Mobile Money -->
        ${business.bankDetails ? `
          <div class="instructions-box">
            <h5>Payment details</h5>
            <p style="margin: 0; white-space: pre-line; font-family: monospace; font-size: 11.5px; color: #1e293b;">
              ${business.bankDetails}
            </p>
          </div>
        ` : ''}

        ${document.notes ? `
          <div style="font-size: 12px; color: #64748b; margin-bottom: 20px; line-height: 1.5;">
            <strong>Notes:</strong> ${document.notes}
          </div>
        ` : ''}
      </div>

      <!-- Footer Bar -->
      <div class="footer-bar">
        <strong>${business.name}</strong> &bull; ${business.address || 'Fiji'}<br/>
        ${business.tin ? `TIN: <strong>${business.tin}</strong> &bull; ` : ''}
        Ref: <span style="font-family: monospace;">${verificationHash}</span><br/>
        Sent using <strong>Frilensa</strong> &bull; <a href="https://frilensa.com" style="color: #0284c7; text-decoration: none;">frilensa.com</a>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();

  return { html, subject, text: textContent };
}

/**
 * Dispatches an email via Twilio SendGrid REST API
 */
export async function sendViaSendGrid(options: {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  toName?: string;
  replyToEmail?: string;
  replyToName?: string;
  ccEmail?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  pdfAttachmentBase64?: string;
  pdfFilename?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const {
    apiKey,
    fromEmail,
    fromName = 'Frilensa Invoicing',
    toEmail,
    toName,
    replyToEmail,
    replyToName,
    ccEmail,
    subject,
    htmlContent,
    textContent,
    pdfAttachmentBase64,
    pdfFilename = 'document.pdf'
  } = options;

  const personalizations: any[] = [
    {
      to: [
        {
          email: toEmail,
          name: toName || undefined
        }
      ]
    }
  ];

  if (ccEmail && ccEmail.includes('@')) {
    personalizations[0].cc = [{ email: ccEmail }];
  }

  const payload: any = {
    personalizations,
    from: {
      email: fromEmail,
      name: fromName
    },
    subject,
    content: [
      {
        type: 'text/plain',
        value: textContent || 'Please find your document attached.'
      },
      {
        type: 'text/html',
        value: htmlContent
      }
    ]
  };

  if (replyToEmail && replyToEmail.includes('@')) {
    payload.reply_to = {
      email: replyToEmail,
      name: replyToName || fromName
    };
  }

  if (pdfAttachmentBase64) {
    // Strip any leading data uri header if present
    const cleanBase64 = pdfAttachmentBase64.includes(',')
      ? pdfAttachmentBase64.split(',')[1]
      : pdfAttachmentBase64;

    payload.attachments = [
      {
        content: cleanBase64,
        filename: pdfFilename,
        type: 'application/pdf',
        disposition: 'attachment'
      }
    ];
  }

  try {
    // SENDGRID_API_URL lets tests point at a local fake; production uses SendGrid.
    const response = await fetch(process.env.SENDGRID_API_URL || 'https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.status >= 200 && response.status < 300) {
      const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;
      return { success: true, messageId };
    }

    const errorBody = await response.text();
    console.error('[SendGrid Error]', response.status, errorBody);
    return {
      success: false,
      error: `SendGrid API returned status ${response.status}: ${errorBody}`
    };
  } catch (err: any) {
    console.error('[SendGrid Network Error]', err);
    return {
      success: false,
      error: err.message || 'Failed to connect to SendGrid API'
    };
  }
}
