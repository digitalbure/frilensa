// Unit tests for payroll: PAYE (FRCS Regulation 6) and FNPF. Run: npm run test:unit
import assert from "node:assert/strict";
import {
  DEFAULT_PAYROLL, annualTax, bookkeepingForRun, calcLine, cleanPayroll, employeeYear, employerFnpfRate, endOfNextMonth, payeFor, payrollMonth,
  payrollMonthCsv, periodNumber, runTotals, withoutRunBookkeeping, yearToDate, ytdFor, type Employee, type PayRun
} from "../src/lib/payroll";
import { cleanPlatformConfig } from "../src/lib/platformConfigShared";

// Settings
assert.deepEqual(cleanPayroll(undefined), DEFAULT_PAYROLL);
assert.deepEqual(cleanPlatformConfig({}).payroll, DEFAULT_PAYROLL);
assert.equal(cleanPayroll({ fnpfEmployerTemporary: null }).fnpfEmployerTemporary, null, "temporary rate can be switched off");
assert.deepEqual(cleanPayroll({ fnpfEmployerTemporary: { rate: 7, from: "2027-01-01", to: "2026-01-01" } }).fnpfEmployerTemporary, DEFAULT_PAYROLL.fnpfEmployerTemporary, "bad dates fall back");
assert.equal(cleanPayroll({ fnpfEmployee: 99 }).fnpfEmployee, 8);

// FNPF employer rate by pay date: 10%, then 8% from 1 Aug 2026 to 31 Jul 2027.
assert.equal(employerFnpfRate(DEFAULT_PAYROLL, "2026-07-31"), 10);
assert.equal(employerFnpfRate(DEFAULT_PAYROLL, "2026-08-01"), 8);
assert.equal(employerFnpfRate(DEFAULT_PAYROLL, "2027-07-31"), 8);
assert.equal(employerFnpfRate(DEFAULT_PAYROLL, "2027-08-01"), 10);

// Tax tables (FRCS, 2024 onwards)
assert.equal(annualTax(30000), 0);
assert.equal(annualTax(50000), 3600);
assert.equal(annualTax(270000), 47600);
assert.equal(annualTax(300000), 57500);
assert.equal(annualTax(500000), 128500);
assert.equal(annualTax(1000000), 318500);
assert.equal(annualTax(1100000), 357500);
assert.equal(annualTax(30000, "non_resident"), 6000);
assert.equal(annualTax(300000, "non_resident"), 63900);
assert.equal(annualTax(1000000, "non_resident"), 324900);

// Pay periods
assert.equal(periodNumber("2026-03-31", "monthly"), 3);
assert.equal(periodNumber("2026-01-14", "fortnightly"), 1);
assert.equal(periodNumber("2026-01-15", "fortnightly"), 2);
assert.equal(periodNumber("2026-12-31", "weekly"), 52);
assert.equal(periodNumber("2026-12-31", "fortnightly"), 26);

// Regulation 6: a steady monthly salary is taxed evenly and adds up to the year's tax.
const base = { taxCode: "P" as const, residency: "resident" as const, frequency: "monthly" as const, extraPay: 0 };
let ytd = { normal: 0, extra: 0, paye: 0 };
let total = 0;
for (let m = 1; m <= 12; m++) {
  const payDate = `2026-${String(m).padStart(2, "0")}-28`;
  const extra = m === 3 ? 1000 : 0;
  const tax = payeFor({ ...base, payDate, normalPay: 5000, extraPay: extra }, ytd);
  if (m === 1) assert.equal(tax, 466.67);
  if (m === 3) assert.equal(tax, 666.67, "bonus taxed at the marginal rate (20% of 1,000) on top");
  ytd = { normal: ytd.normal + 5000, extra: ytd.extra + extra, paye: ytd.paye + tax };
  total += tax;
}
assert.ok(Math.abs(total - annualTax(61000)) < 0.05, `year's PAYE ${total} matches the tax on 61,000`);

// A mid-year starter: the year still adds up.
ytd = { normal: 0, extra: 0, paye: 0 }; total = 0;
for (let m = 7; m <= 12; m++) {
  const tax = payeFor({ ...base, payDate: `2026-${String(m).padStart(2, "0")}-28`, normalPay: 10000 }, ytd);
  ytd = { normal: ytd.normal + 10000, extra: 0, paye: ytd.paye + tax }; total += tax;
}
assert.ok(Math.abs(total - annualTax(60000)) < 0.05, `starter's PAYE ${total} matches the tax on 60,000`);

// Under the threshold: nothing. Secondary job / no declaration: 20%. Non-resident: their table.
assert.equal(payeFor({ ...base, frequency: "fortnightly", payDate: "2026-05-10", normalPay: 1000 }, { normal: 0, extra: 0, paye: 0 }), 0);
assert.equal(payeFor({ ...base, taxCode: "S", payDate: "2026-05-10", normalPay: 1000 }, { normal: 0, extra: 0, paye: 0 }), 200);
assert.equal(payeFor({ ...base, taxCode: "N", payDate: "2026-05-10", normalPay: 900, extraPay: 100 }, { normal: 0, extra: 0, paye: 0 }), 200);
assert.equal(payeFor({ ...base, residency: "non_resident", payDate: "2026-01-31", normalPay: 2000 }, { normal: 0, extra: 0, paye: 0 }), 400);

