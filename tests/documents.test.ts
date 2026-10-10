// Unit tests for repairing malformed documents. Run: npm run test:unit
import assert from "node:assert/strict";
import { normalizeDocuments } from "../src/lib/normalizeDocuments";
const good: any = { id: "d1", type: "invoice", documentNumber: "INV-1", businessId: "b1", clientId: "c1", issueDate: "2026-10-01",
  items: [{ id: "i", name: "A", quantity: 2, rate: 50, total: 100 }], subtotal: 100, vatRate: 12.5, vatAmount: 12.5, total: 112.5, status: "sent" };
const data: any = { documents: [good] };
assert.equal(normalizeDocuments(data), data, "valid data is returned unchanged");

const broken: any = { id: "d2", type: "quote", documentNumber: 1002, businessId: "b1", clientId: "c1", issueDate: "2026-10-02",
  items: [{ id: "i", name: "Scope", quantity: 2, rate: 40 }, { name: "No cost" }], vatRate: 12.5, status: "draft",
  appliedTaxes: [{ id: "t", name: "VAT", rate: 12.5 }], cancelledAt: 5, notes: { x: 1 } };
const fixed: any = normalizeDocuments({ documents: [good, broken, null] } as any).documents;
assert.equal(fixed.length, 2, "non-object entries dropped");
assert.equal(fixed[0], good, "valid documents keep their identity");
const d = fixed[1];
assert.equal(d.documentNumber, "1002");
assert.equal(d.items[0].total, 80, "line total rebuilt from quantity x rate");
assert.equal(d.items[1].total, 0);
assert.equal(d.items[1].id, "item-1");
assert.equal(d.subtotal, 80);
assert.equal(d.appliedTaxes[0].amount, 0);
assert.equal(d.total, 80);
assert.equal(d.cancelledAt, undefined);
assert.equal(typeof d.notes, "string");

const noItems: any = normalizeDocuments({ documents: [{ id: "d3", type: "invoice", subtotal: "200", total: "225", status: "sent", businessId: "b1", clientId: "c1" }] } as any).documents[0];
assert.deepEqual(noItems.items, []);
assert.equal(noItems.subtotal, 200, "numeric strings become numbers");
assert.equal(noItems.total, 225);
assert.equal(noItems.issueDate, "");
console.log("document repair checks passed");
