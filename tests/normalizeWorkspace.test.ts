// Unit tests for repairing list items that would crash screens. Run: npm run test:unit
import assert from "node:assert/strict";
import { normalizeWorkspace } from "../src/lib/normalizeWorkspace";

const good = { id: "s1", name: "Shoot day", unit: "Day", rate: 1000, rushRate: 1200 };
const data: any = {
  documents: [],
  services: [good, { id: "s2", name: "Edit", rate: "85.5", rushRate: "fast", weekendRate: "120" }, null, { id: "s3" }],
  transactions: [{ id: "t1", date: "2026-10-01", description: "Fee", amount: "-12.5", category: "Bank", bankName: "BSP", balance: "" }, { id: "t2", vatAmount: 3 }],
  expenses: [{ id: "e1", amount: undefined, vatAmount: "1.25", date: "2026-10-02", category: "Travel", vendor: "Fiji Airways" }],
  rateRules: [{ id: "r1", name: "Weekend", type: "surcharge", unit: "flat", appliesTo: "weekend", isActive: true }],
  projects: [{ id: "p1", name: "Doc", cost: null }],
  clients: [{ id: "c1", name: 7 }]
};
const out: any = normalizeWorkspace(data);

assert.equal(out.services[0], good, "valid items are left as they are");
assert.equal(out.services.length, 3, "non-objects dropped");
assert.deepEqual([out.services[1].rate, out.services[1].weekendRate, "rushRate" in out.services[1], out.services[1].unit], [85.5, 120, false, "Unit"]);
assert.deepEqual([out.services[2].rate, out.services[2].name], [0, "Service"]);
assert.equal(out.transactions[0].amount, -12.5);
assert.equal("balance" in out.transactions[0], false, "an unusable balance is removed, not shown as 0");
assert.deepEqual([out.transactions[1].amount, out.transactions[1].description, out.transactions[1].bankName], [0, "", ""]);
assert.deepEqual([out.expenses[0].amount, out.expenses[0].vatAmount], [0, 1.25]);
assert.deepEqual([out.rateRules[0].value, out.rateRules[0].description], [0, ""]);
assert.equal(out.projects[0].cost, 0);
assert.equal(out.clients[0].name, "7");

// Nothing to fix: the same object comes back (so the app doesn't re-render or re-save).
const clean: any = { documents: [], services: [good], transactions: [], expenses: [] };
assert.equal(normalizeWorkspace(clean), clean);

console.log("workspace repair checks passed");
