import type { CRMData } from '../types';
import type { Journal } from './journal';
import { AGE_BUCKETS, bucketFor, emptyAged, type AgedRow } from './bills';
import { documentPublicUrl } from './documentLinks';

// A customer statement: everything a client was invoiced, credited and paid between two dates, with the
// balance brought forward, a running balance, what's owed by how late, and the invoices still open. It comes
// from the journal's accounts-receivable lines (lib/journal.ts), so it matches "Who owes you" exactly.
// Amounts are in the home currency.

export interface StatementLine { date: string; kind: 'Invoice' | 'Receipt' | 'Credit note' | 'Payment' | 'Adjustment'; reference: string; description: string; charge: number; credit: number; balance: number }
export interface OpenInvoice { docId: string; number: string; issueDate: string; dueDate: string; owing: number; link: string | null }
export interface Statement {
  clientId: string; from: string; to: string;
  opening: number; lines: StatementLine[]; closing: number;
  charges: number; credits: number;
  aged: AgedRow; open: OpenInvoice[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const KIND: Record<string, StatementLine['kind']> = { invoice: 'Invoice', receipt: 'Receipt', credit_note: 'Credit note', payment: 'Payment', adjustment: 'Adjustment' };

export function clientStatement(data: CRMData, j: Journal, clientId: string, from: string, to: string): Statement {
  const docs = new Map(data.documents.filter(d => d.clientId === clientId).map(d => [d.id, d]));
  let opening = 0;
  const lines: StatementLine[] = [];
  const perDoc = new Map<string, number>();
  for (const e of j.entries) {
    if (e.date > to) continue;
    const ar = e.lines.filter(l => l.account === 'ar' && l.docId && docs.has(l.docId));
    if (!ar.length) continue;
    const amount = r2(ar.reduce((s, l) => s + l.debit - l.credit, 0));
    ar.forEach(l => perDoc.set(l.docId!, r2((perDoc.get(l.docId!) || 0) + l.debit - l.credit)));
    if (e.date < from) { opening = r2(opening + amount); continue; }
    if (Math.abs(amount) < 0.005) continue;
    const doc = docs.get(ar[0].docId!);
    const kind = KIND[e.source.kind] || (amount > 0 ? 'Invoice' : 'Payment');
    lines.push({
      date: e.date, kind,
      reference: e.source.reference || doc?.documentNumber || '',
      description: kind === 'Payment' ? (e.description.match(/withheld/i) ? 'Tax withheld by you' : `Payment${doc ? ` for ${doc.documentNumber}` : ''}`)
        : kind === 'Adjustment' ? 'Bank fees or exchange difference' : kind === 'Credit note' ? `Credit${doc ? ` against ${doc.documentNumber}` : ''}` : (doc?.items?.[0]?.name || e.description),
      charge: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, balance: 0
    });
  }
  let running = opening;
  for (const l of lines) { running = r2(running + l.charge - l.credit); l.balance = running; }
  const aged = emptyAged(clientId, data.clients.find(c => c.id === clientId)?.name || '');
  const open: OpenInvoice[] = [];
  for (const [docId, owing] of perDoc) {
    if (owing < 0.005) continue;
    const d = docs.get(docId)!;
    const due = (d.dueDate || d.issueDate || to).slice(0, 10);
    const k = bucketFor(due, to);
    aged[k] = r2(aged[k] + owing); aged.total = r2(aged.total + owing); aged.count++;
    open.push({ docId, number: d.documentNumber, issueDate: (d.issueDate || '').slice(0, 10), dueDate: due, owing, link: documentPublicUrl(d) });
  }
  open.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    clientId, from, to, opening, lines, closing: running,
    charges: r2(lines.reduce((s, l) => s + l.charge, 0)), credits: r2(lines.reduce((s, l) => s + l.credit, 0)),
    aged, open
  };
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A short statement for WhatsApp or SMS. */
export function statementMessage(s: Statement, clientGreeting: string, businessName: string, currency = 'FJD') {
  const lines = [`Bula${clientGreeting ? ` ${clientGreeting}` : ''},`, '', `Your statement from ${businessName} on ${s.to}: ${currency} ${money(s.closing)} ${s.closing >= 0 ? 'owing' : 'in credit'}.`];
  if (s.open.length) {
    lines.push('');
    s.open.forEach(o => lines.push(`- ${o.number}: ${currency} ${money(o.owing)}, due ${o.dueDate}${o.link ? ` ${o.link}` : ''}`));
  }
  lines.push('', 'Vinaka!');
  return lines.join('\n');
}

export { AGE_BUCKETS };
