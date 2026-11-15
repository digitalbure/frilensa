// Unit tests for takings and customer statements. Run: npm run test:unit
import assert from "node:assert/strict";
import { takingsEntry, takingsSummary, vatIncluded } from "../src/lib/takings";
import { clientStatement, statementMessage } from "../src/lib/statements";
import { buildJournal, balances } from "../src/lib/journal";
import { computeVatReturn } from "../src/lib/vatReturn";
import { agedReceivables } from "../src/lib/reports";
import { sampleBooks } from "./fixtures/books";

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} ${a} vs ${b}`);
const { data, mp } = sampleBooks();

// ---------- Takings ----------
assert.equal(vatIncluded(112.5, { userProfile: { defaultVatRate: 12.5 } } as any), 12.5);
assert.equal(vatIncluded(112.5, { userProfile: { defaultVatRate: 12.5, enableTax: false } } as any), 0, "not charging VAT");
assert.match(takingsEntry({ date: "2026-05-01", amount: 0, method: "Cash", vatIncluded: true }, data) as string, /how much/);
const t1 = takingsEntry({ date: "2026-05-01", amount: 450, method: "Vodafone M-PAiSA", note: "Saturday market", vatIncluded: true }, { ...data, userProfile: { ...data.userProfile, defaultVatRate: 12.5 } }) as any;
assert.equal(t1.takings, true); assert.equal(t1.vatAmount, 50); assert.equal(t1.amount, 450); assert.equal(t1.businessId, "b1");
assert.match(t1.description, /Saturday market/);
const t2 = takingsEntry({ date: "2026-05-02", amount: 100, method: "Cash", vatIncluded: false }, data) as any;
assert.equal(t2.vatAmount, undefined);
const withTakings = { ...data, transactions: [t1, t2, ...data.transactions] };

const sum = takingsSummary(withTakings, "2026-05-02");
assert.equal(sum.list.length, 2); assert.equal(sum.today, 100); assert.equal(sum.month, 550);
assert.equal(takingsSummary(withTakings, "2026-05-04").week, 0, "Monday starts a new week");

// They're sales with output VAT, in the right money account
const vr = computeVatReturn(withTakings, { from: "2026-05-01", to: "2026-05-31", businessId: "b1" });
near(vr.sales.outputVat, 50); near(vr.sales.standardRated, 400); near(vr.sales.zeroRatedOrExempt, 100);
near(computeVatReturn(withTakings, { from: "2026-05-01", to: "2026-05-31", businessId: "b1", basis: "payments" }).sales.outputVat, 50, "same on the payments basis");
const before = balances(buildJournal(data, { businessId: "b1" }));
const after = balances(buildJournal(withTakings, { businessId: "b1" }));
near((after.get(`cash:${mp.id}`)?.balance || 0) - (before.get(`cash:${mp.id}`)?.balance || 0), 450, "M-PAiSA takings in the M-PAiSA account");
near((after.get("sales")?.balance || 0) - (before.get("sales")?.balance || 0), -500, "sales excluding VAT");
near((after.get("vat")?.balance || 0) - (before.get("vat")?.balance || 0), -50);

// ---------- Customer statement ----------
const j = buildJournal(data, { businessId: "b1" });
const st = clientStatement(data, j, "c1", "2026-02-15", "2026-04-30");
// Before 15 Feb: inv1 1,125 + inv3 225 + inv4 112.50 − credit note 112.50 = 1,350
near(st.opening, 1350, "brought forward");
assert.deepEqual(st.lines.map(l => l.kind), ["Payment", "Payment", "Adjustment", "Invoice", "Payment"], st.lines.map(l => `${l.date} ${l.kind} ${l.description}`).join("; "));
assert.equal(st.lines[1].description, "Tax withheld by you");
near(st.closing, 450, "only inv2 left");
near(st.closing, st.opening + st.charges - st.credits);
near(st.lines[st.lines.length - 1].balance, st.closing);
assert.equal(st.open.length, 1); assert.equal(st.open[0].number, "INV2"); near(st.open[0].owing, 450);
near(st.aged.total, agedReceivables(data, j, "2026-04-30").rows[0].total, "matches Who owes you");
const full = clientStatement(data, j, "c1", "2026-01-01", "2026-12-31");
near(full.opening, 0); near(full.closing, 450);
assert.ok(full.lines.some(l => l.kind === "Credit note"));
assert.equal(clientStatement(data, j, "nobody", "2026-01-01", "2026-12-31").lines.length, 0);

const msg = statementMessage(st, "Mere", "Reef Films");
assert.match(msg, /^Bula Mere,/); assert.match(msg, /FJD 450\.00 owing/); assert.match(msg, /- INV2: FJD 450\.00, due/);

console.log("statement and takings checks passed");
