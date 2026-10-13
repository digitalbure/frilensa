// Unit tests for the split workspace storage (head + one record per item). Run: npm run test:unit
import assert from "node:assert/strict";
import { assembleWorkspace, planListWrite, recordDocId, recordIds, stableJson } from "../src/lib/workspaceRecords";

// Stable JSON ignores key order and undefined fields.
assert.equal(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } }), stableJson({ a: { d: [1, { x: 1, y: 2 }] }, b: 1 }));

// Ids Firestore can't take as document ids are encoded.
assert.equal(recordDocId("inv-1"), "inv-1");
assert.equal(recordDocId("a/b"), "a%2Fb");
assert.equal(recordDocId(".."), "id_..");
assert.equal(recordDocId("__x__"), "id___x__");

// An old workspace with arrays in the head is returned as it was.
const legacy = { userProfile: { name: "A" }, documents: [{ id: "d2" }, { id: "d1" }], clients: [{ id: "c1" }] };
assert.deepEqual(assembleWorkspace(legacy, {}).documents, [{ id: "d2" }, { id: "d1" }]);

// Records replace the head arrays, in the stored order; the order field isn't passed on.
const head = { recordOrder: { documents: ["d3", "d1", "d2"] } };
const ws = assembleWorkspace(head, { documents: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] });
assert.deepEqual(ws.documents.map((d: any) => d.id), ["d3", "d1", "d2"]);
assert.equal(ws.recordOrder, undefined);
assert.deepEqual(ws.clients, []);

// Mixed (a tab on an older build saved arrays after the move): newer updatedAt wins, records on a tie,
// and items only in one place are kept.
const mixed = assembleWorkspace(
  { documents: [{ id: "d1", v: "head", updatedAt: "2026-10-02" }, { id: "d2", v: "head", updatedAt: "2026-10-01" }, { id: "d4", v: "head" }], recordOrder: { documents: ["d2", "d1", "d3"] } },
  { documents: [{ id: "d1", v: "rec", updatedAt: "2026-10-01" }, { id: "d2", v: "rec", updatedAt: "2026-10-01" }, { id: "d3", v: "rec" }] }
);
assert.deepEqual(mixed.documents.map((d: any) => `${d.id}:${d.v}`), ["d2:rec", "d1:head", "d3:rec", "d4:head"]);

// Writes: only changed items, deletes limited to what the caller may remove.
const stored = new Map([["c1", stableJson({ id: "c1", name: "One" })], ["c2", stableJson({ id: "c2", name: "Two" })], ["c9", stableJson({ id: "c9" })]]);
const items = [{ id: "c1", name: "One" }, { id: "c2", name: "Two!" }, { id: "c3", name: "New", note: undefined }];
const serverPlan = planListWrite(items, stored, "all");
assert.deepEqual(serverPlan.sets.map(w => w.docId), ["c2", "c3"]);
assert.equal("note" in serverPlan.sets[1].data, false, "undefined fields are removed");
assert.deepEqual(serverPlan.deletes, ["c9"]);
assert.deepEqual(serverPlan.order, ["c1", "c2", "c3"]);
// A device that never had c9 (someone else added it) doesn't delete it.
assert.deepEqual(planListWrite(items, stored, new Set(["c1", "c2"])).deletes, []);
assert.deepEqual(planListWrite(items, stored, new Set(["c9"])).deletes, ["c9"]);
// Duplicates and items without ids are skipped.
assert.deepEqual(planListWrite([{ id: "x" }, { id: "x", v: 2 }, { name: "no id" }], new Map(), "all").order, ["x"]);
assert.deepEqual([...recordIds([{ id: "a/b" }, {}])], ["a%2Fb"]);

// Oversized items drop their heavy attachments; if still too big they're skipped and reported.
const big = "x".repeat(950_000);
const fit = planListWrite([{ id: "d", pdfDataUrl: big, total: 5 }], new Map(), "all");
assert.equal(fit.sets[0].data.pdfDataUrl, undefined); assert.equal(fit.sets[0].data.total, 5);
const skipped: string[] = [];
const none = planListWrite([{ id: "n", notes: big }], new Map(), "all", id => skipped.push(id));
assert.equal(none.sets.length, 0); assert.deepEqual(skipped, ["n"]); assert.deepEqual(none.order, ["n"]);

console.log("workspace record checks passed");
