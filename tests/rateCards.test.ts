// Unit tests for default terms and quotes from rate card requests. Run: npm run test:unit
import assert from "node:assert/strict";
import { documentDefaults, DEFAULT_INVOICE_TERMS, DEFAULT_QUOTE_TERMS } from "../src/lib/documentTerms";
import { draftQuoteFromRequest } from "../src/lib/quoteRequests";

assert.deepEqual(documentDefaults({}, "invoice", "2026-10-11"), { notes: DEFAULT_INVOICE_TERMS, dueDate: "2026-10-25" });
assert.deepEqual(documentDefaults(null, "quote", "2026-10-11"), { notes: DEFAULT_QUOTE_TERMS(30), dueDate: "2026-11-10" });
assert.deepEqual(documentDefaults({ paymentTermsDays: 0, invoiceTerms: "Due on receipt." }, "invoice", "2026-10-11"), { notes: "Due on receipt.", dueDate: "2026-10-11" }, "0 days is allowed");
assert.deepEqual(documentDefaults({ quoteValidDays: 7, quoteTerms: "  50% deposit.  " }, "quote", "2026-12-28"), { notes: "50% deposit.", dueDate: "2027-01-04" });

const data: any = {
  userProfile: { defaultCurrency: "FJD", defaultVatRate: 12.5 },
  businesses: [{ id: "b1", name: "Studio", quotePrefix: "QT", quoteStartNumber: 1000, quoteTerms: "Deposit first.", quoteValidDays: 14 }],
  activeBusinessId: "b1",
  clients: [{ id: "c1", name: "Existing", email: "Dee@Client.fj", phone: "", address: "" }],
  documents: [], services: [], activityLogs: []
};
const req: any = {
  id: "r1", ref: "QR-ABC123", businessId: "b1", businessName: "Studio", name: "Dee", email: "dee@client.fj", phone: "", company: "",
  message: "Family shoot", items: [{ serviceId: "s1", name: "Portrait", unit: "Hour", rate: 150, quantity: 2 }], currency: "FJD", estimate: 300, createdAt: ""
};
const now = new Date("2026-10-11T03:00:00Z");
const r = draftQuoteFromRequest(data, req, now);
assert.equal(r.newClient, false, "matches the existing client by email, ignoring case");
assert.equal(r.doc.clientId, "c1");
assert.equal(r.doc.status, "draft");
assert.equal(r.doc.type, "quote");
assert.equal(r.doc.subtotal, 300);
assert.equal(r.doc.vatAmount, 37.5);
assert.equal(r.doc.total, 337.5);
assert.equal(r.doc.notes, "Deposit first.");
assert.equal(r.doc.dueDate, "2026-10-25");
assert.equal(r.doc.items[0].itemId, "s1");
assert.ok(!r.doc.notes!.includes("Family shoot"), "the request note stays private");
assert.ok(r.data.activityLogs![0].description.includes("Family shoot"));

const r2 = draftQuoteFromRequest(data, { ...req, email: "new@co.fj", company: "New Co" }, now);
assert.equal(r2.newClient, true);
assert.equal(r2.client.name, "New Co");
assert.equal(r2.client.contactPerson, "Dee");
assert.equal(r2.data.clients.length, 2);

console.log("rate card and terms checks passed");
