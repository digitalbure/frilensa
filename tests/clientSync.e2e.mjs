// End-to-end test of the app's workspace sync (src/lib/db.ts) against the Auth + Firestore emulators:
// loading an old single-document workspace, moving it into records on save, writing only what
// changed, and never deleting items this device hasn't seen. Run with: npm run test:e2e
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const P = 'frilensa-e2e', FS = 'http://127.0.0.1:8085', AUTH = 'http://127.0.0.1:9099';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frilensa-sync-')), 'db.mjs');
await build({
  stdin: { contents: "export * from './src/lib/db'; export { auth, signInWithEmailAndPassword } from './tests/shims/firebase';", resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  plugins: [{ name: 'emulator-firebase', setup(b) { b.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: path.join(root, 'tests/shims/firebase.ts') })); } }]
});
const lib = await import(outfile);

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); } };
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const base = `${FS}/v1/projects/${P}/databases/(default)/documents`;
const fsVal = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(fsVal) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
const un = f => 'stringValue' in f ? f.stringValue : 'doubleValue' in f ? f.doubleValue : 'integerValue' in f ? Number(f.integerValue) : 'booleanValue' in f ? f.booleanValue : 'nullValue' in f ? null : 'arrayValue' in f ? (f.arrayValue.values || []).map(un) : 'mapValue' in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, un(x)])) : undefined;
const put = async (p, data) => { const r = await fetch(`${base}/${p}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: fsVal(data).mapValue.fields }) }); if (!r.ok) throw new Error(await r.text()); };
const getRaw = async p => (await fetch(`${base}/${p}`, { headers: owner })).json();
const head = async uid => { const r = await getRaw(`consultants/${uid}`); return un({ mapValue: { fields: r.fields || {} } }); };
const records = async (uid, list) => Object.fromEntries(((await getRaw(`consultants/${uid}/${list}`)).documents || []).map(d => [d.name.split('/').pop(), d.updateTime]));
const wait = ms => new Promise(r => setTimeout(r, ms));

// A verified user in the Auth emulator.
const email = 'sync@studio.fj';
const signUp = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) })).json();
await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts:update`, { method: 'POST', headers: owner, body: JSON.stringify({ localId: signUp.localId, emailVerified: true }) });
const uid = signUp.localId;
await lib.signInWithEmailAndPassword(lib.auth, email, 'secret123');

// An old-style workspace: every list inside the one document.
await put(`consultants/${uid}`, {
  consultantEmail: email, userProfile: { email, name: 'Sync' }, activeBusinessId: 'b1',
  businesses: [{ id: 'b1', name: 'Sync Studio' }],
  clients: [{ id: 'c1', name: 'One', email: 'one@x.fj' }],
  documents: [{ id: 'd2', updatedAt: '2026-10-01T00:00:00.000Z', type: 'invoice', status: 'draft', total: 20.5, clientId: 'c1', businessId: 'b1', items: [{ qty: 1 }] }, { id: 'd1', updatedAt: '2026-10-01T00:00:00.000Z', type: 'invoice', status: 'sent', total: 10, clientId: 'c1', businessId: 'b1', items: [] }],
  recurringInvoices: [{ id: 'r1', status: 'active' }]
});

let data;
await check('loads an old single-document workspace', async () => {
  data = (await lib.loadConsultantData()).data;
  assert.deepEqual(data.documents.map(d => d.id), ['d2', 'd1']);
  assert.equal(data.clients[0].name, 'One');
});

let firstTimes;
await check('first save moves the lists into records and empties the head', async () => {
  await lib.saveConsultantData(data);
  const h = await head(uid);
  for (const list of ['businesses', 'clients', 'documents']) assert.equal(h[list], undefined, `${list} still in head`);
  assert.deepEqual(h.recordOrder.documents, ['d2', 'd1']);
  assert.equal(h.recurringInvoices[0].id, 'r1', 'retainers stay in the head');
  firstTimes = await records(uid, 'documents');
  assert.deepEqual(Object.keys(firstTimes).sort(), ['d1', 'd2']);
  assert.ok((await getRaw(`documents/${uid}_d1`)).fields, 'flat copy written');
});

await check('reload gives the same workspace in the same order', async () => {
  const again = (await lib.loadConsultantData()).data;
  assert.deepEqual(again.documents.map(d => d.id), ['d2', 'd1']);
  assert.equal(again.documents[0].total, 20.5);
  assert.deepEqual(again.documents[0].items, [{ qty: 1 }]);
  data = again;
});

await check('saving unchanged data rewrites no records', async () => {
  await wait(20);
  await lib.saveConsultantData(data);
  assert.deepEqual(await records(uid, 'documents'), firstTimes);
});

await check('only the changed, added and removed items are written', async () => {
  const docs = data.documents.filter(d => d.id !== 'd1').map(d => d.id === 'd2' ? { ...d, status: 'sent' } : d);
  data = { ...data, documents: [{ id: 'd3', type: 'quote', status: 'draft', total: 5, clientId: 'c1', businessId: 'b1', items: [] }, ...docs] };
  await lib.saveConsultantData(data);
  const now = await records(uid, 'documents');
  assert.deepEqual(Object.keys(now).sort(), ['d2', 'd3']);
  assert.notEqual(now.d2, firstTimes.d2);
  assert.deepEqual((await head(uid)).recordOrder.documents, ['d3', 'd2']);
  assert.equal((await getRaw(`documents/${uid}_d1`)).fields, undefined, 'flat copy of the deleted document removed');
});

await check('an item added elsewhere is not deleted by a device that has not seen it', async () => {
  await put(`consultants/${uid}/clients/c2`, { id: 'c2', name: 'Added by the server' });
  await lib.saveConsultantData({ ...data, clients: [...data.clients, { id: 'c3', name: 'Local' }] });
  assert.deepEqual(Object.keys(await records(uid, 'clients')).sort(), ['c1', 'c2', 'c3']);
});

await check('the live listener reports changes made elsewhere', async () => {
  let latest = null;
  const stop = lib.subscribeToConsultantData(d => { latest = d; });
  for (let i = 0; i < 50 && !latest; i++) await wait(100);
  assert.ok(latest, 'no first snapshot');
  assert.ok(latest.clients.some(c => c.id === 'c2'));
  await put(`consultants/${uid}/documents/d3`, { id: 'd3', type: 'quote', status: 'accepted', total: 5, clientId: 'c1', businessId: 'b1', items: [] });
  for (let i = 0; i < 50 && latest.documents.find(d => d.id === 'd3')?.status !== 'accepted'; i++) await wait(100);
  stop();
  assert.equal(latest.documents.find(d => d.id === 'd3').status, 'accepted');
});

await check('after hearing about it, the device can delete it', async () => {
  // Merged into local state by the app, then removed by the user.
  const loaded = (await lib.loadConsultantData()).data;
  await lib.saveConsultantData({ ...loaded, clients: loaded.clients.filter(c => c.id !== 'c2') });
  assert.deepEqual(Object.keys(await records(uid, 'clients')).sort(), ['c1', 'c3']);
});

for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} sync checks passed`);
process.exit(failed ? 1 : 0);
