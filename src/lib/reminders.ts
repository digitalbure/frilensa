import type { Business, Client, CRMData, CRMDocument } from '../types';
import { daysBetween } from './retainers';

// Overdue invoice reminders, shared by the daily server job and the app (for previews and status).

export interface ReminderStage {
  level: 1 | 2 | 3;
  daysOverdue: number;
  tone: 'gentle' | 'firm' | 'final';
}

export const REMINDER_STAGES: ReminderStage[] = [
  { level: 1, daysOverdue: 3, tone: 'gentle' },
  { level: 2, daysOverdue: 10, tone: 'firm' },
  { level: 3, daysOverdue: 21, tone: 'final' }
];

/** Invoices this old are left alone; chasing them is a conversation, not an automatic email. */
export const MAX_DAYS_OVERDUE = 120;

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export interface PlannedReminder {
  document: CRMDocument;
  client: Client;
  business: Business | undefined;
  stage: ReminderStage;
  daysOverdue: number;
  balance: number;
}

export function balanceDue(doc: CRMDocument): number {
  return Math.max(0, Number(((doc.total || 0) - (doc.partiallyPaidAmount || 0)).toFixed(2)));
}

/**
 * Which overdue invoices should get a reminder today. Each invoice gets at most one reminder per
 * stage, and only the latest stage it has reached (an invoice found 25 days late gets the final
 * reminder, not all three at once).
 */
export function planReminders(data: CRMData, today: string): PlannedReminder[] {
  const plans: PlannedReminder[] = [];
  for (const doc of data.documents || []) {
    if (doc.type !== 'invoice') continue;
    if (doc.status !== 'sent' && doc.status !== 'partial') continue;
    if (!doc.dueDate) continue;
    // The client says they've paid and it's waiting for confirmation.
    if (doc.clientPaymentReport && (doc.clientPaymentReport.status ?? 'pending') === 'pending') continue;
    const daysOverdue = daysBetween(doc.dueDate.slice(0, 10), today);
    if (daysOverdue < REMINDER_STAGES[0].daysOverdue || daysOverdue > MAX_DAYS_OVERDUE) continue;
    const balance = balanceDue(doc);
    if (balance <= 0) continue;

    const stage = [...REMINDER_STAGES].reverse().find(s => daysOverdue >= s.daysOverdue)!;
    const highestSent = Math.max(0, ...(doc.remindersSent || []).map(r => r.level));
    if (highestSent >= stage.level) continue;

    const client = data.clients.find(c => c.id === doc.clientId);
    if (!client?.email || !EMAIL_RE.test(client.email.trim())) continue;

    plans.push({
      document: doc,
      client,
      business: data.businesses.find(b => b.id === doc.businessId),
      stage,
      daysOverdue,
      balance
    });
  }
  return plans;
}

function money(currency: string, value: number) {
  return `${currency} $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Subject and plain-text paragraphs for a reminder email (escaped when rendered). */
export function reminderMessage(plan: PlannedReminder): { subject: string; heading: string; lines: string[] } {
  const d = plan.document;
  const biz = plan.business?.name || 'us';
  const amount = money(d.currency || 'FJD', plan.balance);
  const greeting = `Bula ${plan.client.name || ''},`.replace(' ,', ',');
  switch (plan.stage.tone) {
    case 'gentle':
      return {
        subject: `Friendly reminder: invoice ${d.documentNumber} is now due`,
        heading: `Invoice ${d.documentNumber} is overdue`,
        lines: [
          greeting,
          `Just a friendly reminder that invoice ${d.documentNumber} for ${amount} was due on ${d.dueDate}.`,
          'If you have already paid, thank you, and please ignore this email or let us know the payment reference.',
          `Vinaka, ${biz}`
        ]
      };
    case 'firm':
      return {
        subject: `Second reminder: invoice ${d.documentNumber} is ${plan.daysOverdue} days overdue`,
        heading: `Invoice ${d.documentNumber} is ${plan.daysOverdue} days overdue`,
        lines: [
          greeting,
          `Our records show invoice ${d.documentNumber} for ${amount} is still unpaid. It was due on ${d.dueDate}.`,
          'Please arrange payment as soon as possible, or reply to let us know when to expect it.',
          `Vinaka, ${biz}`
        ]
      };
    default:
      return {
        subject: `Final reminder: invoice ${d.documentNumber} is ${plan.daysOverdue} days overdue`,
        heading: `Final reminder for invoice ${d.documentNumber}`,
        lines: [
          greeting,
          `Invoice ${d.documentNumber} for ${amount} is now ${plan.daysOverdue} days past its due date of ${d.dueDate}.`,
          'Please pay the balance now, or contact us today to agree a payment plan.',
          `Vinaka, ${biz}`
        ]
      };
  }
}
