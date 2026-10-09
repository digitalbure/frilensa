// End-to-end test of the server against the Firebase Auth + Firestore emulators.
// Run with: npm run test:e2e (needs Java). Starts server.ts on port 3300.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const P = 'frilensa-e2e', AUTH = 'http://127.0.0.1:9099', FS = 'http://127.0.0.1:8085', API = 'http://127.0.0.1:3300';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); } };
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });

// --- users in the Auth emulator (verified emails) ---
async function user(email) {
  const r = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) })).json();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: r.localId, emailVerified: true }) });
  const s = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) })).json();
  return { uid: r.localId, token: s.idToken, email };
}

// --- Firestore seeding through the emulator REST API (bypasses rules with "owner") ---
const fsVal = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(fsVal) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
async function put(path, data) {
  const r = await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: fsVal(data).mapValue.fields }) });
  if (!r.ok) throw new Error(`seed ${path}: ${await r.text()}`);
}
async function get(path) {
  const r = await (await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } })).json();
  const un = f => 'stringValue' in f ? f.stringValue : 'doubleValue' in f ? f.doubleValue : 'integerValue' in f ? Number(f.integerValue) : 'booleanValue' in f ? f.booleanValue : 'nullValue' in f ? null : 'arrayValue' in f ? (f.arrayValue.values || []).map(un) : 'mapValue' in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, un(x)])) : undefined;
  return r.fields ? un({ mapValue: { fields: r.fields } }) : null;
}

