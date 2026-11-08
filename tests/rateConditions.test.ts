// Unit tests for rate conditions and listing rate options. Run: npm run test:unit
import assert from "node:assert/strict";
import { draftQuoteFromRequest } from "../src/lib/quoteRequests";
import { CONDITION_TEMPLATES, cleanConditionRates, cleanConditions, cleanPriceOptions, partsLabel, priceFor } from "../src/lib/rateConditions";

const conds = cleanConditions([
  { id: "local", name: "Local production", currency: "FJD" },
  { id: "intl", name: "International production in Fiji", description: "Overseas crew hiring locally", currency: "fjd" },
  { id: "os", name: "Overseas work", currency: "AUD", noVat: true },
  { id: "os", name: "Duplicate id" },
  { id: "x", name: "" },
  { id: "bad", name: "Bad currency", currency: "AUSTRALIA" }
], "FJD");
assert.deepEqual(conds.map(c => [c.id, c.currency, !!c.noVat]), [["local", "FJD", false], ["intl", "FJD", false], ["os", "AUD", true], ["bad", "FJD", false]]);

const rates = cleanConditionRates([
  { conditionId: "local", rate: 600 },
  { conditionId: "intl", rate: "900" },
  { conditionId: "os", rate: 1, parts: [{ label: "Gear", rate: 400 }, { label: "Labour", rate: 600 }, { label: "", rate: 50 }] },
  { conditionId: "local", rate: 1 },
  { conditionId: "none", rate: 0 }
]);
assert.equal(rates.length, 3, "duplicates and empty rates dropped");
assert.equal(rates[2].rate, 1000, "parts add up to the rate");
assert.equal(rates[2].parts!.length, 2);

const recording = { rate: 650, conditionRates: rates };
assert.deepEqual(priceFor(recording, null, "FJD"), { rate: 650, currency: "FJD", parts: [], condition: null, specific: false });
assert.equal(priceFor(recording, conds[1], "FJD")!.rate, 900);
const os = priceFor(recording, conds[2], "FJD")!;
assert.equal(os.currency, "AUD"); assert.equal(os.rate, 1000); assert.equal(partsLabel(os.parts, os.currency), "AUD 400 gear + AUD 600 labour");
// No rate for a condition: the standard rate in the same currency; price on request in another currency.
const editing = { rate: 80, conditionRates: [] };
assert.deepEqual([priceFor(editing, conds[0], "FJD")!.rate, priceFor(editing, conds[0], "FJD")!.specific], [80, false]);
assert.equal(priceFor(editing, conds[2], "FJD"), null);

// Templates produce valid conditions.
for (const t of CONDITION_TEMPLATES) assert.ok(cleanConditions(t.conditions("FJD").map((c, i) => ({ ...c, id: `t${i}` }))).length >= 3, t.id);

// Listing rate options.
const opts = cleanPriceOptions([
  { label: "Local production", amount: 600, currency: "FJD" },
  { label: "Overseas", currency: "aud", parts: [{ label: "Gear", rate: 400 }, { label: "Labour", rate: 600 }] },
  { label: "No price" },
  { label: "", amount: 5 }
]);
assert.deepEqual(opts.map(o => [o.label, o.amount, o.currency]), [["Local production", 600, "FJD"], ["Overseas", 1000, "AUD"]]);
assert.notEqual(opts[0].id, opts[1].id);

// A quote drafted from a request under a VAT-free condition: no VAT, in that condition's currency.
const ws: any = { userProfile: { defaultVatRate: 12.5, defaultCurrency: "FJD" }, businesses: [{ id: "b1", name: "Studio" }], activeBusinessId: "b1", clients: [], documents: [], activityLogs: [] };
const req: any = { id: "r1", ref: "QR-1", businessId: "b1", businessName: "Studio", name: "Crew", email: "crew@nz.example", phone: "", company: "", message: "", currency: "AUD",
  condition: { id: "os", name: "Overseas work", noVat: true }, items: [{ serviceId: "s1", name: "Recording", unit: "Day", rate: 1000, quantity: 3 }], estimate: 3000, createdAt: "" };
const { doc } = draftQuoteFromRequest(ws, req);
assert.equal(doc.currency, "AUD"); assert.equal(doc.vatRate, 0); assert.equal(doc.total, 3000);
assert.equal(draftQuoteFromRequest(ws, { ...req, condition: undefined, currency: "FJD" }).doc.vatRate, 12.5);

console.log("rate condition checks passed");
