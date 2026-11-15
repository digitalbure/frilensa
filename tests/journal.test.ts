// Unit tests for money accounts and the journal. Run: npm run test:unit
import assert from "node:assert/strict";
import { cleanAccount, resolveAccount, suggestedMatchWords } from "../src/lib/accounts";
import { accountActivity, accountBalances, balances, buildJournal } from "../src/lib/journal";
import { sampleBooks } from "./fixtures/books";
import { applyConfirmedPayment } from "../src/lib/payments";

// ---------- Accounts ----------
let anz = cleanAccount({ name: "ANZ Business", kind: "bank", institution: "ANZ Fiji", openingBalance: 5000, openingDate: "2026-01-01", matchWords: ["ANZ", "Bank Transfer"], isDefault: true, businessId: "b1" }) as any;
let mp = cleanAccount({ name: "M-PAiSA", kind: "mobile", openingBalance: 0, openingDate: "2026-01-01", matchWords: ["M-PAiSA"], businessId: "b1" }) as any;
let card = cleanAccount({ name: "Westpac card", kind: "card", openingBalance: -1200, openingDate: "2026-01-01", matchWords: ["Credit Card"], businessId: "b1" }) as any;
assert.equal(typeof cleanAccount({ name: "", openingDate: "2026-01-01" }), "string");
assert.match(cleanAccount({ name: "X", openingDate: "nope" }) as string, /date/);
assert.deepEqual(suggestedMatchWords("mobile", "Vodafone"), ["M-PAiSA", "M-Paisa", "Mpaisa"]);
const accts = [anz, mp, card];
assert.equal(resolveAccount(accts, { method: "Vodafone M-PAiSA", businessId: "b1" })?.id, mp.id);
assert.equal(resolveAccount(accts, { method: "ANZ Fiji Bank Transfer" })?.id, anz.id);
assert.equal(resolveAccount(accts, { method: "Cheque" })?.id, anz.id, "falls back to the default");
assert.equal(resolveAccount(accts, { accountId: card.id, method: "ANZ" })?.id, card.id, "a chosen account wins");
assert.equal(resolveAccount([mp], { method: "Cheque" }), undefined, "nothing matches and no default");

const books = sampleBooks();
const data = books.data;
anz = books.anz; mp = books.mp; card = books.card;
const j = buildJournal(data, { businessId: "b1" });
for (const e of j.entries) {
  const d = e.lines.reduce((s, l) => s + l.debit, 0), c = e.lines.reduce((s, l) => s + l.credit, 0);
  assert.ok(Math.abs(d - c) < 0.005, `entry ${e.id} balances (${d} vs ${c})`);
}
const b = balances(j);
const bal = (code: string) => b.get(code)?.balance || 0;
const tb = [...b.values()].reduce((s, x) => s + x.balance, 0);
assert.ok(Math.abs(tb) < 0.01, `trial balance balances (${tb})`);