const A = await user('alice@studio.fj'), B = await user('bob@agency.fj');
const auth = u => ({ Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' });
const TOK_INV = 'invTokenAAAAAAAAAAAAAAAA', TOK_DRAFT = 'draftTokenBBBBBBBBBBBBBB', TOK_QUOTE = 'quoteTokenCCCCCCCCCCCCCC';
const docs = [
  { id: 'd1', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-1001', total: 112.5, subtotal: 100, vatRate: 12.5, vatAmount: 12.5, shareToken: TOK_INV, clientId: 'c1', businessId: 'b1', items: [] },
  { id: 'd2', type: 'invoice', status: 'draft', documentNumber: 'INV-2026-1002', total: 50, subtotal: 50, vatRate: 0, vatAmount: 0, shareToken: TOK_DRAFT, clientId: 'c1', businessId: 'b1', items: [] },
  { id: 'd3', type: 'quote', status: 'sent', documentNumber: 'QT-2026-1000', total: 200, subtotal: 200, vatRate: 0, vatAmount: 0, shareToken: TOK_QUOTE, clientId: 'c1', businessId: 'b1', items: [] }
];
await put(`consultants/${A.uid}`, { clients: [{ id: 'c1', name: 'Client One', email: 'client@one.fj' }], businesses: [{ id: 'b1', name: 'Alice Studio', isPrimary: true }], documents: docs, projects: [] });
for (const d of docs) await put(`documents/${A.uid}_${d.id}`, { ...d, consultantId: A.uid, clientEmail: 'client@one.fj', clientName: 'Client One', businessName: 'Alice Studio', businessBankDetails: 'BSP 123' });

// --- start the real server against the emulators ---
try { await fetch(`${API}/api/health`); console.error('Port 3300 is already in use; stop that process and rerun.'); process.exit(1); } catch {}
const server = spawn('npx', ['tsx', 'server.ts'], { cwd: process.argv[2], env: { ...process.env, PORT: '3300', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: P, FIRESTORE_DATABASE_ID: '(default)', GCLOUD_PROJECT: P, PORTAL_SESSION_SECRET: 'e2e' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
for (let i = 0; i < 60; i++) { try { if ((await fetch(`${API}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }

try {
  // Public document links
  await check('document link opens a sent invoice', async () => { const r = await j(await fetch(`${API}/api/public/documents/${TOK_INV}`)); assert.equal(r.status, 200); assert.equal(r.body.document.documentNumber, 'INV-2026-1001'); assert.equal(r.body.business.name, 'Alice Studio'); assert.equal(r.body.business.bankDetails, 'BSP 123'); });
  await check('document link hides owner ids and token', async () => { const r = await j(await fetch(`${API}/api/public/documents/${TOK_INV}`)); assert.equal(r.body.document.consultantId, undefined); assert.equal(r.body.document.shareToken, undefined); assert.equal(r.body.document.clientEmail, undefined); });
  await check('draft documents are not shown', async () => { assert.equal((await fetch(`${API}/api/public/documents/${TOK_DRAFT}`)).status, 404); });
  await check('unknown token is rejected', async () => { assert.equal((await fetch(`${API}/api/public/documents/notARealTokenXXXXXXXXXX`)).status, 404); });
  await check('malformed token is rejected', async () => { assert.equal((await fetch(`${API}/api/public/documents/abc`)).status, 404); });
  await check('accept quote from link updates flat copy and workspace', async () => {
    assert.equal((await fetch(`${API}/api/public/documents/${TOK_QUOTE}/accept`, { method: 'POST' })).status, 200);
    assert.equal((await get(`documents/${A.uid}_d3`)).status, 'accepted');
    assert.equal((await get(`consultants/${A.uid}`)).documents.find(d => d.id === 'd3').status, 'accepted');
  });
  await check('accepting twice is refused', async () => { assert.equal((await fetch(`${API}/api/public/documents/${TOK_QUOTE}/accept`, { method: 'POST' })).status, 409); });
  await check('cannot accept an invoice', async () => { assert.equal((await fetch(`${API}/api/public/documents/${TOK_INV}/accept`, { method: 'POST' })).status, 409); });
  await check('report payment from link records it without marking paid', async () => {
    const r = await fetch(`${API}/api/public/documents/${TOK_INV}/report-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'M-PAiSA', reference: 'MP12345' }) });
    assert.equal(r.status, 200);
    const d = await get(`documents/${A.uid}_d1`); assert.equal(d.status, 'sent'); assert.equal(d.clientPaymentReport.reference, 'MP12345');
  });
  await check('report payment needs a reference', async () => { assert.equal((await fetch(`${API}/api/public/documents/${TOK_INV}/report-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400); });

  // Directory
  await check('directory requires sign-in', async () => { assert.equal((await fetch(`${API}/api/directory`)).status, 401); });
  await check('Alice publishes a listing', async () => { const r = await j(await fetch(`${API}/api/directory/listing`, { method: 'PUT', headers: auth(A), body: JSON.stringify({ businessId: 'b1', name: 'Alice Studio', category: 'Creative & Graphic Design', city: 'Suva', startingRate: 80, logoUrl: 'javascript:alert(1)', email: 'not-an-email' }) })); assert.equal(r.status, 200); assert.equal(r.body.listing.logoUrl, ''); assert.equal(r.body.listing.email, ''); });
  await check('Bob sees Alice in the shared directory', async () => { const r = await j(await fetch(`${API}/api/directory`, { headers: auth(B) })); assert.equal(r.body.listings.length, 1); assert.equal(r.body.listings[0].uid, A.uid); });
  await check('cannot book yourself', async () => { assert.equal((await fetch(`${API}/api/directory/bookings`, { method: 'POST', headers: auth(A), body: JSON.stringify({ providerUid: A.uid, clientName: 'A', bookingDate: '2026-11-01' }) })).status, 400); });
  let bookingId;
  await check('Bob books Alice', async () => { const r = await j(await fetch(`${API}/api/directory/bookings`, { method: 'POST', headers: auth(B), body: JSON.stringify({ providerUid: A.uid, clientName: 'Bob', clientEmail: 'bob@agency.fj', bookingDate: '2026-11-01', serviceName: 'Logo', paymentMethod: 'escrow' }) })); assert.equal(r.status, 200); assert.equal(r.body.booking.paymentMethod, 'bank_transfer'); bookingId = r.body.booking.id; });
  await check('Alice receives the booking, Bob sees it as sent', async () => {
    const a = await j(await fetch(`${API}/api/directory/bookings`, { headers: auth(A) })); assert.equal(a.body.received.length, 1); assert.equal(a.body.sent.length, 0);
    const b = await j(await fetch(`${API}/api/directory/bookings`, { headers: auth(B) })); assert.equal(b.body.sent.length, 1); assert.equal(b.body.received.length, 0);
  });
  await check('Bob cannot accept his own request', async () => { assert.equal((await fetch(`${API}/api/directory/bookings/${bookingId}`, { method: 'PATCH', headers: auth(B), body: JSON.stringify({ status: 'accepted' }) })).status, 403); });
  await check('Alice accepts', async () => { assert.equal((await fetch(`${API}/api/directory/bookings/${bookingId}`, { method: 'PATCH', headers: auth(A), body: JSON.stringify({ status: 'accepted' }) })).status, 200); });
  await check('Bob cancels', async () => { assert.equal((await fetch(`${API}/api/directory/bookings/${bookingId}`, { method: 'PATCH', headers: auth(B), body: JSON.stringify({ status: 'cancelled' }) })).status, 200); });
  await check('closed booking cannot be reopened', async () => { assert.equal((await fetch(`${API}/api/directory/bookings/${bookingId}`, { method: 'PATCH', headers: auth(A), body: JSON.stringify({ status: 'accepted' }) })).status, 409); });
  await check('Alice unlists', async () => { await fetch(`${API}/api/directory/listing`, { method: 'DELETE', headers: auth(A) }); const r = await j(await fetch(`${API}/api/directory`, { headers: auth(B) })); assert.equal(r.body.listings.length, 0); });
  await check('cannot book an unlisted business', async () => { assert.equal((await fetch(`${API}/api/directory/bookings`, { method: 'POST', headers: auth(B), body: JSON.stringify({ providerUid: A.uid, clientName: 'Bob', bookingDate: '2026-11-01' }) })).status, 404); });

  // Client portal (end to end with real tokens)
  let portalToken, session;
  await check('Alice creates a portal link', async () => { const r = await j(await fetch(`${API}/api/portal/admin/link`, { method: 'POST', headers: auth(A), body: JSON.stringify({ clientId: 'c1', clientName: 'Client One', email: 'client@one.fj' }) })); assert.equal(r.status, 200); portalToken = r.body.token; assert.ok(portalToken.length >= 30); });
  await check('portal link starts a session', async () => { const r = await j(await fetch(`${API}/api/portal/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: portalToken }) })); assert.equal(r.status, 200); session = r.body.sessionToken; });
  await check('portal shows only issued documents', async () => { const r = await j(await fetch(`${API}/api/portal/data`, { headers: { Authorization: `Portal ${session}` } })); assert.equal(r.status, 200); assert.deepEqual(r.body.documents.map(d => d.id).sort(), ['d1', 'd3']); });
  await check('Bob cannot create a link for Alice\'s client data', async () => { const r = await j(await fetch(`${API}/api/portal/admin/link`, { method: 'POST', headers: auth(B), body: JSON.stringify({ clientId: 'c1', email: 'client@one.fj' }) })); const s = await j(await fetch(`${API}/api/portal/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: r.body.token }) })); assert.equal(s.status, 401); });
  await check('Alice sets a PIN and the client signs in with it', async () => { assert.equal((await fetch(`${API}/api/portal/admin/pin`, { method: 'POST', headers: auth(A), body: JSON.stringify({ clientId: 'c1', email: 'client@one.fj', pin: '482913' }) })).status, 200); assert.equal((await fetch(`${API}/api/portal/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'client@one.fj', pin: '482913' }) })).status, 200); assert.equal((await fetch(`${API}/api/portal/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'client@one.fj', pin: '000000' }) })).status, 401); });
  await check('revoking ends the open session', async () => { await fetch(`${API}/api/portal/admin/revoke`, { method: 'POST', headers: auth(A), body: JSON.stringify({ email: 'client@one.fj' }) }); assert.equal((await fetch(`${API}/api/portal/data`, { headers: { Authorization: `Portal ${session}` } })).status, 401); });
} finally {
  // Kill the whole process group (npx -> tsx -> node), not just npx.
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
}
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} end-to-end checks passed`);
if (failed) console.log('--- server log ---\n' + log.slice(-3000));
process.exit(failed ? 1 : 0);
