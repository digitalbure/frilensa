// Unit tests for money accounts and the journal. Run: npm run test:unit
import assert from "node:assert/strict";
import { cleanAccount, resolveAccount, suggestedMatchWords } from "../src/lib/accounts";
import { accountActivity, accountBalances, balances, buildJournal } from "../src/lib/journal";
import { applyConfirmedPayment } from "../src/lib/payments";
import { billTransactions } from "../src/lib/bills";

// ---------- Accounts ----------
const anz = cleanAccount({ name: "ANZ Business", kind: "bank", institution: "ANZ Fiji", openingBalance: 5000, openingDate: "2026-01-01", matchWords: ["ANZ", "Bank Transfer"], isDefault: true, businessId: "b1" }) as any;
const mp = cleanAccount({ name: "M-PAiSA", kind: "mobile", openingBalance: 0, openingDate: "2026-01-01", matchWords: ["M-PAiSA"], businessId: "b1" }) as any;
const card = cleanAccount({ name: "Westpac card", kind: "card", openingBalance: -1200, openingDate: "2026-01-01", matchWords: ["Credit Card"], businessId: "b1" }) as any;
assert.equal(typeof cleanAccount({ name: "", openingDate: "2026-01-01" }), "string");
assert.match(cleanAccount({ name: "X", openingDate: "nope" }) as string, /date/);
assert.deepEqual(suggestedMatchWords("mobile", "Vodafone"), ["M-PAiSA", "M-Paisa", "Mpaisa"]);
const accts = [anz, mp, card];
assert.equal(resolveAccount(accts, { method: "Vodafone M-PAiSA", businessId: "b1" })?.id, mp.id);
assert.equal(resolveAccount(accts, { method: "ANZ Fiji Bank Transfer" })?.id, anz.id);
assert.equal(resolveAccount(accts, { method: "Cheque" })?.id, anz.id, "falls back to the default");
assert.equal(resolveAccount(accts, { accountId: card.id, method: "ANZ" })?.id, card.id, "a chosen account wins");
assert.equal(resolveAccount([mp], { method: "Cheque" }), undefined, "nothing matches and no default");

// ---------- A year of records ----------
const inv = (id: string, extra: any) => ({ id, type: "invoice", documentNumber: id.toUpperCase(), businessId: "b1", clientId: "c1", currency: "FJD", issueDate: "2026-02-01", items: [], subtotal: 1000, vatRate: 12.5, vatAmount: 125, total: 1125, status: "sent", ...extra });
let data: any = {
  userProfile: { defaultCurrency: "FJD" }, businesses: [{ id: "b1" }], clients: [{ id: "c1", name: "Big Pictures" }], activeBusinessId: "b1",
  bankAccounts: accts,
  documents: [
    inv("inv1", {}),
    inv("inv2", { subtotal: 400, vatAmount: 50, total: 450, issueDate: "2026-03-01" }),
    inv("inv3", { status: "paid", paymentMethod: "Vodafone M-PAiSA", paymentDate: "2026-03-05", subtotal: 200, vatAmount: 25, total: 225 }),
    inv("inv4", { status: "cancelled", subtotal: 100, vatAmount: 12.5, total: 112.5 }),
    { id: "cn1", type: "credit_note", documentNumber: "CN-1", businessId: "b1", clientId: "c1", issueDate: "2026-02-10", items: [], subtotal: 100, vatAmount: 12.5, total: 112.5, status: "paid", originalInvoiceId: "inv4" },
    inv("draft", { status: "draft" }),
    inv("other", { businessId: "b2", status: "paid" })
  ],
  expenses: [], transactions: []
};
// Paid in full with 50 provisional tax withheld by the client and 25 bank fee: banked 1,050.
data = applyConfirmedPayment(data, "inv1", { paymentMethod: "ANZ Fiji Bank Transfer", paymentDate: "2026-02-20", paidAmountForeign: 1125, paidAmountHome: 1125, bankFeesDeduction: 25, netReceivedHome: 1050, withholdingTax: 50, withholdingRate: 5 });
const expense = { id: "e1", date: "2026-02-05", vendor: "Cafe", amount: 225, vatAmount: 25, isVatClaimable: true, category: "Meals & Entertainment", paymentMethod: "Credit Card", businessId: "b1" };
const bill = { id: "b-1", date: "2026-02-06", vendor: "Hardware", amount: 1125, vatAmount: 125, isVatClaimable: true, category: "Materials", paymentMethod: "Bill", businessId: "b1",
  bill: { dueDate: "2026-03-06", payments: [{ id: "p1", date: "2026-02-28", amount: 500, method: "ANZ" }] } };
