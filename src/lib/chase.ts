import type { CRMData, CRMDocument } from '../types';
import { balanceDue } from './reminders';
import { documentPublicUrl } from './documentLinks';

// "Who owes me" on the home screen: invoices sent and not yet paid, with one-tap WhatsApp and SMS
// reminders. The message opens in the user's own WhatsApp or messages app; nothing is sent by Frilensa.

export interface OwedInvoice {
  doc: CRMDocument;
  clientName: string;
  /** Who to greet: the client's contact person, or the client. */
  greetName: string;
  phone: string;
  balance: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
}

const day = (s?: string) => (s || '').slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Invoices the active business is owed, most overdue first. */
export function owedInvoices(data: CRMData, today: string, businessId = data.activeBusinessId): OwedInvoice[] {
  const home = data.userProfile?.defaultCurrency || 'FJD';
  return (data.documents || [])
    .filter(d => d?.type === 'invoice' && (d.status === 'sent' || d.status === 'partial') && (!businessId || d.businessId === businessId) && balanceDue(d) > 0)
    .map(d => {
      const client = data.clients.find(c => c.id === d.clientId);
      const due = day(d.dueDate) || day(d.issueDate);
      const contact = client?.contactPerson || client?.contactName || '';
      return { doc: d, clientName: client?.name || 'Client', greetName: (contact || client?.name || '').trim(), phone: client?.phone || '', balance: balanceDue(d), currency: d.currency || home, dueDate: due, daysOverdue: Math.max(0, daysBetween(due, today)) };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate));
}

/** Digits for a phone number, with Fiji's +679 added to a 7-digit local number. Empty when it can't be used. */
export function phoneDigits(raw: string, countryCode = '679') {
  const digits = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (digits.length === 7) return `${countryCode}${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A short, friendly reminder for a messaging app. */
export function chaseMessage(o: OwedInvoice, businessName: string, today: string) {
  const when = o.dueDate < today ? `was due on ${o.dueDate}` : `is due on ${o.dueDate}`;
  const link = documentPublicUrl(o.doc);
  const lines = [
    `Bula${o.greetName ? ` ${o.greetName}` : ''},`,
    '',
    `A friendly reminder from ${businessName}: invoice ${o.doc.documentNumber} has ${o.currency} ${money(o.balance)} outstanding and ${when}.`
  ];
  if (link) lines.push(`You can view it and pay here: ${link}`);
  lines.push('', 'Please pay when you can. Vinaka!');
  return lines.join('\n');
}

/** WhatsApp with the message ready; without a number, WhatsApp asks who to send it to. */
export const whatsappLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
/** The phone's messages app with the message ready. */
export const smsLink = (phone: string, text: string) => `sms:${phone ? `+${phone}` : ''}?&body=${encodeURIComponent(text)}`;
