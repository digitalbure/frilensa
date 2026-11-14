// Unit tests for suppliers and supplier bills. Run: npm run test:unit
import assert from "node:assert/strict";
import { agedPayables, billOwing, billStatus, billTransactions, bucketFor, cleanSupplier, dueDateFor, ledgerFor, payBill } from "../src/lib/bills";
import { computeVatReturn } from "../src/lib/vatReturn";

const bill: any = { id: "e1", date: "2026-10-01", vendor: "Lautoka Hardware", description: "Cable", amount: 1125, vatAmount: 125, isVatClaimable: true, category: "Materials", paymentMethod: "Bill", businessId: "b1",
  bill: { supplierId: "s1", number: "LH-77", dueDate: "2026-10-31", payments: [] } };

// Status and owing
assert.equal(billStatus(bill, "2026-10-15"), "unpaid");
assert.equal(billStatus(bill, "2026-11-01"), "overdue");
assert.equal(billOwing(bill), 1125);
assert.equal(dueDateFor("2026-10-01", 30), "2026-10-31");
assert.equal(dueDateFor("2026-12-15", 30), "2027-01-14");

// Paying in parts
assert.match(payBill(bill, { date: "2026-10-10", amount: 0, method: "Cash" }) as string, /amount/);
assert.match(payBill(bill, { date: "2026-10-10", amount: 2000, method: "Cash" }) as string, /more than is owing/);
let paid = payBill(bill, { date: "2026-10-10", amount: 500, method: "BSP Fiji", reference: "TT1" }) as any;
assert.equal(billOwing(paid), 625); assert.equal(billStatus(paid, "2026-10-15"), "part");
paid = payBill(paid, { date: "2026-11-05", amount: 625, method: "BSP Fiji" }) as any;
assert.equal(billOwing(paid), 0); assert.equal(billStatus(paid, "2026-12-01"), "paid");
assert.match(payBill(paid, { date: "2026-11-06", amount: 1, method: "Cash" }) as string, /more than is owing/);
assert.match(payBill({ ...bill, bill: { ...bill.bill, voided: { date: "x", reason: "dup" } } }, { date: "2026-10-10", amount: 1, method: "Cash" }) as string, /void/);
assert.equal(billStatus({ ...bill, bill: { ...bill.bill, voided: { date: "x", reason: "dup" } } }, "2026-12-01"), "void");

// Ledger: no entry for the bill itself, one per payment; ordinary expenses keep one entry; contractors log what was paid out
const txs = billTransactions(paid);
assert.equal(txs.length, 2); assert.equal(txs[0].amount, -500); assert.equal(txs[0].expenseId, "e1"); assert.equal(txs[0].date, "2026-10-10");
const existing = [{ id: "e1", amount: -1125 } as any, { id: "other", amount: 50 } as any, { id: "e1-pay-old", expenseId: "e1", amount: -1 } as any];
const ledger = ledgerFor(existing, paid, { id: "e1", amount: -1125 } as any);
assert.deepEqual(ledger.map(t => t.id).sort(), [txs[0].id, txs[1].id, "other"].sort(), "old single entry and old payments replaced");
assert.deepEqual(ledgerFor(existing, { id: "e9", amount: 10 } as any, { id: "e9", amount: -10 } as any).map(t => t.id), ["e9", "e1", "other", "e1-pay-old"]);
assert.equal(ledgerFor([], { id: "c1", amount: 1000, contractorPayment: { net: 950 } } as any, { id: "c1", amount: -1000 } as any)[0].amount, -950, "contractor: net paid out");

// Aged payables
assert.equal(bucketFor("2026-10-31", "2026-10-31"), "current");
assert.equal(bucketFor("2026-10-31", "2026-11-15"), "d1_30");
assert.equal(bucketFor("2026-10-31", "2027-02-15"), "d90");
const half = payBill(bill, { date: "2026-10-10", amount: 500, method: "Cash" }) as any;
const data: any = { suppliers: [{ id: "s1", name: "Lautoka Hardware Ltd" }], expenses: [half,
  { ...bill, id: "e2", amount: 300, bill: { dueDate: "2026-12-30", payments: [] }, vendor: "Vodafone" },
  { ...bill, id: "e3", bill: { ...bill.bill, voided: { date: "x", reason: "dup" } } },
  { ...bill, id: "e4", businessId: "b2" },
  { id: "plain", date: "2026-10-01", amount: 99, vendor: "Cafe" }] };
const aged = agedPayables(data, "2026-11-15", "b1");
assert.equal(aged.length, 2);
assert.equal(aged[0].name, "Lautoka Hardware Ltd"); assert.equal(aged[0].d1_30, 625); assert.equal(aged[0].total, 625);
assert.equal(aged[1].name, "Vodafone"); assert.equal(aged[1].current, 300);
assert.equal(agedPayables(data, "2026-10-05", "b1")[0].total, 1125, "payments after the date don't count yet");

// Suppliers
assert.equal(typeof cleanSupplier({ name: " " }), "string");
assert.match(cleanSupplier({ name: "A", email: "nope" }) as string, /email/);
const s = cleanSupplier({ name: " FEA ", paymentTermsDays: 999, tin: "03-1" }) as any;
assert.equal(s.name, "FEA"); assert.equal(s.paymentTermsDays, 30); assert.equal(s.tin, "03-1"); assert.ok(s.id);

// VAT: invoice basis on the bill date; payments basis as it's paid; void bills and payment entries never counted
const ws: any = { userProfile: { defaultCurrency: "FJD" }, businesses: [{ id: "b1" }], clients: [], documents: [],
  expenses: [paid, { ...bill, id: "v", bill: { ...bill.bill, voided: { date: "x", reason: "dup" } } }],
  transactions: billTransactions(paid).map(t => ({ ...t, isVatClaimable: true, vatAmount: 50 })) };
const inv = computeVatReturn(ws, { from: "2026-10-01", to: "2026-10-31", basis: "invoice" });
assert.equal(inv.purchases.inputVat, 125); assert.equal(inv.purchases.count, 1);
const pay = computeVatReturn(ws, { from: "2026-10-01", to: "2026-10-31", basis: "payments" });
assert.equal(Math.round(pay.purchases.inputVat * 100) / 100, 55.56, "500 of 1,125 paid in October");
const payNov = computeVatReturn(ws, { from: "2026-11-01", to: "2026-11-30", basis: "payments" });
assert.equal(Math.round(payNov.purchases.inputVat * 100) / 100, 69.44);

console.log("bills checks passed");
