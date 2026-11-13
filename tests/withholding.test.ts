// Unit tests for provisional tax on contractor payments. Run: npm run test:unit
import assert from "node:assert/strict";
import {
  DEFAULT_WITHHOLDING, cleanWithholding, contractorYear, earlierThisYear, nextCertificateNo, ptDueDate, ptFor, ptMonthSummary, ptSummaryCsv, withheldFromYou, type Contractor
} from "../src/lib/withholding";
import { applyConfirmedPayment } from "../src/lib/payments";
import { cleanPlatformConfig } from "../src/lib/platformConfigShared";

const base: Contractor = { id: "c1", businessId: "b1", name: "Sami Sound", tin: "50-12345-0-1", vatRegistered: false, writtenAgreement: true, createdAt: "" };
const none = { base: 0, notWithheldBase: 0 };

// Settings
assert.deepEqual(cleanWithholding(undefined), DEFAULT_WITHHOLDING);
assert.deepEqual(cleanWithholding({ rate: 99, threshold: -5 }), DEFAULT_WITHHOLDING, "out-of-range values fall back");
assert.deepEqual(cleanWithholding({ rate: 7.5, threshold: 2000 }), { rate: 7.5, threshold: 2000 });
assert.deepEqual(cleanPlatformConfig({}).withholding, DEFAULT_WITHHOLDING, "platform config carries the defaults");

// No written agreement: no PT, whatever the amount.
let d = ptFor({ ...base, writtenAgreement: false }, { date: "2026-11-01", gross: 5000, vat: 0 }, none);
assert.equal(d.applies, false); assert.equal(d.withheld, 0); assert.equal(d.net, 5000);

// Valid certificate of exemption: exempt. Expired: PT applies.
d = ptFor({ ...base, coeNumber: "COE-77", coeExpiry: "2026-12-31", expectedYearly: 9000 }, { date: "2026-11-01", gross: 3000, vat: 0 }, none);
assert.equal(d.applies, false); assert.match(d.reason, /COE-77/);
d = ptFor({ ...base, coeNumber: "COE-77", coeExpiry: "2026-06-30", expectedYearly: 9000 }, { date: "2026-11-01", gross: 3000, vat: 0 }, none);
assert.equal(d.applies, true); assert.equal(d.withheld, 150); assert.match(d.reason, /ran out/);

// Under the threshold with no expectation: none yet.
d = ptFor(base, { date: "2026-03-01", gross: 600, vat: 0 }, none);
assert.equal(d.applies, false);
// Expected yearly total at the threshold: applies from the first payment.
d = ptFor({ ...base, expectedYearly: 1000 }, { date: "2026-03-01", gross: 600, vat: 0 }, none);
assert.equal(d.applies, true); assert.equal(d.withheld, 30); assert.equal(d.net, 570);
// Crossing the threshold: applies to this payment, with the earlier unwithheld part offered as catch-up.
d = ptFor(base, { date: "2026-04-01", gross: 600, vat: 0 }, { base: 600, notWithheldBase: 600 });
assert.equal(d.applies, true); assert.equal(d.withheld, 30); assert.equal(d.catchUpAvailable, 600); assert.ok(d.warning);
d = ptFor(base, { date: "2026-04-01", gross: 600, vat: 0, catchUp: true }, { base: 600, notWithheldBase: 600 });
assert.equal(d.withheld, 60, "5% of this payment and the earlier one");

// VAT-registered contractor: PT on the amount excluding VAT; VAT ignored for those not registered.
d = ptFor({ ...base, vatRegistered: true, expectedYearly: 5000 }, { date: "2026-05-01", gross: 1125, vat: 125 }, none);
assert.equal(d.base, 1000); assert.equal(d.withheld, 50); assert.equal(d.net, 1075);
d = ptFor({ ...base, expectedYearly: 5000 }, { date: "2026-05-01", gross: 1125, vat: 125 }, none);
assert.equal(d.base, 1125, "no VAT taken off when not VAT registered");

// Settings from the platform
d = ptFor({ ...base, expectedYearly: 5000 }, { date: "2026-05-01", gross: 1000, vat: 0 }, none, { rate: 10, threshold: 1000 });
assert.equal(d.withheld, 100);

// Due dates: end of the following month.
assert.equal(ptDueDate("2026-01"), "2026-02-28");
assert.equal(ptDueDate("2028-01"), "2028-02-29");
assert.equal(ptDueDate("2026-12"), "2027-01-31");