const voided = { ...bill, id: "b-void", bill: { dueDate: "2026-03-06", payments: [], voided: { date: "x", reason: "dup" } } };
const contractor = { id: "c-1", date: "2026-03-10", vendor: "Sami", amount: 1000, category: "Subcontractors", paymentMethod: "Bank Transfer", businessId: "b1",
  contractorPayment: { contractorId: "x", contractorName: "Sami", tin: "", gross: 1000, vat: 0, base: 1000, rate: 5, withheld: 50, net: 950, applied: true, reason: "", certificateNo: "WHT-1" } };
const run = { id: "run1", businessId: "b1", frequency: "monthly", periodStart: "2026-03-01", periodEnd: "2026-03-31", payDate: "2026-03-28", status: "paid", createdAt: "", expenseIds: ["exp-pay-run1", "exp-fnpf-run1"],
  lines: [{ employeeId: "e", name: "Mere", tin: "", fnpfNumber: "", taxCode: "P", residency: "resident", normalPay: 5000, extraPay: 0, reimbursements: 100, otherDeductions: 20, gross: 5000, paye: 466.67, fnpfEmployee: 400, fnpfEmployer: 500, net: 4213.33 }] };
data = {
  ...data,
  expenses: [expense, bill, voided, contractor,
    { id: "exp-pay-run1", date: "2026-03-28", vendor: "Employees", amount: 5100, category: "Wages & Salaries", paymentMethod: "Bank Transfer", businessId: "b1" },
    { id: "exp-fnpf-run1", date: "2026-03-28", vendor: "FNPF", amount: 500, category: "Wages & Salaries", paymentMethod: "Bank Transfer", businessId: "b1" }],
  transactions: [...data.transactions,
    { id: "e1", date: "2026-02-05", amount: -225, category: "Meals & Entertainment", bankName: "Credit Card", businessId: "b1", status: "reconciled", description: "Cafe" },
    ...billTransactions(bill as any),
    { id: "c-1", date: "2026-03-10", amount: -950, category: "Subcontractors", bankName: "Bank Transfer", businessId: "b1", status: "reconciled", description: "Sami" },
    { id: "exp-pay-run1", date: "2026-03-28", amount: -5100, category: "Wages & Salaries", bankName: "Bank Transfer", businessId: "b1", status: "reconciled", description: "Wages" },
    { id: "exp-fnpf-run1", date: "2026-03-28", amount: -500, category: "Wages & Salaries", bankName: "Bank Transfer", businessId: "b1", status: "reconciled", description: "FNPF" },
    { id: "t-other", date: "2026-03-15", amount: 100, category: "Interest", bankName: "Cash", businessId: "b1", status: "reconciled", description: "Interest" },
    { id: "t-vat", date: "2026-03-30", amount: -200, category: "VAT Payment", bankName: "ANZ", businessId: "b1", status: "reconciled", description: "VAT to FRCS" },
    { id: "t-draw", date: "2026-03-31", amount: -300, category: "Owner Drawings", bankName: "M-PAiSA", businessId: "b1", status: "reconciled", description: "Drawings" }],
  payRuns: [run],
  payrollPayments: [{ id: "pp1", businessId: "b1", month: "2026-03", kind: "paye", amount: 466.67, date: "2026-04-10" }],
  ptRemittances: [{ id: "pt1", businessId: "b1", month: "2026-03", amount: 50, date: "2026-04-12" }]
};

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

console.log("journal checks passed");
