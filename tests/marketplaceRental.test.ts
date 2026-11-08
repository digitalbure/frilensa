// Unit tests for marketplace rentals: options, periods, prices, deposits and availability. Run: npm run test:unit
import assert from "node:assert/strict";
import { DEFAULT_RENTAL, availableFor, cleanRental, hirePeriods, quoteRental, usedByDay, type RentalOptions } from "../src/lib/marketplaceRental";

// Options are tidied; nonsense is refused.
assert.equal(cleanRental({ hire: { dry: false, wet: false } }), "Offer dry hire, wet hire or both.");
assert.equal(cleanRental({ deposit: { kind: "bond", amount: 0 } }), "Enter the deposit amount, or choose no deposit.");
assert.equal(cleanRental({ hours: { open: "17:00", close: "08:00" } }), "Closing time must be after opening time.");
const opts = cleanRental({
  quantity: 3, minHire: 2,
  deposit: { kind: "bond", type: "fixed", amount: 500 },
  included: ["Kit lens 28-70mm", "", "2 batteries"],
  addOns: [{ id: "sd", name: "128GB SD card", price: 10, per: "booking", max: 4 }, { id: "lens", name: "85mm lens", price: 40, per: "period", max: 1 }, { id: "bag", name: "Bag", price: 0 }, { name: "" }],
  hire: { dry: true, wet: true, wetRate: 120, wetNote: "Operator included" },
  places: [{ id: "suva", name: "Suva studio", address: "Waimanu Rd" }, { id: "nadi", name: "Nadi depot" }],
  returnElsewhere: true,
  delivery: { offered: true, fee: 35 }
}) as RentalOptions;
assert.equal(typeof opts, "object");
assert.deepEqual(opts.included, ["Kit lens 28-70mm", "2 batteries"]);
assert.equal(opts.addOns.length, 3, "unnamed add-on dropped");
assert.equal(opts.addOns[2].price, 0);
assert.equal(opts.returnElsewhere, true);
assert.equal((cleanRental({ places: [{ name: "Only one" }], returnElsewhere: true }) as RentalOptions).returnElsewhere, false, "needs two places");

// Hire periods.
assert.equal(hirePeriods("day", "2026-12-01", "2026-12-01"), 1);
assert.equal(hirePeriods("day", "2026-12-01", "2026-12-03"), 3, "inclusive days without times");
assert.equal(hirePeriods("day", "2026-12-01", "2026-12-03", "09:00", "09:00"), 2, "24-hour days with times");
assert.equal(hirePeriods("day", "2026-12-01", "2026-12-03", "09:00", "10:00"), 3, "an hour late is another day");
assert.equal(hirePeriods("hour", "2026-12-01", "2026-12-01", "09:00", "12:30"), 4);
assert.equal(hirePeriods("week", "2026-12-01", "2026-12-10"), 2);
assert.equal(hirePeriods("day", "2026-12-01", "2026-12-01", "", "", 3), 3, "minimum hire");

// A full quote: 2 cameras, 3 days, wet hire, add-ons, delivery, bond.
const camera = { title: "Sony FX3", category: "cameras", rent: { amount: 150, unit: "day" }, rental: opts };
const q = quoteRental(camera, { from: "2026-12-01", to: "2026-12-03", quantity: 2, hire: "wet", addOns: { sd: 2, lens: 1, bag: 1 }, pickup: "delivery", deliveryAddress: "12 Main St, Lami" }, "2026-11-08");
assert.ok(typeof q !== "string", String(q));
if (typeof q !== "string") {
  assert.equal(q.periods, 3);
  assert.deepEqual(q.lines.map(l => l.amount), [900, 720, 20, 120, 0, 35]);
  assert.equal(q.total, 1795);
  assert.equal(q.deposit.amount, 500); assert.equal(q.deposit.kind, "bond");
  assert.equal(q.pickup.kind, "delivery"); assert.equal(q.returnTo, null);
  assert.deepEqual(q.included, ["Kit lens 28-70mm", "2 batteries"]);
}
// Percent deposit up front; pick-up and return at different places.
const pct = { ...camera, rental: { ...opts, deposit: { kind: "upfront" as const, type: "percent" as const, amount: 25 } } };
const q2 = quoteRental(pct, { from: "2026-12-01", to: "2026-12-02", pickup: "suva", returnTo: "nadi" });
assert.ok(typeof q2 !== "string");
if (typeof q2 !== "string") { assert.equal(q2.total, 300); assert.equal(q2.deposit.amount, 75); assert.equal(q2.returnTo?.name, "Nadi depot"); }
// Mistakes.
const bad = (r: any, msg: RegExp) => { const x = quoteRental(camera, { from: "2026-12-01", to: "2026-12-02", pickup: "suva", ...r }, "2026-11-08"); assert.ok(typeof x === "string" && msg.test(x), `${JSON.stringify(r)} → ${JSON.stringify(x)}`); };
bad({ to: "2026-11-30" }, /dates/);
bad({ from: "2026-11-01", to: "2026-11-02" }, /today/);
bad({ quantity: 4 }, /Only 3/);
bad({ addOns: { sd: 5 } }, /up to 4/);
bad({ addOns: { nope: 1 } }, /no longer offered/);
bad({ pickup: "delivery" }, /delivery address/);
bad({ pickup: "x" }, /pick it up/);
bad({ pickupTime: "06:00" }, /between 08:00 and 17:00/);
assert.match(String(quoteRental({ ...camera, rental: DEFAULT_RENTAL }, { from: "2026-12-01", to: "2026-12-01", hire: "wet" })), /isn't offered/);
assert.match(String(quoteRental({ ...camera, rent: { amount: 20, unit: "hour" }, rental: DEFAULT_RENTAL }, { from: "2026-12-01", to: "2026-12-01" })), /times/);
// Vehicles read as self-drive / with driver.
assert.match(String(quoteRental({ title: "Hilux", category: "cars", rent: { amount: 120, unit: "day" }, rental: DEFAULT_RENTAL }, { from: "2026-12-01", to: "2026-12-01", hire: "wet" })), /With driver/);

// Availability: confirmed bookings and blocks count; cancelled ones don't.
const holds = [
  { from: "2026-12-01", to: "2026-12-03", quantity: 2 },
  { from: "2026-12-03", to: "2026-12-04", quantity: 1 },
  { from: "2026-12-02", to: "2026-12-02", quantity: 3, status: "cancelled" }
];
assert.deepEqual(usedByDay(holds), { "2026-12-01": 2, "2026-12-02": 2, "2026-12-03": 3, "2026-12-04": 1 });
assert.equal(availableFor(3, holds, "2026-12-01", "2026-12-02"), 1);
assert.equal(availableFor(3, holds, "2026-12-02", "2026-12-04"), 0);
assert.equal(availableFor(3, holds, "2026-12-05", "2026-12-06"), 3);

console.log("marketplace rental checks passed");
