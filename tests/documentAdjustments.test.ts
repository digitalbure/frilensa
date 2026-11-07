// Unit tests for discounts and rounding on quotes and invoices. Run: npm run test:unit
import assert from "node:assert/strict";
import { cents, cleanDiscount, beforeTaxDiscount, afterTaxDiscount, roundingFor, adjustmentRows } from "../src/lib/documentAdjustments";
import { recalcDocumentTotals } from "../src/lib/invoiceTotals";

// Cents: halves round up even when the float is just under (555.555 is stored as 555.55499…).
assert.equal(cents(4444.44 * 0.125), 555.56);
assert.equal(cents(1.005), 1.01);

// Cleaning: nothing to take off → null; percent capped at 100; labels trimmed.
assert.equal(cleanDiscount({ type: "percent", value: 0 } as any), null);
assert.equal(cleanDiscount(null), null);
assert.deepEqual(cleanDiscount({ type: "percent", value: 150, timing: "after_tax", label: "  VIP  " } as any), { type: "percent", value: 100, timing: "after_tax", label: "VIP" });

// Before tax: 10% of 4,000 = 400; taxes are charged on 3,600 (factor 0.9).
const b = beforeTaxDiscount(cleanDiscount({ type: "percent", value: 10, timing: "before_tax" } as any), 4000);
assert.deepEqual(b, { amount: 400, factor: 0.9 });
// An amount discount can't exceed the lines.
assert.equal(beforeTaxDiscount(cleanDiscount({ type: "amount", value: 9999, timing: "before_tax" } as any), 500).amount, 500);
// A before-tax rule doesn't apply after tax, and vice versa.
assert.equal(afterTaxDiscount(cleanDiscount({ type: "amount", value: 50, timing: "before_tax" } as any), 1000), 0);
assert.equal(beforeTaxDiscount(cleanDiscount({ type: "amount", value: 50, timing: "after_tax" } as any), 1000).amount, 0);

// After tax: 5% of 4,500 = 225, capped at the taxed total.
assert.equal(afterTaxDiscount(cleanDiscount({ type: "percent", value: 5, timing: "after_tax" } as any), 4500), 225);
assert.equal(afterTaxDiscount(cleanDiscount({ type: "amount", value: 6000, timing: "after_tax" } as any), 4500), 4500);

// Rounding: an exact total, and steps.
assert.equal(roundingFor(5001.33, { target: 5000 }), -1.33);
assert.equal(roundingFor(4998.2, { target: 5000 }), 1.8);
assert.equal(roundingFor(5001.33, { step: 1, direction: "nearest" }), -0.33);
assert.equal(roundingFor(5004.99, { step: 10, direction: "nearest" }), -4.99);
assert.equal(roundingFor(5005, { step: 10, direction: "nearest" }), 4.99 + 0.01);
assert.equal(roundingFor(5099.5, { step: 100, direction: "down" }), -99.5);
assert.equal(roundingFor(5000, { step: 100, direction: "down" }), 0, "already round");
assert.equal(roundingFor(5000.01, { step: 10, direction: "up" }), 9.99);

// Rows for documents: before-tax discount first, then after-tax discount and rounding.
assert.deepEqual(adjustmentRows({ discount: { type: "percent", value: 10, timing: "before_tax", amount: 400, label: "Launch offer" }, roundingAdjustment: -1.33 }),
  [{ key: "discount_before", label: "Launch offer (10%)", amount: -400 }, { key: "rounding", label: "Rounding", amount: -1.33 }]);
assert.deepEqual(adjustmentRows({}), []);

// Recalculating a document: 4,000 of lines, 10% before tax, 12.5% VAT → 3,600 + 450 = 4,050.
const vat = [{ id: "ptax-1", name: "Fiji VAT (12.5%)", type: "tax" as const, rate: 12.5, rateType: "percentage" as const, amount: 0 }];
const quote: any = { items: [], vatRate: 12.5, appliedTaxes: vat, appliedFees: [], discount: { type: "percent", value: 10, timing: "before_tax", amount: 0 } };
const lines = [{ id: "a", name: "Shoot", quantity: 2, rate: 2000, total: 4000 }];
const t = recalcDocumentTotals(quote, lines);
assert.deepEqual([t.subtotal, t.discount!.amount, t.vatAmount, t.total], [4000, 400, 450, 4050]);

// Reimbursements (no VAT) share the before-tax discount but stay untaxed: 1,000 taxable + 1,000 cost, 10% off.
const mixed = recalcDocumentTotals(quote, [
  { id: "a", name: "Work", quantity: 1, rate: 1000, total: 1000 },
  { id: "r", name: "Flights", quantity: 1, rate: 1000, total: 1000, kind: "reimbursement" } as any
]);
assert.deepEqual([mixed.discount!.amount, mixed.vatAmount, mixed.total], [200, 112.5, 1912.5]);

// After tax: VAT on the full 4,000, then 250 off the 4,500.
const afterQ: any = { ...quote, discount: { type: "amount", value: 250, timing: "after_tax", amount: 0 } };
const at = recalcDocumentTotals(afterQ, lines);
assert.deepEqual([at.vatAmount, at.discount!.amount, at.total], [500, 250, 4250]);

// "Nearest $10" is kept when lines change; "set the total to $5,000" is dropped.
const stepQ: any = { ...quote, discount: undefined, roundingRule: { mode: "step", step: 10, direction: "nearest" } };
const st = recalcDocumentTotals(stepQ, [{ id: "a", name: "Work", quantity: 1, rate: 1001, total: 1001 }]);
assert.deepEqual([st.total, st.roundingAdjustment], [1130, 3.87]); // 1,001 + 125.13 VAT = 1,126.13 → 1,130
const targetQ: any = { ...quote, discount: undefined, roundingRule: { mode: "target", target: 5000 }, roundingAdjustment: -1.33 };
const tt = recalcDocumentTotals(targetQ, lines);
assert.deepEqual([tt.total, tt.roundingAdjustment, tt.roundingRule], [4500, undefined, undefined]);

// Final invoice less a deposit keeps the quote's discount and rounding amounts, so deposit + final = quote.
// Quote: 4,000 lines, 10% off before tax, VAT, rounded to 4,000 (−50). Deposit invoice: 1,000 + VAT = 1,125.
const quoteWithRounding: any = { ...quote, discount: { type: "percent", value: 10, timing: "before_tax", amount: 400 }, roundingRule: { mode: "target", target: 4000 }, roundingAdjustment: -50 };
const finalInv = recalcDocumentTotals(quoteWithRounding, [...lines, { id: "dep", name: "Less deposit", quantity: 1, rate: -1000, total: -1000 }], false, { keepAdjustments: true });
assert.equal(finalInv.discount!.amount, 400);
assert.equal(finalInv.roundingAdjustment, -50);
assert.equal(cents(finalInv.total + 1125), 4000, `deposit + final should equal the quote, got ${finalInv.total} + 1125`);

console.log("discount and rounding checks passed");