// Bank: 5,000 + 1,050 − 500 (bill) − 950 (contractor) − 4,213.33 (net pay) − 466.67 (PAYE) − 50 (PT) − 200 (VAT)
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} ${a} vs ${b}`);
near(bal(`cash:${anz.id}`), 5000 + 1050 - 500 - 950 - 4213.33 - 466.67 - 50 - 200 + 100, "bank (cash takings go to the default account)");
assert.equal(bal(`cash:${mp.id}`), 225 - 300, "invoice paid by M-PAiSA without a ledger entry, less drawings");
assert.equal(bal(`cash:${card.id}`), -1200 - 225, "the card owes more");
assert.equal(bal("cash:unassigned"), 0);
near(balances(buildJournal({ ...data, bankAccounts: [{ ...anz, isDefault: false }, mp, card] }, { businessId: "b1" })).get("cash:unassigned")!.balance, 100 - 4213.33 - 466.67 - 50, "no default: cash takings, net pay and tax payments wait to be assigned");
assert.equal(bal("ar"), 450, "only inv2 is owed");
assert.equal(bal("tax_credit"), 50);
assert.equal(bal("ap"), -625, "bill less the part paid");
near(bal("vat"), -(125 + 50 + 25 + 12.5 - 12.5 - 25 - 125 - 200), "output less input less paid");
assert.equal(bal("pt"), 0);
assert.equal(bal("paye"), 0); assert.equal(bal("fnpf"), -900); assert.equal(bal("payroll_deductions"), -20);
assert.equal(bal("fx_fees"), 25, "bank fee on inv1");
assert.equal(bal("sales"), -(1000 + 400 + 200 + 100 - 100));
assert.equal(bal("exp:Wages & Salaries"), 5100, "payroll counted once, from the run");
assert.equal(bal("exp:Employer FNPF"), 500);
assert.equal(bal("exp:Materials"), 1000); assert.equal(bal("exp:Subcontractors"), 1000); assert.equal(bal("exp:Meals & Entertainment"), 200);
assert.equal(bal("inc:Interest"), -100); assert.equal(bal("drawings"), 300);
assert.equal(bal("opening_equity"), -(5000 - 1200));
assert.ok(!j.entries.some(e => e.source.id === "draft" || e.source.id === "other" || e.source.id === "b-void"), "drafts, other businesses and void bills left out");

// As of a date, and between dates
const feb = accountBalances(data, "b1", "2026-02-28");
near(feb.accounts.find(a => a.account.id === anz.id)!.balance, 5000 + 1050 - 500);
assert.equal(balances(buildJournal(data, { businessId: "b1" }), "2026-03-01", "2026-03-31").get("sales")!.balance, -400, "inv2 only (inv3 is dated February)");

// Opening balance: entries before the opening date don't change where the account starts
const later = { ...data, bankAccounts: [{ ...anz, openingDate: "2026-03-01", openingBalance: 2000 }, mp, card] };
const lb = accountBalances(later, "b1", "2026-03-01");
assert.equal(lb.accounts.find(a => a.account.id === anz.id)!.balance, 2000, "balance on the opening date is the opening balance");

// Activity with a running balance
const act = accountActivity(j, `cash:${mp.id}`);
assert.equal(act[0].balance, -75); assert.equal(act[act.length - 1].amount, 225);

// A chosen account wins over the payment method, for expenses and for client payments
{
  const chosen = { ...data,
    expenses: [...data.expenses, { id: "e-ch", date: "2026-05-01", vendor: "Shop", amount: 40, category: "Office Supplies", paymentMethod: "ANZ", businessId: "b1", accountId: mp.id }],
    transactions: [...data.transactions, { id: "e-ch", date: "2026-05-01", amount: -40, category: "Office Supplies", bankName: "ANZ", businessId: "b1", status: "reconciled", description: "Shop" }] };
  const before = balances(buildJournal(data, { businessId: "b1" }));
  const after = balances(buildJournal(chosen, { businessId: "b1" }));
  near(after.get(`cash:${mp.id}`)!.balance, before.get(`cash:${mp.id}`)!.balance - 40, "expense paid from the chosen account");
  near(after.get(`cash:${anz.id}`)!.balance, before.get(`cash:${anz.id}`)!.balance, "not from the account its method names");
  const paid = applyConfirmedPayment(data, "inv2", { paymentMethod: "ANZ Fiji Bank Transfer", paymentDate: "2026-05-02", paidAmountForeign: 450, paidAmountHome: 450, netReceivedHome: 450, accountId: mp.id });
  const pb = balances(buildJournal(paid, { businessId: "b1" }));
  near(pb.get(`cash:${mp.id}`)!.balance, before.get(`cash:${mp.id}`)!.balance + 450, "client payment into the chosen account");
  assert.equal(pb.get("ar")?.balance || 0, 0);
}

console.log("journal checks passed");
