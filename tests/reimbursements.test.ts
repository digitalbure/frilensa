// Unit tests for reimbursable expenses. Run: npm run test:unit
import assert from "node:assert/strict";
import { lineTotals, reimbursementLines, linkBilledExpenses, isTaxableLine } from "../src/lib/invoiceTotals";
import { computeVatReturn } from "../src/lib/vatReturn";

const exp = [
  { id: "x1", date: "2026-10-01", vendor: "Fiji Airways", description: "Flight to Labasa", amount: 300, receiptFile: { id: "f1", name: "ticket.pdf" } },
  { id: "x2", date: "2026-10-02", vendor: "Taxi", description: "Taxi", amount: 20 }
];
const lines = reimbursementLines(exp, { markupPercent: 10 });
assert.equal(lines[0].kind, "reimbursement");
assert.equal(lines[0].total, 330, "10% markup");
assert.equal(lines[0].costAmount, 300);
assert.equal(lines[0].receiptFileId, "f1");
assert.equal(lines[0].description, "2026-10-01 · Flight to Labasa");
assert.equal(lines[1].description, "2026-10-02", "description same as vendor isn't repeated");
assert.equal(lines[0].taxable, false, "no VAT by default");
assert.equal(isTaxableLine(lines[0]), false);

const items = [{ id: "s", name: "Design", quantity: 1, rate: 1000, total: 1000 }, ...lines];
const t = lineTotals(items as any);
assert.equal(t.subtotal, 1352);
assert.equal(t.taxableBase, 1000, "VAT and fees only on the service line");
assert.equal(t.reimbursementsNoVat, 352);
assert.equal(t.recoveredCost, 320, "markup isn't a recovered cost");
const taxed = lineTotals([{ ...lines[0], taxable: true }] as any);
assert.equal(taxed.taxableBase, 330);

// Linking expenses to the invoice that bills them
const linked = linkBilledExpenses(exp as any, "inv1", items as any);
assert.ok(linked.every((e: any) => e.billedDocumentId === "inv1"));
const released = linkBilledExpenses(linked, "inv1", [items[0], items[1]] as any);
assert.equal(released.find((e: any) => e.id === "x2").billedDocumentId, "", "removed line releases the expense (empty, so the cloud merge clears it)");
assert.equal(released.find((e: any) => e.id === "x1").billedDocumentId, "inv1");
assert.equal(linkBilledExpenses(released, "inv1", [items[0], items[1]] as any), released, "unchanged when nothing changes");
assert.ok(linkBilledExpenses(released, "inv1", null).every((e: any) => !e.billedDocumentId), "deleting the invoice releases all");

// VAT return: costs passed on without VAT aren't sales
const data: any = {
  userProfile: { defaultCurrency: "FJD" }, businesses: [{ id: "b1", name: "Viti", tin: "1" }], clients: [{ id: "c1", name: "Coral" }],
  documents: [{ id: "inv1", type: "invoice", documentNumber: "INV-1", businessId: "b1", clientId: "c1", issueDate: "2026-10-05", status: "sent",
    items, subtotal: 1352, vatRate: 12.5, vatAmount: 125, total: 1477 }],
  expenses: [{ ...exp[0], isVatClaimable: true, vatAmount: 33.33, businessId: "b1", category: "Travel", paymentMethod: "Card", billToClientId: "c1", billedDocumentId: "inv1" }],
  transactions: []
};
const v = computeVatReturn(data, { from: "2026-10-01", to: "2026-10-31" });
assert.equal(v.sales.outputVat, 125);
assert.equal(v.sales.reimbursedNoVat, 352);
assert.equal(v.sales.standardRated, 1000, "standard-rated sales exclude the reimbursed costs");
assert.ok(v.warnings.some(w => /claims input VAT but was billed to a client without VAT/.test(w)));
console.log("reimbursement checks passed");