// Payments in the books
const cp = (id: string, contractorId: string, name: string, date: string, gross: number, withheld: number, extra: any = {}) => ({
  id, date, vendor: name, description: "", amount: gross, category: "Subcontractors", paymentMethod: "Bank Transfer", businessId: "b1",
  contractorPayment: { contractorId, contractorName: name, tin: "T-" + contractorId, gross, vat: 0, base: gross, rate: 5, withheld, net: gross - withheld, applied: withheld > 0, reason: "", certificateNo: `WHT-${date.slice(0, 4)}-000${id.slice(-1)}`, ...extra }
});
const data: any = {
  expenses: [
    cp("e1", "c1", "Sami Sound", "2026-10-03", 600, 0, { underThreshold: true }),
    cp("e2", "c1", "Sami Sound", "2026-10-20", 600, 30),
    cp("e3", "c2", "Litia Lights", "2026-10-25", 2000, 0, { coeNumber: "COE-9" }),
    cp("e4", "c1", "Sami Sound", "2026-11-02", 400, 20),
    cp("e5", "c1", "Sami Sound", "2025-12-30", 999, 0),
    { id: "x", date: "2026-10-05", vendor: "EFL", amount: 80, category: "Utilities", paymentMethod: "Cash", businessId: "b1" },
    { ...cp("e9", "c9", "Other biz", "2026-10-05", 5000, 250), businessId: "b2" }
  ],
  ptRemittances: [{ id: "r1", businessId: "b1", month: "2026-10", amount: 10, date: "2026-11-05" }]
};
const e = earlierThisYear(data, "c1", "2026-10-25");
assert.equal(e.base, 1200, "same year, up to the date"); assert.equal(e.notWithheldBase, 600); assert.equal(e.count, 2);
assert.equal(earlierThisYear(data, "c1", "2026-10-25", "e2").base, 600, "the payment being edited is left out");
assert.equal(earlierThisYear({ expenses: [...data.expenses, cp("e6", "c1", "Sami Sound", "2026-10-26", 600, 60, { catchUpBase: 600 })] }, "c1", "2026-11-30").notWithheldBase, 0, "caught up once, not offered again");
assert.equal(earlierThisYear({ expenses: [cp("e7", "c1", "Sami Sound", "2026-10-03", 600, 0)] }, "c1", "2026-11-30").notWithheldBase, 0, "only payments left out for the threshold are caught up");
assert.equal(ptFor(base, { date: "2026-03-01", gross: 600, vat: 0 }, none).underThreshold, true);
assert.equal(nextCertificateNo(data, "b1", "2026"), "WHT-2026-0005");
assert.equal(nextCertificateNo(data, "b1", "2027"), "WHT-2027-0001");

const s = ptMonthSummary(data, "b1", "2026-10");
assert.equal(s.rows.length, 2, "everyone paid in the month, exempt ones too; other businesses left out");
assert.deepEqual(s.rows.map(r => r.name), ["Litia Lights", "Sami Sound"]);
assert.equal(s.rows[0].coeNumber, "COE-9");
assert.equal(s.rows[1].gross, 1200); assert.equal(s.rows[1].withheld, 30); assert.equal(s.rows[1].payments, 2);
assert.equal(s.withheld, 30); assert.equal(s.remitted, 10); assert.equal(s.due, "2026-11-30");
const csv = ptSummaryCsv(s);
assert.match(csv, /^Contractor,TIN,COE number/); assert.match(csv, /Litia Lights,T-c2,COE-9,2000.00/); assert.match(csv, /Total,,,3200.00,,30.00/);
assert.equal(ptSummaryCsv({ ...s, rows: [{ ...s.rows[0], name: "=HYPERLINK(1)" }] }).includes("'=HYPERLINK"), true, "formula cells neutralised");

const y = contractorYear(data, "c1", "2026");
assert.equal(y.payments.length, 3); assert.equal(y.base, 1600); assert.equal(y.withheld, 50);

// Crew side: a client withheld PT when paying an invoice.
const inv: any = { id: "inv1", type: "invoice", documentNumber: "INV-1", businessId: "b1", clientId: "cl1", currency: "FJD", issueDate: "2026-10-01",
  items: [], subtotal: 1000, vatRate: 12.5, vatAmount: 125, total: 1125, status: "sent" };
const ws: any = { businesses: [{ id: "b1" }], activeBusinessId: "b1", userProfile: { defaultCurrency: "FJD" }, clients: [{ id: "cl1", name: "Big Pictures" }], documents: [inv], transactions: [] };
const paid = applyConfirmedPayment(ws, "inv1", { paymentMethod: "Bank Transfer", paymentDate: "2026-10-12", paidAmountForeign: 1125, paidAmountHome: 1125, netReceivedHome: 1075, withholdingTax: 50, withholdingRate: 5 });
const pdoc = paid.documents[0];
assert.equal(pdoc.status, "paid", "the invoice is settled in full");
assert.deepEqual(pdoc.withholdingTax, { amount: 50, rate: 5, date: "2026-10-12", certificateReceived: false });
assert.equal(paid.transactions!.length, 2);
const bank = paid.transactions!.find(t => t.category === "Consulting Revenue")!;
const credit = paid.transactions!.find(t => t.category === "Provisional Tax Withheld")!;
assert.equal(bank.amount, 1075, "money banked"); assert.equal(credit.amount, 50, "tax credit"); assert.equal(credit.documentId, "inv1");
assert.equal(applyConfirmedPayment(ws, "inv1", { paymentMethod: "Cash", paymentDate: "2026-10-12" }).documents[0].withholdingTax, undefined);
const fy = withheldFromYou(paid as any, "2026");
assert.equal(fy.total, 50); assert.equal(fy.missing, 1); assert.equal(fy.rows[0].client, "Big Pictures");
assert.equal(withheldFromYou(paid as any, "2025").rows.length, 0);

console.log("withholding checks passed");
