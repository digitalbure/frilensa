// Unit tests for "who owes you" and WhatsApp/SMS reminders. Run: npm run test:unit
import assert from "node:assert/strict";
import { chaseMessage, owedInvoices, phoneDigits, smsLink, whatsappLink } from "../src/lib/chase";

const inv = (id: string, extra: any) => ({ id, type: "invoice", documentNumber: id.toUpperCase(), businessId: "b1", clientId: "c1", currency: "FJD", issueDate: "2026-10-01", dueDate: "2026-10-31", items: [], total: 1125, status: "sent", shareToken: "TOKEN_aaaaaaaaaaaaaaaa", ...extra });
const data: any = {
  userProfile: { defaultCurrency: "FJD" }, activeBusinessId: "b1", businesses: [{ id: "b1", name: "Reef Films" }],
  clients: [{ id: "c1", name: "Big Pictures Ltd", contactPerson: "Mere", phone: "670 4455" }, { id: "c2", name: "Bula Tours", phone: "" }],
  documents: [
    inv("a", {}),
    inv("b", { dueDate: "2026-11-20", clientId: "c2" }),
    inv("c", { status: "partial", partiallyPaidAmount: 125, dueDate: "2026-09-30" }),
    inv("paid", { status: "paid" }), inv("draft", { status: "draft" }), inv("quote", { type: "quote" }),
    inv("other", { businessId: "b2" })
  ]
};
const owed = owedInvoices(data, "2026-11-15");
assert.deepEqual(owed.map(o => o.doc.id), ["c", "a", "b"], "most overdue first; paid, drafts, quotes and other businesses left out");
assert.equal(owed[0].balance, 1000, "part payments taken off");
assert.equal(owed[0].daysOverdue, 46); assert.equal(owed[2].daysOverdue, 0);
assert.equal(owed[1].greetName, "Mere", "greets the contact person"); assert.equal(owed[2].greetName, "Bula Tours");

// Phone numbers
assert.equal(phoneDigits("670 4455"), "6796704455", "Fiji local number");
assert.equal(phoneDigits("+679 999 1122"), "6799991122");
assert.equal(phoneDigits("0061 412 345 678"), "61412345678");
assert.equal(phoneDigits("12"), "");

// Message and links
const msg = chaseMessage(owed[1], "Reef Films", "2026-11-15");
assert.match(msg, /^Bula Mere,/);
assert.match(msg, /reminder from Reef Films: invoice A has FJD 1,125.00 outstanding and was due on 2026-10-31\./);
assert.match(msg, /\/\?doc=TOKEN_aaaaaaaaaaaaaaaa/);
assert.match(chaseMessage(owed[2], "Reef Films", "2026-11-15"), /is due on 2026-11-20/);
assert.equal(whatsappLink("6796704455", "Hi there"), "https://wa.me/6796704455?text=Hi%20there");
assert.equal(whatsappLink("", "Hi"), "https://wa.me/?text=Hi", "no number: WhatsApp asks who");
assert.equal(smsLink("6796704455", "Hi"), "sms:+6796704455?&body=Hi");
assert.equal(smsLink("", "Hi"), "sms:?&body=Hi");

console.log("chase checks passed");
