// Unit tests for retainer scheduling and overdue reminders. Run: npm run test:unit
import assert from "node:assert/strict";
import { isRetainerDue, runDueRetainers, retainerInvoiceId, retainerVatRate, addDays, todayIn } from "../src/lib/retainers";
import { planReminders, reminderMessage } from "../src/lib/reminders";

assert.equal(todayIn("Pacific/Fiji", new Date("2026-10-10T13:00:00Z")), "2026-10-11", "Fiji is ahead of UTC");
assert.equal(addDays("2026-12-25", 14), "2027-01-08");

const ret: any = { id: "r1", clientId: "c1", businessId: "b1", amount: 1000, billingDay: 5, status: "active", autoGenerate: true, startDate: "2026-01-01", interval: "monthly", items: [] };
assert.equal(isRetainerDue(ret, "2026-10-04"), false, "before the billing day");
assert.equal(isRetainerDue(ret, "2026-10-05"), true);
assert.equal(isRetainerDue({ ...ret, lastGeneratedDate: "2026-10-05" }, "2026-10-20"), false, "already billed this month");
assert.equal(isRetainerDue({ ...ret, lastGeneratedDate: "2026-09-05" }, "2026-10-06"), true);
assert.equal(isRetainerDue({ ...ret, status: "paused" }, "2026-10-06"), false);
assert.equal(isRetainerDue({ ...ret, startDate: "2026-11-01" }, "2026-10-06"), false);
assert.equal(isRetainerDue({ ...ret, endDate: "2026-09-30" }, "2026-10-06"), false);
assert.equal(isRetainerDue({ ...ret, interval: "bi-weekly", lastGeneratedDate: "2026-10-01" }, "2026-10-14"), false);
assert.equal(isRetainerDue({ ...ret, interval: "bi-weekly", lastGeneratedDate: "2026-10-01" }, "2026-10-15"), true);

const data: any = {
  userProfile: { defaultCurrency: "FJD", defaultVatRate: 12.5 },
  businesses: [{ id: "b1", name: "Viti Studio", invoicePrefix: "INV", invoiceStartNumber: 1000 }],
  activeBusinessId: "b1",
  clients: [{ id: "c1", name: "Coral Resort", email: "accounts@coral.fj" }, { id: "c2", name: "No Email", email: "" }],
  documents: [], recurringInvoices: [ret, { ...ret, id: "r2", autoGenerate: false }]
};
const first = runDueRetainers(data, "2026-10-05");
assert.equal(first.created.length, 1, "only auto-generate retainers in background runs");
const inv = first.created[0];
assert.equal(inv.id, retainerInvoiceId(ret, "2026-10-05"));
assert.equal(inv.total, 1125, "12.5% VAT");
assert.equal(inv.dueDate, "2026-10-19", "14-day terms by default");
assert.equal(inv.status, "sent");
assert.ok(inv.shareToken && /^[A-Za-z0-9_-]{16,64}$/.test(inv.shareToken));
assert.equal(inv.updatedAt, undefined, "a saved copy of the same invoice always wins the merge");
assert.equal(first.data.recurringInvoices.find((r: any) => r.id === "r1").lastGeneratedDate, "2026-10-05");
const again = runDueRetainers(first.data, "2026-10-05");
assert.equal(again.created.length, 0, "running twice creates nothing");
// Even if the "last generated" marker was lost, the same period never gets a second invoice.
const lostMarker = { ...first.data, recurringInvoices: data.recurringInvoices };
const third = runDueRetainers(lostMarker, "2026-10-09");
assert.equal(third.created.length, 0);
assert.equal(third.data.documents.length, 1);
assert.equal(runDueRetainers(data, "2026-10-05", { onlyAutoGenerate: false }).created.length, 2);
assert.equal(retainerVatRate({ userProfile: { enableTax: false, defaultVatRate: 12.5 } } as any), 0);
assert.equal(retainerVatRate({ userProfile: {} } as any), 12.5);

const overdue = (id: string, dueDate: string, extra: any = {}) => ({ id, type: "invoice", documentNumber: `INV-${id}`, businessId: "b1", clientId: "c1", issueDate: "2026-09-01", dueDate, items: [], subtotal: 100, vatRate: 0, vatAmount: 0, total: 100, status: "sent", ...extra });
const today = "2026-10-30";
const rdata: any = { ...data, documents: [
  overdue("a", "2026-10-28"),                                                     // 2 days: too early
  overdue("b", "2026-10-27"),                                                     // 3 days: gentle
  overdue("c", "2026-10-15"),                                                     // 15 days: firm
  overdue("d", "2026-10-01"),                                                     // 29 days: final only
  overdue("e", "2026-10-15", { remindersSent: [{ level: 2, sentAt: "x", to: "y" }] }), // firm already sent
  overdue("f", "2026-10-15", { clientPaymentReport: { status: "pending" } }),     // client says paid
  overdue("g", "2026-10-15", { status: "paid" }),
  overdue("h", "2026-10-15", { clientId: "c2" }),                                 // no email
  overdue("i", "2026-10-15", { status: "partial", partiallyPaidAmount: 100 }),     // nothing left to pay
  overdue("j", "2026-05-01"),                                                     // over 120 days
  overdue("k", "2026-10-15", { clientPaymentReport: { status: "rejected" } })      // rejected report: chase
] };
const plans = planReminders(rdata, today);
assert.deepEqual(plans.map(p => [p.document.id, p.stage.level]), [["b", 1], ["c", 2], ["d", 3], ["k", 2]]);
const msg = reminderMessage(plans[2]);
assert.match(msg.subject, /Final reminder/);
assert.match(msg.lines.join(" "), /FJD \$100\.00/);
console.log("automation checks passed");
