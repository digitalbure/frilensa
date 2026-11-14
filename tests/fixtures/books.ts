// A sample year of books for the journal and report tests: three accounts and every kind of record.
import { cleanAccount } from "../../src/lib/accounts";
import { applyConfirmedPayment } from "../../src/lib/payments";
import { billTransactions } from "../../src/lib/bills";

export function sampleBooks() {
  const anz = cleanAccount({ name: "ANZ Business", kind: "bank", institution: "ANZ Fiji", openingBalance: 5000, openingDate: "2026-01-01", matchWords: ["ANZ", "Bank Transfer"], isDefault: true, businessId: "b1" }) as any;
  const mp = cleanAccount({ name: "M-PAiSA", kind: "mobile", openingBalance: 0, openingDate: "2026-01-01", matchWords: ["M-PAiSA"], businessId: "b1" }) as any;
  const card = cleanAccount({ name: "Westpac card", kind: "card", openingBalance: -1200, openingDate: "2026-01-01", matchWords: ["Credit Card"], businessId: "b1" }) as any;
  const accts = [anz, mp, card];
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
  return { data, anz, mp, card, accts };
}
