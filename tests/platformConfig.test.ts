// Unit tests for the platform-wide plans, taxes and fees. Run: npm run test:unit
import assert from "node:assert/strict";
import { DEFAULT_PLATFORM_CONFIG, annualPrice, canListInDirectory, applyPlatformConfig, cleanPlatformConfig, planHighlights } from "../src/lib/platformConfigShared";

// Anything missing or wrong falls back to the defaults; values are tidied.
const clean = cleanPlatformConfig({
  plans: { pro: { name: "  Pro  ", price: "29.999", limits: { maxClients: "-5", maxInvoicesPerMonth: 1e12 }, features: { allowClientPortal: false, allowMultiCurrency: "yes" }, badgeColor: "red" } },
  platformTaxes: [
    { id: "ptax-vat", name: "VAT", rate: 15, rateType: "percentage", isDefault: true, category: "vat" },
    { id: "ptax-vat", name: "Duplicate id", rate: 150, rateType: "percentage", category: "nope" },
    { name: "" },
    null
  ],
  platformFees: [],
  defaultVatRate: 15
});
assert.equal(clean.plans.pro.name, "Pro");
assert.equal(clean.plans.pro.price, 30);
assert.equal(clean.plans.pro.limits.maxClients, -1, "negative means unlimited");
assert.equal(clean.plans.pro.limits.maxInvoicesPerMonth, 1_000_000);
assert.equal(clean.plans.pro.limits.maxServices, DEFAULT_PLATFORM_CONFIG.plans.pro.limits.maxServices);
assert.equal(clean.plans.pro.features.allowClientPortal, false);
assert.equal(clean.plans.pro.features.allowMultiCurrency, DEFAULT_PLATFORM_CONFIG.plans.pro.features.allowMultiCurrency, "non-booleans ignored");
assert.equal(clean.plans.pro.badgeColor, DEFAULT_PLATFORM_CONFIG.plans.pro.badgeColor);
assert.deepEqual(clean.plans.free, DEFAULT_PLATFORM_CONFIG.plans.free);
assert.equal(clean.platformTaxes.length, 2, "unnamed and empty entries dropped");
assert.notEqual(clean.platformTaxes[1].id, "ptax-vat", "duplicate ids replaced");
assert.equal(clean.platformTaxes[1].rate, 100, "percentages capped at 100");
assert.equal(clean.platformTaxes[1].category, "custom");
assert.equal(clean.platformTaxes[0].scope, "platform");
assert.deepEqual(clean.platformFees, []);
assert.equal(clean.defaultVatRate, 15);
assert.deepEqual(cleanPlatformConfig(undefined), DEFAULT_PLATFORM_CONFIG);

// Applying keeps the account's own plan choice and VAT rate.
const ws: any = { userProfile: { defaultVatRate: 9 }, platformSettings: { activePlan: "pro", defaultInactivityTimeoutMinutes: 30, plans: {} }, platformTaxes: [], platformFees: [{ id: "old" }] };
const applied: any = applyPlatformConfig(ws, clean);
assert.equal(applied.platformSettings.activePlan, "pro");
assert.equal(applied.platformSettings.defaultInactivityTimeoutMinutes, 30);
assert.equal(applied.platformSettings.plans.pro.name, "Pro");
assert.equal(applied.platformTaxes[0].rate, 15);
assert.deepEqual(applied.platformFees, []);
assert.equal(applied.userProfile.defaultVatRate, 9);
assert.equal(applyPlatformConfig(ws, null), ws, "nothing published: the workspace keeps its own copy");

// Plan picker text.
assert.equal(annualPrice(25), 240);
const free = planHighlights(DEFAULT_PLATFORM_CONFIG.plans.free);
assert.ok(free.includes("Up to 5 invoices a month") && free.includes("1 business profile"));
assert.ok(planHighlights(DEFAULT_PLATFORM_CONFIG.plans.premium).includes("Unlimited clients"));

// Directory switches.
assert.deepEqual(clean.directory, { enabled: true, paidOnly: true }, "defaults when not sent");
assert.deepEqual(cleanPlatformConfig({ directory: { enabled: false, paidOnly: "no" } }).directory, { enabled: false, paidOnly: true });
assert.equal(canListInDirectory({ enabled: true, paidOnly: true }, "free"), false);
assert.equal(canListInDirectory({ enabled: true, paidOnly: true }, "pro"), true);
assert.equal(canListInDirectory({ enabled: true, paidOnly: false }, undefined), true);
assert.equal(canListInDirectory({ enabled: false, paidOnly: false }, "premium"), false);

console.log("platformConfig tests passed");
