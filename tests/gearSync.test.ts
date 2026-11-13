// Unit tests for gear synced from other apps. Run: npm run test:unit
import assert from "node:assert/strict";
import { changedSinceLinked, cleanGearItem, gearTitle, listingStartFromGear, serviceFromGear, sourceName, sourceSlug, type SyncedGear } from "../src/lib/gearSync";

// Cleaning what another app sends
assert.equal(typeof cleanGearItem({}, ""), "string", "needs an id");
assert.match(cleanGearItem({}, "a1") as string, /name is required/);
const c = cleanGearItem({
  name: "  FX6 Camera Kit ", brand: "Sony", model: "ILME-FX6", quantity: "3", dayRate: "450.555", weekRate: -5, currency: "usd",
  condition: "mint", status: "lost", kit: ["Lens", { name: "Battery", quantity: 4 }, { name: "" }],
  unavailable: [{ from: "2026-12-01", to: "2026-12-03" }, { from: "2026-12-05", to: "2026-12-01" }],
  externalUrl: "javascript:alert(1)", updatedAt: "2026-11-10T10:00:00Z"
}, "a1") as Exclude<ReturnType<typeof cleanGearItem>, string>;
assert.equal(c.name, "FX6 Camera Kit"); assert.equal(c.quantity, 3); assert.equal(c.dayRate, 450.56); assert.equal(c.weekRate, 0);
assert.equal(c.currency, "FJD", "only upper-case ISO codes"); assert.equal(c.condition, ""); assert.equal(c.status, "available");
assert.deepEqual(c.kit, [{ name: "Lens", quantity: 1 }, { name: "Battery", quantity: 4 }]);
assert.equal(c.unavailable.length, 1, "backwards dates dropped"); assert.equal(c.externalUrl, "", "only https links");
assert.equal(c.updatedAt, "2026-11-10T10:00:00.000Z");
assert.equal((cleanGearItem({ name: "x", externalUrl: "https://packer.tools/g/1" }, "b") as any).externalUrl, "https://packer.tools/g/1");

assert.equal(sourceSlug("Packer Tools"), "packer_tools"); assert.equal(sourceSlug(undefined), "packer_tools");
assert.equal(sourceName("packer_tools"), "Packer Tools"); assert.equal(sourceName("kit_hub", "Kit Hub"), "Kit Hub");

const g: SyncedGear = { ...c, id: "g1", source: "packer_tools", sourceName: "Packer Tools", removed: false, syncedAt: "", links: {}, serialNumber: "S1", category: "cameras", replacementValue: 9000, weekRate: 1800 };
assert.equal(gearTitle(g), "Sony FX6 Camera Kit");
assert.equal(gearTitle({ brand: "Sony", name: "Sony FX6" }), "Sony FX6", "brand not repeated");

// To a service
const s = serviceFromGear(g, "b1");
assert.equal(s.name, "Sony FX6 Camera Kit"); assert.equal(s.rate, 450.56); assert.equal(s.unit, "Day"); assert.equal(s.itemType, "equipment_rental");
assert.equal(s.sku, "S1"); assert.equal(s.stockQuantity, 3); assert.equal(s.businessId, "b1");
assert.match(s.description, /Kit: Lens, 4 × Battery\./); assert.match(s.notes!, /Weekly rate USD|Weekly rate FJD/); assert.match(s.notes!, /Synced from Packer Tools/);
// Updating keeps the user's own name, unit and settings
const own = { ...s, name: "FX6 package", unit: "Shoot Day", isTaxable: false, tags: ["fav"] };
const u = serviceFromGear({ ...g, dayRate: 500 }, "b2", own);
assert.equal(u.id, s.id); assert.equal(u.name, "FX6 package"); assert.equal(u.unit, "Shoot Day"); assert.equal(u.isTaxable, false); assert.equal(u.rate, 500);
assert.equal(u.businessId, "b1"); assert.ok(u.tags!.includes("fav") && u.tags!.includes("gear"));

// To a marketplace listing
const l = listingStartFromGear(g);
assert.equal(l.title, "Sony FX6 Camera Kit"); assert.equal(l.rentAmount, "450.56"); assert.equal(l.rentUnit, "day");
assert.deepEqual(l.rental.included, ["Lens", "4 × Battery"]); assert.equal(l.rental.quantity, 3); assert.equal(l.condition, "good");
assert.equal(listingStartFromGear({ ...g, condition: "excellent" }).condition, "like_new");
assert.equal(listingStartFromGear({ ...g, dayRate: 0 }).rentUnit, "week");

// Changes since linking
assert.equal(changedSinceLinked(g), false);
assert.equal(changedSinceLinked({ ...g, links: { serviceId: "s", linkedVersion: "2026-11-01T00:00:00.000Z" } }), true);
assert.equal(changedSinceLinked({ ...g, links: { serviceId: "s", linkedVersion: g.updatedAt } }), false);

assert.equal((cleanGearItem({ name: "x", status: "missing" }, "m") as any).status, "missing");

console.log("gear sync checks passed");