// A pay line: FNPF on gross pay, reimbursements untaxed, net pay.
const emp: Employee = { id: "e1", businessId: "b1", name: "Mere", tin: "T1", fnpfNumber: "F1", taxCode: "P", residency: "resident", frequency: "monthly", payType: "salary", rate: 5000, fnpf: true, startDate: "2026-01-01", createdAt: "" };
let line = calcLine(emp, { normalPay: 5000, extraPay: 0, reimbursements: 120, otherDeductions: 50 }, { frequency: "monthly", payDate: "2026-07-28" }, { normal: 30000, extra: 0, paye: 2800 });
assert.equal(line.gross, 5000); assert.equal(line.paye, 466.67); assert.equal(line.fnpfEmployee, 400); assert.equal(line.fnpfEmployer, 500, "10% before August 2026");
assert.equal(line.net, 5000 + 120 - 466.67 - 400 - 50);
line = calcLine(emp, { normalPay: 5000, extraPay: 0, reimbursements: 0, otherDeductions: 0 }, { frequency: "monthly", payDate: "2026-08-28" }, { normal: 35000, extra: 0, paye: 3266.67 });
assert.equal(line.fnpfEmployer, 400, "8% from August 2026");
assert.equal(calcLine({ ...emp, employerTopUp: 2 }, { normalPay: 5000, extraPay: 0, reimbursements: 0, otherDeductions: 0 }, { frequency: "monthly", payDate: "2026-08-28" }, { normal: 0, extra: 0, paye: 0 }).fnpfEmployer, 500, "voluntary top-up to 10%");
assert.equal(calcLine({ ...emp, employerTopUp: 5 }, { normalPay: 5000, extraPay: 0, reimbursements: 0, otherDeductions: 0 }, { frequency: "monthly", payDate: "2026-08-28" }, { normal: 0, extra: 0, paye: 0 }).fnpfEmployer, 500, "top-up capped at 10% in all");
assert.equal(calcLine({ ...emp, fnpf: false }, { normalPay: 5000, extraPay: 0, reimbursements: 0, otherDeductions: 0 }, { frequency: "monthly", payDate: "2026-08-28" }, { normal: 0, extra: 0, paye: 0 }).fnpfEmployee, 0);

// Runs, year to date, monthly totals and bookkeeping
const mk = (id: string, payDate: string, status: PayRun["status"], ytdIn = { normal: 0, extra: 0, paye: 0 }): PayRun => ({
  id, businessId: "b1", frequency: "monthly", periodStart: `${payDate.slice(0, 7)}-01`, periodEnd: payDate, payDate, status, createdAt: "",
  lines: [calcLine(emp, { normalPay: 5000, extraPay: 0, reimbursements: 100, otherDeductions: 0 }, { frequency: "monthly", payDate }, ytdIn)]
});
const r1 = mk("r1", "2026-01-28", "paid");
const r2 = mk("r2", "2026-02-27", "paid", yearToDate([r1], "e1", "2026-02-27"));
const draft = mk("r3", "2026-03-27", "draft");
const other = { ...mk("r9", "2026-02-27", "paid"), businessId: "b2" };
const runs = [r1, r2, draft, other];
const y = yearToDate([r1, r2, draft], "e1", "2026-03-27");
assert.equal(y.normal, 10000, "drafts don't count"); assert.equal(y.paye, 933.33, "rounding evens out over the year");
assert.equal(yearToDate([r1, r2], "e1", "2026-02-27", "r2").normal, 5000, "the run itself is left out");
assert.equal(yearToDate([r1], "e1", "2027-01-28").normal, 0, "a new tax year starts from nothing");

const feb = payrollMonth(runs, "b1", "2026-02");
assert.equal(feb.rows.length, 1); assert.equal(feb.paye, 466.66); assert.equal(feb.fnpfEmployee, 400); assert.equal(feb.fnpfEmployer, 500);
assert.equal(feb.payeDue, "2026-03-31"); assert.equal(feb.fnpfScheduleDue, "2026-03-14");
assert.match(payrollMonthCsv(feb), /Mere,T1,F1,5000.00,466.66,400.00,500.00,900.00/);
assert.equal(endOfNextMonth("2026-12-05"), "2027-01-31");

const t = runTotals(r1);
assert.equal(t.net, 5000 + 100 - 466.67 - 400);
const books = bookkeepingForRun(r1);
assert.equal(books.expenses.length, 2);
assert.equal(books.expenses[0].amount, 5100, "wages and reimbursements"); assert.equal(books.expenses[1].amount, 500, "employer FNPF");
assert.equal(books.transactions[0].amount, -5100);
const after = withoutRunBookkeeping({ expenses: [...books.expenses, { id: "x" } as any], transactions: books.transactions }, { ...r1, expenseIds: books.expenses.map(e => e.id) });
assert.deepEqual(after.expenses.map(e => e.id), ["x"]); assert.equal(after.transactions.length, 0);

const year = employeeYear(runs.filter(r => r.businessId === "b1"), "e1", "2026");
assert.equal(year.pays.length, 2); assert.equal(year.gross, 10000); assert.equal(year.paye, 933.33);

// Opening figures from before Frilensa count for their tax year only.
const withOpening = { ...emp, openingYtd: { year: "2026", normal: 50000, extra: 0, paye: 4666.67, fnpfEmployee: 4000 } };
const yo = ytdFor([r1], withOpening, "2026-11-28");
assert.equal(yo.normal, 55000); assert.equal(yo.paye, 5133.34);
assert.equal(ytdFor([], withOpening, "2027-01-28").normal, 0);
// With the opening figures, November's PAYE is the normal monthly amount.
assert.equal(payeFor({ ...base, payDate: "2026-11-28", normalPay: 5000 }, { normal: 50000, extra: 0, paye: 4666.67 }), 466.66);

console.log("payroll checks passed");
