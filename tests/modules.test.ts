// Unit tests for module settings. Run: npm run test:unit
import assert from "node:assert/strict";
import { DEFAULT_MODULES, MODULE_INFO, cleanModules } from "../src/lib/modules";

assert.deepEqual(cleanModules(undefined), DEFAULT_MODULES);
const m = cleanModules({ marketplace: { enabled: false, maxPhotos: 500, maxListingsPerUser: "abc", firstListingReview: "no", extra: 1 }, api: { mcp: false }, nope: { enabled: false } });
assert.equal(m.marketplace.enabled, false);
assert.equal(m.marketplace.maxPhotos, 20, "kept within its range");
assert.equal(m.marketplace.maxListingsPerUser, 50, "bad numbers take the default");
assert.equal(m.marketplace.firstListingReview, true, "non-booleans take the default");
assert.equal((m.marketplace as any).extra, undefined, "unknown settings dropped");
assert.equal(m.api.enabled, true); assert.equal(m.api.mcp, false);
assert.equal((m as any).nope, undefined);
for (const id of Object.keys(DEFAULT_MODULES)) assert.ok((MODULE_INFO as any)[id]?.name, `${id} described`);
console.log("module checks passed");
