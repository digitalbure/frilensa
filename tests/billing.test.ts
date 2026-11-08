// Unit tests for paid plans. Run: npm run test:unit
import assert from "node:assert/strict";
import { DEFAULT_BILLING, cleanBilling, daysLeft, effectivePlan, limitProblem, paypalCharge, periodEnd, planPrice, usageOf, type Subscription } from "../src/lib/billing";
import { DEFAULT_PLATFORM_CONFIG } from "../src/lib/platformConfigShared";

// Periods: a month (or year) less a day, month ends handled.
assert.equal(periodEnd("2026-11-08", "monthly"), "2026-12-07");
assert.equal(periodEnd("2026-01-31", "monthly"), "2026-02-27");
assert.equal(periodEnd("2026-12-15", "monthly"), "2027-01-14");
assert.equal(periodEnd("2026-11-08", "annual"), "2027-11-07");

const on = { ...DEFAULT_BILLING, enabled: true, graceDays: 7 };
const sub = (s: Partial<Subscription>): Subscription => ({ uid: "u", plan: "pro", status: "active", method: "paypal", paidUntil: "2026-12-07", updatedAt: "", ...s });
// Billing off: whatever was chosen (early access), including the old workspace copy.
assert.equal(effectivePlan(null, "premium", DEFAULT_BILLING, "2026-11-08"), "premium");
assert.equal(effectivePlan(sub({ method: "early_access", paidUntil: "" }), "free", DEFAULT_BILLING, "2030-01-01"), "pro");
// Billing on: paid time plus grace days.
assert.equal(effectivePlan(sub({}), "free", on, "2026-12-07"), "pro");
assert.equal(effectivePlan(sub({}), "free", on, "2026-12-14"), "pro", "grace");
assert.equal(effectivePlan(sub({}), "free", on, "2026-12-15"), "free", "lapsed");
assert.equal(effectivePlan(sub({ status: "expired" }), "pro", on, "2026-11-08"), "free");
assert.equal(effectivePlan(sub({ method: "admin", paidUntil: "" }), "free", on, "2030-01-01"), "pro", "open-ended grant");
// Early access ends on the set date (or straight away without one); the workspace copy can't fake a plan.
assert.equal(effectivePlan(null, "premium", { ...on, earlyAccessUntil: "2026-12-31" }, "2026-12-31"), "premium");
assert.equal(effectivePlan(null, "premium", { ...on, earlyAccessUntil: "2026-12-31" }, "2027-01-01"), "free");
assert.equal(effectivePlan(sub({ method: "early_access", paidUntil: "" }), "free", on, "2026-11-08"), "free");
assert.equal(daysLeft(sub({}), "2026-12-01"), 6);

// Prices and PayPal charges.
const pro = DEFAULT_PLATFORM_CONFIG.plans.pro;
assert.equal(planPrice(pro, "monthly"), 25); assert.equal(planPrice(pro, "annual"), 240);
assert.equal(paypalCharge(25, { ...on, paypalRate: 0.66 }), 16.5);
assert.equal(cleanBilling({ paypalCurrency: "FJD", paypalRate: -1, graceDays: 500 }).paypalCurrency, "AUD");
assert.equal(cleanBilling({ graceDays: 500 }).graceDays, 60);

// Limits: -1 is unlimited; the message names the plan and the limit.
const free = DEFAULT_PLATFORM_CONFIG.plans.free;
assert.equal(limitProblem(free, "clients", 2), null);
assert.match(limitProblem(free, "clients", 3)!, /Free Starter plan includes 3 clients/);
assert.match(limitProblem(free, "invoices", 5)!, /5 invoices a month/);
assert.equal(limitProblem(DEFAULT_PLATFORM_CONFIG.plans.premium, "clients", 10_000), null);
const usage = usageOf({ documents: [{ type: "invoice", issueDate: "2026-11-02" }, { type: "invoice", issueDate: "2026-10-30" }, { type: "quote", issueDate: "2026-11-02" }] as any, clients: [{}, {}] as any, services: [], businesses: [{}] as any, projects: [] }, "2026-11");
assert.deepEqual(usage, { invoices: 1, clients: 2, services: 0, businesses: 1, projects: 0 });

console.log("billing checks passed");
