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
