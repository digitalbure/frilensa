// Unit tests for the VAT return and CSV exports. Run: npm run test:unit
import assert from "node:assert/strict";
import { computeVatReturn, vatPeriod } from "../src/lib/vatReturn";
import { toCsv, documentsCsv, vatReturnCsv } from "../src/lib/exports";

// Periods
assert.deepEqual(vatPeriod("last_month", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" }, "January's last month is December");
assert.deepEqual(vatPeriod("this_month", "2028-02-10"), { from: "2028-02-01", to: "2028-02-29" }, "leap year");
assert.deepEqual(vatPeriod("last_quarter", "2026-02-01"), { from: "2025-10-01", to: "2025-12-31" });
assert.deepEqual(vatPeriod("this_quarter", "2026-08-20"), { from: "2026-07-01", to: "2026-09-30" });
assert.deepEqual(vatPeriod("last_half", "2026-03-01"), { from: "2025-07-01", to: "2025-12-31" });
assert.deepEqual(vatPeriod("last_half", "2026-10-01"), { from: "2026-01-01", to: "2026-06-30" });
assert.deepEqual(vatPeriod("last_year", "2026-10-01"), { from: "2025-01-01", to: "2025-12-31" });

const inv = (id: string, issueDate: string, extra: any = {}) => ({
  id, type: "invoice", documentNumber: `INV-${id}`, businessId: "b1", clientId: "c1", issueDate,
  items: [], subtotal: 1000, vatRate: 12.5, vatAmount: 125, total: 1125, status: "sent", ...extra
});
const data: any = {
  userProfile: { defaultCurrency: "FJD" },
  businesses: [{ id: "b1", name: "Viti Studio", tin: "50-123" }, { id: "b2", name: "Side Gig", tin: "" }],
  clients: [{ id: "c1", name: "Coral Resort" }],
  documents: [
    inv("a", "2026-09-05"),                                                       // in period, sent
    inv("b", "2026-09-10", { status: "paid", paymentDate: "2026-10-02" }),        // invoiced Sep, paid Oct
    inv("c", "2026-08-20", { status: "paid", paymentDate: "2026-09-15" }),        // invoiced Aug, paid Sep
    inv("d", "2026-09-12", { status: "draft" }),                                  // draft: excluded
    inv("e", "2026-09-14", { status: "cancelled" }),                              // cancelled: excluded
    inv("f", "2026-09-20", { vatRate: 0, vatAmount: 0, total: 400, subtotal: 400 }), // zero-rated
    inv("g", "2026-09-21", { businessId: "b2" }),                                 // other business
    inv("h", "2026-09-22", { status: "partial", partiallyPaidAmount: 562.5, paymentDate: "2026-09-25" }),
    { id: "cn1", type: "credit_note", documentNumber: "CN-1", businessId: "b1", clientId: "c1", issueDate: "2026-09-25", originalInvoiceId: "old", items: [], subtotal: 200, vatRate: 12.5, vatAmount: 25, total: 225, status: "paid" },
    inv("old", "2026-07-01", { status: "cancelled" }),
    { id: "cn2", type: "credit_note", documentNumber: "CN-2", businessId: "b1", clientId: "c1", issueDate: "2026-09-26", originalInvoiceId: "e", items: [], subtotal: 1000, vatRate: 12.5, vatAmount: 125, total: 1125, status: "paid" },
    { id: "r1", type: "receipt", documentNumber: "REC-1", businessId: "b1", clientId: "c1", issueDate: "2026-09-28", items: [], subtotal: 100, vatRate: 12.5, vatAmount: 12.5, total: 112.5, status: "paid" },
    { id: "r2", type: "receipt", documentNumber: "REC-2", businessId: "b1", clientId: "c1", issueDate: "2026-09-28", originalInvoiceId: "c", items: [], subtotal: 1000, vatRate: 12.5, vatAmount: 125, total: 1125, status: "paid" },
    inv("u", "2026-09-29", { currency: "USD", exchangeRate: 2.2, total: 100, subtotal: 100, vatRate: 0, vatAmount: 0 })
  ],
  expenses: [
    { id: "e1", date: "2026-09-03", vendor: "Vodafone", description: "Internet", amount: 112.5, category: "Internet", paymentMethod: "Card", vatAmount: 12.5, isVatClaimable: true, businessId: "b1" },
    { id: "e2", date: "2026-09-04", vendor: "Cafe", description: "Lunch", amount: 40, category: "Meals", paymentMethod: "Cash", vatAmount: 4.44, isVatClaimable: false, businessId: "b1" },
    { id: "e3", date: "2026-09-05", vendor: "MH", description: "Paper", amount: 30, category: "Office", paymentMethod: "Cash", isVatClaimable: true, businessId: "b1" },
    { id: "e4", date: "2026-10-01", vendor: "EFL", description: "Power", amount: 225, category: "Utilities", paymentMethod: "Bank", vatAmount: 25, isVatClaimable: true, businessId: "b1" }
  ],
  transactions: [
    { id: "t1", date: "2026-09-06", description: "Fuel", amount: -56.25, category: "Travel", status: "reconciled", bankName: "BSP", vatAmount: 6.25, isVatClaimable: true, businessId: "b1" },
    { id: "t2", date: "2026-09-07", description: "Bank fee", amount: -5, category: "Fees", status: "reconciled", bankName: "BSP", businessId: "b1" },
    { id: "e1", date: "2026-09-03", description: "Same as expense e1", amount: -112.5, category: "Internet", status: "reconciled", bankName: "BSP", vatAmount: 12.5, isVatClaimable: true, businessId: "b1" }
  ]
};
const sep = { from: "2026-09-01", to: "2026-09-30", businessId: "b1" };

// Invoice basis
const v = computeVatReturn(data, sep);
const saleRefs = v.lines.filter(l => l.kind === "sale").map(l => l.reference).sort();
assert.deepEqual(saleRefs, ["INV-a", "INV-b", "INV-f", "INV-h", "INV-u", "REC-1"], "drafts, cancelled, other business, linked receipts and other months are left out");
assert.equal(v.sales.outputVat, 125 * 3 + 12.5, "a, b, h in full on invoice basis, plus the stand-alone receipt");
assert.equal(v.sales.zeroRatedOrExempt, 400 + 220, "zero-rated invoice plus USD invoice converted at 2.2");
assert.equal(v.sales.standardRated, 3000 + 100);
assert.equal(v.creditNotes.count, 1, "only the credit note for an invoice from an earlier period");
assert.equal(v.creditNotes.vat, 25);
assert.equal(v.purchases.inputVat, 12.5 + 6.25, "claimable expense plus claimable bank transaction; not the duplicate, not the non-claimable");
assert.equal(v.purchases.count, 3, "e1, e3 (no VAT amount) and t1");
assert.equal(v.purchases.notClaimedCount, 1);
assert.equal(v.netVat, 387.5 - 25 - 18.75);
assert.ok(v.warnings.some(w => /no VAT amount/.test(w)), "flags claimable expense without VAT");
assert.ok(v.warnings.some(w => /draft invoice/.test(w)));
assert.ok(v.warnings.some(w => /another currency/.test(w)));
assert.ok(v.warnings.some(w => /already left out/.test(w)), "explains the same-period credit note");
assert.ok(!v.warnings.some(w => /has no TIN/.test(w)), "Viti Studio has a TIN");

// Payments basis
const p = computeVatReturn(data, { ...sep, basis: "payments" });
const paidRefs = p.lines.filter(l => l.kind === "sale").map(l => l.reference).sort();
assert.deepEqual(paidRefs, ["INV-c", "INV-h", "REC-1"], "paid in September, part payment, stand-alone receipt");
assert.equal(p.sales.outputVat, 125 + 62.5 + 12.5, "part payment counts half its VAT");
assert.equal(p.creditNotes.count, 0);
assert.ok(p.warnings.some(w => /payments basis/.test(w)));

// All businesses
const all = computeVatReturn(data, { from: "2026-09-01", to: "2026-09-30" });
assert.ok(all.lines.some(l => l.reference === "INV-g"));
assert.ok(all.warnings.some(w => /Side Gig has no TIN/.test(w)));

// CSV
const csv = toCsv(["A", "B"], [["=HYPERLINK(\"x\")", "a,b"], [-5, "@cmd"]]);
assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""), "formulas are neutralised and quotes escaped");
assert.ok(csv.includes("\"a,b\""));
assert.ok(csv.includes("-5,'@cmd"), "negative numbers stay numbers; text starting with @ is neutralised");
assert.ok(documentsCsv(data, { from: "2026-09-01", to: "2026-09-30", businessId: "b1" }).includes("INV-a"));
assert.ok(vatReturnCsv(v).includes("Net VAT payable"));
console.log("VAT return checks passed");
