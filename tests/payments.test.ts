// Unit tests for payment confirmation and automatic receipts. Run: npm run test:unit
import assert from "node:assert/strict";
import { applyConfirmedPayment, addReceiptForInvoice } from "../src/lib/payments";
const inv: any = { id: "inv1", type: "invoice", documentNumber: "INV-2026-1004", businessId: "b1", clientId: "c1", currency: "FJD",
  issueDate: "2026-10-01", items: [{ id: "i", name: "Design", quantity: 1, rate: 100, total: 100 }], subtotal: 100, vatRate: 12.5, vatAmount: 12.5, total: 112.5,
  status: "sent", shareToken: "INVOICE_TOKEN_aaaaaaaaaa", emailHistory: [{ sentAt: "x" }], clientPaymentReport: { method: "M-PAiSA", reference: "R1", reportedAt: "y", status: "confirmed" } };
const data: any = { businesses: [{ id: "b1", receiptPrefix: "REC", receiptStartNumber: 1000 }], activeBusinessId: "b1", userProfile: { defaultCurrency: "FJD" },
  clients: [], documents: [inv, { id: "r0", type: "receipt", businessId: "b1", documentNumber: "REC-2026-1000" }], transactions: [] };
const paid = applyConfirmedPayment(data, "inv1", { paymentMethod: "Vodafone M-PAiSA", paymentDate: "2026-10-10" });
assert.equal(paid.documents.find((d: any) => d.id === "inv1").status, "paid");
assert.equal(paid.transactions.length, 1, "bookkeeping transaction logged");
const { data: next, receipt } = addReceiptForInvoice(paid, "inv1", { paymentMethod: "Vodafone M-PAiSA", paymentDate: "2026-10-10" });
assert.ok(receipt);
assert.equal(receipt!.type, "receipt");
assert.equal(receipt!.documentNumber, `REC-${new Date().getFullYear()}-1001`, "next number in the receipt series");
assert.equal(receipt!.total, 112.5);
assert.equal(receipt!.paymentMethod, "Vodafone M-PAiSA");
assert.equal(receipt!.issueDate, "2026-10-10");
assert.equal(receipt!.originalInvoiceId, "inv1");
assert.notEqual(receipt!.shareToken, inv.shareToken, "receipt has its own link");
assert.ok(/^[A-Za-z0-9_-]{16,64}$/.test(receipt!.shareToken!), "share token format accepted by the server");
assert.equal((receipt as any).emailHistory, undefined, "invoice email history not copied");
assert.equal((receipt as any).clientPaymentReport, undefined, "payment report not copied");
assert.equal(next.documents.find((d: any) => d.id === "inv1").receiptId, receipt!.id, "invoice linked to receipt");
const again = addReceiptForInvoice(next, "inv1");
assert.equal(again.data.documents.length, next.documents.length, "confirming twice doesn't create a second receipt");
assert.equal(again.receipt!.id, receipt!.id);
console.log("receipt checks passed");

// Part payments go into the ledger as they're received; the final payment logs only the rest.
{
  const { applyPartialPayment } = await import("../src/lib/payments");
  const { recalcDocumentTotals } = await import("../src/lib/invoiceTotals");
  const base: any = {
    userProfile: { defaultCurrency: "FJD" }, activeBusinessId: "b1", businesses: [{ id: "b1" }], transactions: [],
    documents: [{ id: "p1", type: "invoice", documentNumber: "INV-1", businessId: "b1", clientId: "c1", total: 1000, subtotal: 1000, vatRate: 0, vatAmount: 0, status: "sent", items: [] }]
  };
  let d = applyPartialPayment(base, "p1", { amountSoFar: 300, paymentMethod: "Bank Transfer", paymentDate: "2026-10-01" });
  assert.equal(d.transactions!.length, 1); assert.equal(d.transactions![0].amount, 300);
  d = applyPartialPayment(d, "p1", { amountSoFar: 500, paymentMethod: "Bank Transfer", paymentDate: "2026-10-05" });
  assert.equal(d.transactions!.length, 2); assert.equal(d.transactions![0].amount, 200, "only the new money");
  d = applyPartialPayment(d, "p1", { amountSoFar: 450, paymentMethod: "Bank Transfer", paymentDate: "2026-10-05" });
  assert.equal(d.transactions![0].amount, -50, "correcting down logs a negative entry");
  const doc = d.documents.find((x: any) => x.id === "p1")!;
  assert.equal(doc.status, "partial"); assert.equal(doc.partiallyPaidAmount, 450); assert.equal(doc.partialLoggedAmount, 450);
  const paid = applyConfirmedPayment(d, "p1", { paymentMethod: "Bank Transfer", paymentDate: "2026-10-09", paidAmountForeign: 1000 } as any);
  assert.equal(paid.transactions![0].amount, 550, "final payment logs the balance");
  assert.equal(paid.transactions!.reduce((s: number, t: any) => s + t.amount, 0), 1000, "ledger adds up to the invoice");
  // An invoice partly paid before this change (nothing logged) still logs the full amount.
  const old: any = { ...base, documents: [{ ...base.documents[0], status: "partial", partiallyPaidAmount: 400 }] };
  assert.equal(applyConfirmedPayment(old, "p1", { paymentMethod: "Cash", paidAmountForeign: 1000 } as any).transactions![0].amount, 1000);

  // Totals after adding lines keep taxes and fees, re-applying percentages to the taxable base.
  const t = recalcDocumentTotals({ vatRate: 12.5, items: [], appliedTaxes: [{ id: "ptax-1", name: "VAT", type: "tax", rate: 12.5, rateType: "percentage", amount: 0 }], appliedFees: [{ id: "f", name: "Fee", type: "fee", rate: 10, rateType: "flat", amount: 10 }] } as any,
    [{ id: "a", name: "A", quantity: 2, rate: 100, total: 200 }, { id: "r", name: "Taxi", quantity: 1, rate: 40, total: 40, kind: "reimbursement" } as any]);
  assert.equal(t.subtotal, 240); assert.equal(t.vatAmount, 25); assert.equal(t.total, 275);
  const off = recalcDocumentTotals({ vatRate: 12.5, items: [] } as any, [{ id: "a", name: "A", quantity: 1, rate: 100, total: 100 }], true);
  assert.equal(off.vatAmount, 0); assert.equal(off.total, 100);
  console.log("part payment and totals checks passed");
}

// Pay now: FJD invoices are charged in NZD unless the business picks another currency.
{
  const { paypalQuote } = await import("../src/lib/payNow");
  const inv: any = { total: 300, status: "sent", currency: "FJD" };
  const q = paypalQuote(inv, { customExchangeRates: { NZD: 1.25 } } as any, "FJD")!;
  assert.equal(q.currency, "NZD"); assert.equal(q.rate, 1.25); assert.equal(q.amount, 240); assert.equal(q.total, 240);
  assert.equal(paypalQuote(inv, { payNow: { paypalCurrency: "USD", surchargePercent: 5 } } as any, "FJD")!.currency, "USD");
  assert.equal(paypalQuote({ ...inv, currency: "AUD" }, {} as any, "FJD")!.currency, "AUD", "PayPal currencies are charged as they are");
  assert.equal(paypalQuote({ ...inv, status: "partial", partiallyPaidAmount: 100 }, { customExchangeRates: { NZD: 1.25 } } as any, "FJD")!.amount, 160, "only the balance");
  assert.equal(paypalQuote({ ...inv, status: "paid" }, {} as any, "FJD"), null);
  console.log("pay now quote checks passed");
}
