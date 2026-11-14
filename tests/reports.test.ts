// Unit tests for the accountant reports. Run: npm run test:unit
import assert from "node:assert/strict";
import { buildJournal } from "../src/lib/journal";
import { agedReceivables, balanceSheet, cashFlow, generalLedger, salesByClient, toCsv, trialBalance } from "../src/lib/reports";
import { sampleBooks } from "./fixtures/books";

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} ${a} vs ${b}`);
const { data, anz, mp, card } = sampleBooks();
const j = buildJournal(data, { businessId: "b1" });

// Trial balance
const tb = trialBalance(j, "2026-12-31");
near(tb.debit, tb.credit, "trial balance debits equal credits");
assert.ok(tb.rows.every(r => (r.debit > 0) !== (r.credit > 0)), "each row is a debit or a credit");
assert.equal(tb.rows[0].account.type, "asset", "assets first");

// Balance sheet: assets = liabilities + equity, on any date
for (const asOf of ["2026-01-31", "2026-02-15", "2026-03-31", "2026-12-31"]) {
  const bs = balanceSheet(j, asOf);
  near(bs.totalAssets, bs.totalLiabilities + bs.totalEquity, `balance sheet balances on ${asOf}`);
}
const bs = balanceSheet(j, "2026-12-31");
assert.ok(bs.liabilities.some(l => l.code === `cash:${card.id}` && Math.abs(l.amount - 1425) < 0.005), "the card is a liability");
assert.ok(bs.assets.some(a => a.code === "ar" && a.amount === 450));
assert.ok(bs.liabilities.some(l => l.code === "ap" && l.amount === 625));
assert.ok(bs.assets.some(a => a.code === `cash:${mp.id}` ) === false, "M-PAiSA is overdrawn (−75), so it's owed");
// Profit: sales 1,600 + interest 100 − (fees 25 + meals 200 + materials 1,000 + contractor 1,000 + wages 5,100 + employer FNPF 500)
near(bs.earnings, 1600 + 100 - (25 + 200 + 1000 + 1000 + 5100 + 500), "profit to date");

// Cash flow: opening + net = closing, by group
const cf = cashFlow(j, "2026-02-01", "2026-03-31");
near(cf.opening + cf.net, cf.closing, "cash flow adds up");
near(cf.opening, 5000 - 1200, "cash at the start of February");
const g = (name: string) => cf.rows.find(r => r.group === name);
near(g("From clients")!.in, 1050 + 225, "client payments into bank and M-PAiSA");
near(g("Wages and FNPF")!.out, 4213.33);
near(g("Tax paid to FRCS")!.out, 200, "VAT paid in March (PAYE and PT were paid in April)");
near(g("Owner")!.out, 300);
const year = cashFlow(j, "2025-12-01", "2026-12-31");
near(year.opening, 0); near(year.opening + year.net, year.closing, "full year with opening balances");
assert.ok(year.rows.some(r => r.group === "Accounts added (opening balances)"));

// General ledger
const gl = generalLedger(j, "2026-03-01", "2026-03-31", `cash:${anz.id}`);
assert.equal(gl.length, 1);
near(gl[0].opening, 5000 + 1050 - 500, "brought forward from February");
near(gl[0].lines[gl[0].lines.length - 1].balance, gl[0].closing);
const all = generalLedger(j, "2026-01-01", "2026-12-31");
near(all.reduce((s, a) => s + a.closing, 0), 0, "all closing balances net to zero");

// Who owes you
const ar = agedReceivables(data, j, "2026-04-15");
assert.equal(ar.rows.length, 1); assert.equal(ar.rows[0].name, "Big Pictures"); assert.equal(ar.rows[0].total, 450);
assert.equal(ar.invoices.length, 1); assert.equal(ar.invoices[0].number, "INV2");
const arFeb = agedReceivables(data, j, "2026-02-15");
near(arFeb.rows[0].total, 1125 + 225, "inv1 and inv3 were both still owed then");

// Sales by client
const sales = salesByClient(data, j, "2026-01-01", "2026-12-31");
assert.equal(sales.rows.length, 1);
near(sales.net, 1600, "inv1 1,000 + inv2 400 + inv3 200 + inv4 100 − credit note 100");
near(sales.vat, 200);
near(sales.received, 1050 + 50 + 225, "money banked, tax withheld and the M-PAiSA payment (the bank fee was not received)");

// CSV keeps numbers as numbers and neutralises formulas
assert.equal(toCsv([["=SUM(A1)", "-12.50", 3]]), "'=SUM(A1),-12.50,3");

console.log("report checks passed");
