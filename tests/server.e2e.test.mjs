// End-to-end test of the server against the Firebase Auth + Firestore emulators.
// Run with: npm run test:e2e (needs Java). Starts server.ts on port 3300.
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

// Fake SendGrid: records every email the server sends.
const emails = [];
const fakeSendGrid = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => { try { const m = JSON.parse(body); emails.push({ to: m.personalizations[0].to[0].email, subject: m.subject, html: (m.content || []).find(c => c.type === 'text/html')?.value || '' }); } catch {} res.writeHead(202, { 'x-message-id': 'fake' }); res.end(); });
}).listen(3399);
const emailTo = async (to, match, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const e = emails.find(x => x.to === to && match.test(x.subject)); if (e) return e; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`no email to ${to} matching ${match}; got ${JSON.stringify(emails)}`);
};

const A = await user('alice@studio.fj'), B = await user('bob@agency.fj');
const auth = u => ({ Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' });
const TOK_INV = 'invTokenAAAAAAAAAAAAAAAA', TOK_DRAFT = 'draftTokenBBBBBBBBBBBBBB', TOK_QUOTE = 'quoteTokenCCCCCCCCCCCCCC';
const docs = [
  { id: 'd1', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-1001', total: 112.5, subtotal: 100, vatRate: 12.5, vatAmount: 12.5, shareToken: TOK_INV, clientId: 'c1', businessId: 'b1', items: [] },
  { id: 'd2', type: 'invoice', status: 'draft', documentNumber: 'INV-2026-1002', total: 50, subtotal: 50, vatRate: 0, vatAmount: 0, shareToken: TOK_DRAFT, clientId: 'c1', businessId: 'b1', items: [] },
  { id: 'd3', type: 'quote', status: 'sent', documentNumber: 'QT-2026-1000', total: 200, subtotal: 200, vatRate: 0, vatAmount: 0, shareToken: TOK_QUOTE, clientId: 'c1', businessId: 'b1', items: [] }
];
await put(`consultants/${A.uid}`, { consultantEmail: A.email, userProfile: { email: A.email }, clients: [{ id: 'c1', name: 'Client One', email: 'client@one.fj' }], businesses: [{ id: 'b1', name: 'Alice Studio', isPrimary: true }], documents: docs, projects: [] });
for (const d of docs) await put(`documents/${A.uid}_${d.id}`, { ...d, consultantId: A.uid, clientEmail: 'client@one.fj', clientName: 'Client One', businessName: 'Alice Studio', businessBankDetails: 'BSP 123' });


// Bob's workspace for the daily automation job: one auto-generate retainer, one that isn't, two overdue invoices.
const fijiToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Fiji', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysAgo = n => { const d = new Date(`${fijiToday}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const TOK_LATE = 'lateTokenDDDDDDDDDDDDDDDD';
const bobDocs = [
  { id: 'late1', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-2001', issueDate: daysAgo(20), dueDate: daysAgo(5), total: 300, subtotal: 300, vatRate: 0, vatAmount: 0, shareToken: TOK_LATE, clientId: 'bc1', businessId: 'bb1', items: [] },
  { id: 'late2', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-2002', issueDate: daysAgo(30), dueDate: daysAgo(12), total: 80, subtotal: 80, vatRate: 0, vatAmount: 0, shareToken: 'late2TokenEEEEEEEEEEEEEEE', clientId: 'bc1', businessId: 'bb1', items: [] }
];
const bobRetainer = { id: 'ret1', clientId: 'bc1', businessId: 'bb1', projectName: 'Website care', amount: 500, billingDay: 1, status: 'active', autoGenerate: true, startDate: '2026-01-01', interval: 'monthly', paymentTermsDays: 7, autoSendMode: 'sent', items: [] };
await put(`consultants/${B.uid}`, {
  consultantEmail: B.email,
  userProfile: { email: B.email, defaultVatRate: 12.5, automation: { emailRetainerInvoices: true, overdueReminders: true } },
  clients: [{ id: 'bc1', name: 'Payer Ltd', email: 'payer@client.fj' }],
  businesses: [{ id: 'bb1', name: 'Bob Agency', email: 'hello@agency.fj', isPrimary: true, invoicePrefix: 'INV', invoiceStartNumber: 3000 }],
  documents: bobDocs,
  recurringInvoices: [bobRetainer, { ...bobRetainer, id: 'ret2', autoGenerate: false }],
  projects: []
});
await put(`documents/${B.uid}_late1`, { ...bobDocs[0], consultantId: B.uid, clientEmail: 'payer@client.fj', clientName: 'Payer Ltd', businessName: 'Bob Agency' });

// Carol's workspace for rate cards.
const C = await user('carol@rates.fj');
const carolWs = rateCardToken => ({
  consultantEmail: C.email,
  userProfile: { email: C.email, defaultCurrency: 'FJD', defaultVatRate: 12.5 },
  clients: [],
  businesses: [{ id: 'cb1', name: 'Carol Photo', email: 'hi@carol.fj', isPrimary: true, quoteTerms: '50% deposit to book.', quoteValidDays: 21, paymentTermsDays: 7, ...(rateCardToken ? { rateCardToken } : {}) }, { id: 'cb2', name: 'Carol Other' }],
  services: [
    { id: 's1', name: 'Portrait session', description: 'One hour', rate: 150, unit: 'Hour', businessId: 'cb1', costPrice: 40, sku: 'SECRET-SKU' },
    { id: 's2', name: 'Hidden item', rate: 999, unit: 'Item', businessId: 'cb1', showOnRateCard: false },
    { id: 's3', name: 'Retired item', rate: 5, unit: 'Item', businessId: 'cb1', isActive: false },
    { id: 's4', name: 'Other business item', rate: 7, unit: 'Item', businessId: 'cb2' },
    { id: 's5', name: 'Prints', rate: 20, unit: 'Item', isTaxable: false }
  ],
  documents: [], projects: [{ id: 'p1', name: 'Wedding shoot', status: 'in_progress', businessId: 'cb1', tasks: [{ id: 't0', projectId: 'p1', title: 'Scout venue', status: 'done' }] }]
});
await put(`consultants/${C.uid}`, carolWs(''));

// Fake Anthropic API: scripted replies for the assistant test; records each request.
const claudeCalls = [];
const reply = (content, stop_reason = 'end_turn') => ({ id: 'msg_test', type: 'message', role: 'assistant', model: 'test', content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
const fakeClaude = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const r = JSON.parse(body || '{}'); claudeCalls.push(r);
    const last = r.messages[r.messages.length - 1];
    const results = Array.isArray(last.content) ? last.content.filter(c => c.type === 'tool_result') : [];
    let out;
    if (!r.tools) out = reply([{ type: 'text', text: '["Sends clients proofs within a week of a shoot"]' }]);
    else if (results.length === 0) out = reply([{ type: 'tool_use', id: 'tu1', name: 'list_projects', input: {} }], 'tool_use');
    else if (results[0].tool_use_id === 'tu1') out = reply([
      { type: 'text', text: 'Adding that.' },
      { type: 'tool_use', id: 'tu2', name: 'propose_task', input: { projectId: 'p1', title: 'Send proofs', dueDate: '2026-10-16', priority: 'high' } },
      { type: 'tool_use', id: 'tu3', name: 'propose_task', input: { projectId: 'nope', title: 'Bad' } }
    ], 'tool_use');
    else out = reply([{ type: 'text', text: 'I proposed a task for you to confirm.' }]);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
  });
}).listen(3398);

// --- start the real server against the emulators ---
try { await fetch(`${API}/api/health`); console.error('Port 3300 is already in use; stop that process and rerun.'); process.exit(1); } catch {}
const server = spawn('npx', ['tsx', 'server.ts'], { cwd: process.argv[2], env: { ...process.env, PORT: '3300', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: P, FIRESTORE_DATABASE_ID: '(default)', GCLOUD_PROJECT: P, PORTAL_SESSION_SECRET: 'e2e', SENDGRID_API_KEY: 'test-key', SENDGRID_API_URL: 'http://127.0.0.1:3399/v3/mail/send', APP_URL: 'https://frilensa.example', JOBS_SECRET: 'e2e-jobs-secret', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', FILES_BUCKET: 'frilensa-e2e-files', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3398' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
  await check('consultant is emailed about the accepted quote', async () => { await emailTo(A.email, /Quote QT-2026-1000 accepted/); });
  await check('consultant is emailed about the reported payment', async () => { await emailTo(A.email, /Payment reported for INV-2026-1001/); });
  await check('reported payment is marked pending for the inbox', async () => { assert.equal((await get(`documents/${A.uid}_d1`)).clientPaymentReport.status, 'pending'); });
  await check('report payment needs a reference', async () => { assert.equal((await fetch(`${API}/api/public/documents/${TOK_INV}/report-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400); });

  // Directory
  await check('directory requires sign-in', async () => { assert.equal((await fetch(`${API}/api/directory`)).status, 401); });
  await check('Alice publishes a listing', async () => { const r = await j(await fetch(`${API}/api/directory/listing`, { method: 'PUT', headers: auth(A), body: JSON.stringify({ businessId: 'b1', name: 'Alice Studio', category: 'Creative & Graphic Design', city: 'Suva', startingRate: 80, logoUrl: 'javascript:alert(1)', email: 'not-an-email' }) })); assert.equal(r.status, 200); assert.equal(r.body.listing.logoUrl, ''); assert.equal(r.body.listing.email, ''); });
  await check('Bob sees Alice in the shared directory', async () => { const r = await j(await fetch(`${API}/api/directory`, { headers: auth(B) })); assert.equal(r.body.listings.length, 1); assert.equal(r.body.listings[0].uid, A.uid); });
  await check('cannot book yourself', async () => { assert.equal((await fetch(`${API}/api/directory/bookings`, { method: 'POST', headers: auth(A), body: JSON.stringify({ providerUid: A.uid, clientName: 'A', bookingDate: '2026-11-01' }) })).status, 400); });
  let bookingId;
  await check('Bob books Alice', async () => { const r = await j(await fetch(`${API}/api/directory/bookings`, { method: 'POST', headers: auth(B), body: JSON.stringify({ providerUid: A.uid, clientName: 'Bob', clientEmail: 'bob@agency.fj', bookingDate: '2026-11-01', serviceName: 'Logo', paymentMethod: 'escrow' }) })); assert.equal(r.status, 200); assert.equal(r.body.booking.paymentMethod, 'bank_transfer'); bookingId = r.body.booking.id; });
  await check('provider is emailed about the new booking', async () => { await emailTo(A.email, /New booking request BK-/); });
  await check('Alice receives the booking, Bob sees it as sent', async () => {
    const a = await j(await fetch(`${API}/api/directory/bookings`, { headers: auth(A) })); assert.equal(a.body.received.length, 1); assert.equal(a.body.sent.length, 0);
    const b = await j(await fetch(`${API}/api/directory/bookings`, { headers: auth(B) })); assert.equal(b.body.sent.length, 1); assert.equal(b.body.received.length, 0);
  });
  await check('Bob cannot accept his own request', async () => { assert.equal((await fetch(`${API}/api/directory/bookings/${bookingId}`, { method: 'PATCH', headers: auth(B), body: JSON.stringify({ status: 'accepted' }) })).status, 403); });
  await check('Alice accepts', async () => { assert.equal((await fetch(`${API}/api/directory/bookings/${bookingId}`, { method: 'PATCH', headers: auth(A), body: JSON.stringify({ status: 'accepted' }) })).status, 200); });
  await check('requester is emailed when the booking is accepted', async () => { await emailTo('bob@agency.fj', /accepted your booking/); });
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
  await check('client message reaches the consultant by email', async () => {
    const r = await fetch(`${API}/api/portal/messages`, { method: 'POST', headers: { Authorization: `Portal ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'Question', message: 'When is the next milestone?' }) });
    assert.equal(r.status, 200);
    await emailTo(A.email, /New message from Client One/);
  });
  await check('client-entered text is escaped in notification emails', async () => {
    await fetch(`${API}/api/portal/messages`, { method: 'POST', headers: { Authorization: `Portal ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'Hi', message: '<img src=x onerror=alert(1)>' }) });
    let latest;
    for (let i = 0; i < 40 && !latest; i++) { latest = emails.find(x => x.to === A.email && /onerror/.test(x.html)); if (!latest) await new Promise(r => setTimeout(r, 100)); }
    assert.ok(latest, 'notification email for the message never arrived');
    assert.ok(latest.html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'expected escaped markup');
    assert.ok(!latest.html.includes('<img src=x'), 'raw markup must not appear');
  });
  await check('turning notifications off stops the emails', async () => {
    await put(`consultants/${A.uid}`, { consultantEmail: A.email, userProfile: { email: A.email, emailNotifications: false }, clients: [{ id: 'c1', name: 'Client One', email: 'client@one.fj' }], businesses: [{ id: 'b1', name: 'Alice Studio', isPrimary: true }], documents: docs, projects: [] });
    const before = emails.length;
    await fetch(`${API}/api/portal/messages`, { method: 'POST', headers: { Authorization: `Portal ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Another question' }) });
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(emails.length, before);
  });
  await check('revoking ends the open session', async () => { await fetch(`${API}/api/portal/admin/revoke`, { method: 'POST', headers: auth(A), body: JSON.stringify({ email: 'client@one.fj' }) }); assert.equal((await fetch(`${API}/api/portal/data`, { headers: { Authorization: `Portal ${session}` } })).status, 401); });


  // Public API and MCP server
  const keyAuth = k => ({ Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
  let aliceKey, aliceReadKey, bobKey, newClientId;
  await check('API keys need sign-in to manage', async () => { assert.equal((await fetch(`${API}/api/keys`)).status, 401); });
  await check('Alice creates a draft-access key and a read-only key', async () => {
    const r = await j(await fetch(`${API}/api/keys`, { method: 'POST', headers: auth(A), body: JSON.stringify({ name: 'Claude' }) }));
    assert.equal(r.status, 200); assert.match(r.body.key, /^frk_/); assert.deepEqual(r.body.scopes, ['read', 'draft']); aliceKey = r.body.key;
    const ro = await j(await fetch(`${API}/api/keys`, { method: 'POST', headers: auth(A), body: JSON.stringify({ name: 'Reports', access: 'read' }) }));
    assert.deepEqual(ro.body.scopes, ['read']); aliceReadKey = ro.body.key;
    bobKey = (await j(await fetch(`${API}/api/keys`, { method: 'POST', headers: auth(B), body: JSON.stringify({ name: 'Bob' }) }))).body.key;
  });
  await check('key list never shows the key itself', async () => {
    const r = await j(await fetch(`${API}/api/keys`, { headers: auth(A) }));
    assert.equal(r.body.keys.length, 2); assert.ok(!JSON.stringify(r.body).includes(aliceKey)); assert.equal(r.body.keys[0].prefix.length, 10);
  });
  await check('API rejects a missing or wrong key', async () => {
    assert.equal((await fetch(`${API}/api/v1/me`)).status, 401);
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: keyAuth('frk_notARealKeyAAAAAAAAAAAAAAAAAA') })).status, 401);
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: auth(A) })).status, 401, 'a Firebase token is not an API key');
  });
  await check('API returns the account and documents', async () => {
    const me = await j(await fetch(`${API}/api/v1/me`, { headers: keyAuth(aliceKey) }));
    assert.equal(me.status, 200); assert.equal(me.body.businesses[0].name, 'Alice Studio');
    const docs = await j(await fetch(`${API}/api/v1/documents?type=invoice`, { headers: keyAuth(aliceKey) }));
    assert.ok(docs.body.documents.some(d => d.number === 'INV-2026-1001'));
    assert.ok(!JSON.stringify(docs.body).includes('shareToken'), 'raw share tokens are not exposed');
  });
  await check('API creates a client and a draft invoice', async () => {
    const c = await j(await fetch(`${API}/api/v1/clients`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ name: 'Reef Cafe', email: 'owner@reef.fj' }) }));
    assert.equal(c.status, 200); newClientId = c.body.client.id;
    const d = await j(await fetch(`${API}/api/v1/documents`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ type: 'invoice', clientId: newClientId, items: [{ name: 'Menu design', quantity: 2, rate: 150 }], vatRate: 12.5 }) }));
    assert.equal(d.status, 200); assert.equal(d.body.document.status, 'draft'); assert.equal(d.body.document.total, 337.5); assert.equal(d.body.document.onlineUrl, null);
    const ws = await get(`consultants/${A.uid}`);
    const saved = ws.documents.find(x => x.id === d.body.document.id);
    assert.ok(saved && saved.status === 'draft'); assert.ok(ws.clients.some(x => x.id === newClientId));
    assert.match(ws.activityLogs[0].description, /via API key "Claude"/);
    assert.equal((await get(`documents/${A.uid}_${saved.id}`)).status, 'draft', 'online copy written');
    assert.equal((await fetch(`${API}/api/public/documents/${saved.shareToken}`)).status, 404, 'drafts stay private');
  });
  await check('API validates input', async () => {
    const r = await j(await fetch(`${API}/api/v1/documents`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ type: 'invoice', clientId: newClientId, items: [] }) }));
    assert.equal(r.status, 400);
    const unknown = await j(await fetch(`${API}/api/v1/documents`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ type: 'invoice', clientId: newClientId, items: [{ name: 'x', quantity: 1, rate: 1 }], status: 'paid' }) }));
    assert.equal(unknown.status, 400, 'unknown fields such as status are refused');
  });
  await check('read-only key cannot change data', async () => {
    const r = await fetch(`${API}/api/v1/expenses`, { method: 'POST', headers: keyAuth(aliceReadKey), body: JSON.stringify({ date: '2026-10-01', vendor: 'Vodafone', amount: 50 }) });
    assert.equal(r.status, 403);
    assert.equal((await fetch(`${API}/api/v1/summary`, { headers: keyAuth(aliceReadKey) })).status, 200);
  });
  await check("each key only sees its own workspace", async () => {
    const r = await j(await fetch(`${API}/api/v1/clients/${newClientId}`, { headers: keyAuth(bobKey) }));
    assert.equal(r.status, 404);
    const list = await j(await fetch(`${API}/api/v1/clients`, { headers: keyAuth(bobKey) }));
    assert.ok(!list.body.clients.some(c => c.id === newClientId));
  });
  const mcp = (k, method, params = {}) => fetch(`${API}/mcp`, { method: 'POST', headers: { ...keyAuth(k), Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(j);
  await check('MCP server lists tools by key access', async () => {
    const init = await mcp(aliceKey, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
    assert.equal(init.status, 200); assert.equal(init.body.result.serverInfo.name, 'frilensa');
    const full = (await mcp(aliceKey, 'tools/list')).body.result.tools.map(t => t.name);
    assert.ok(full.includes('list_documents') && full.includes('create_draft_document'));
    const ro = (await mcp(aliceReadKey, 'tools/list')).body.result.tools.map(t => t.name);
    assert.ok(ro.includes('get_summary') && ro.includes('list_tasks') && !ro.includes('create_draft_document') && !ro.includes('add_expense') && !ro.includes('create_task'));
    assert.ok(full.includes('create_task'));
  });
  await check('MCP tools read and write the workspace', async () => {
    const r = await mcp(aliceKey, 'tools/call', { name: 'list_documents', arguments: { type: 'quote' } });
    assert.ok(JSON.parse(r.body.result.content[0].text).documents.some(d => d.number === 'QT-2026-1000'));
    const e = await mcp(aliceKey, 'tools/call', { name: 'add_expense', arguments: { date: '2026-10-02', vendor: 'Vodafone Fiji', amount: 112.5, vatClaimable: true } });
    const exp = JSON.parse(e.body.result.content[0].text).expense; assert.equal(exp.vatAmount, 12.5);
    const bad = await mcp(aliceKey, 'tools/call', { name: 'get_document', arguments: { documentId: 'nope' } });
    assert.equal(bad.body.result.isError, true);
  });
  await check('VAT return over the API and MCP', async () => {
    const r = await j(await fetch(`${API}/api/v1/vat-return?from=2026-01-01&to=2026-12-31&includeLines=true`, { headers: keyAuth(aliceKey) }));
    assert.equal(r.status, 200); assert.equal(r.body.basis, 'invoice'); assert.equal(typeof r.body.netVat, 'number'); assert.ok(Array.isArray(r.body.lines));
    assert.equal((await fetch(`${API}/api/v1/vat-return?from=2026-12-01&to=2026-01-01`, { headers: keyAuth(aliceKey) })).status, 400);
    const m = await mcp(aliceReadKey, 'tools/call', { name: 'get_vat_return', arguments: { period: 'this_year', basis: 'payments' } });
    const body = JSON.parse(m.body.result.content[0].text); assert.equal(body.basis, 'payments'); assert.equal(body.lines, undefined);
  });
  await check('MCP needs a valid key', async () => { assert.equal((await mcp('frk_notARealKeyAAAAAAAAAAAAAAAAAA', 'tools/list')).status, 401); });
  await check('revoked keys stop working', async () => {
    const list = await j(await fetch(`${API}/api/keys`, { headers: auth(A) }));
    const ro = list.body.keys.find(k => k.name === 'Reports');
    assert.equal((await fetch(`${API}/api/keys/${ro.id}`, { method: 'DELETE', headers: auth(B) })).status, 404, "can't revoke someone else's key");
    assert.equal((await fetch(`${API}/api/keys/${ro.id}`, { method: 'DELETE', headers: auth(A) })).status, 200);
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: keyAuth(aliceReadKey) })).status, 401);
  });
  await check('API key records are not readable from the browser', async () => {
    const r = await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/api_keys`, { headers: { Authorization: `Bearer ${A.token}` } });
    assert.equal(r.status, 403);
  });

  // OAuth sign-in for MCP clients (claude.ai connectors)
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
  const RESOURCE = `${API}/mcp`;
  const pkce = () => { const verifier = crypto.randomBytes(32).toString('base64url'); return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }; };
  const form = o => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
  let oauthClient;
  const authorize = async (u, extra = {}) => {
    const { verifier, challenge } = pkce();
    const r = await j(await fetch(`${API}/api/oauth/approve`, { method: 'POST', headers: auth(u), body: JSON.stringify({ response_type: 'code', client_id: oauthClient, redirect_uri: REDIRECT, state: 'st8', code_challenge: challenge, code_challenge_method: 'S256', scope: 'read draft', resource: RESOURCE, decision: 'allow', ...extra }) }));
    const url = r.body.redirectTo ? new URL(r.body.redirectTo) : null;
    return { r, url, code: url?.searchParams.get('code'), verifier };
  };
  const exchange = (code, verifier) => fetch(`${API}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: oauthClient, redirect_uri: REDIRECT })).then(j);
  await check('MCP tells clients where to sign in', async () => {
    const r = await fetch(`${API}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('www-authenticate'), `Bearer resource_metadata="${API}/.well-known/oauth-protected-resource"`);
  });
  await check('OAuth discovery documents', async () => {
    const pr = await j(await fetch(`${API}/.well-known/oauth-protected-resource`));
    assert.equal(pr.body.resource, RESOURCE); assert.deepEqual(pr.body.authorization_servers, [API]);
    const as = await j(await fetch(`${API}/.well-known/oauth-authorization-server`));
    assert.equal(as.body.token_endpoint, `${API}/oauth/token`); assert.deepEqual(as.body.code_challenge_methods_supported, ['S256']);
    assert.ok(as.body.registration_endpoint);
  });
  await check('OAuth endpoints do not change CORS for the rest of the site', async () => {
    const r = await fetch(`${API}/api/health`); assert.equal(r.headers.get('access-control-allow-origin'), null);
  });
  await check('dynamic client registration', async () => {
    const bad = await fetch(`${API}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) });
    assert.equal(bad.status, 400);
    const r = await j(await fetch(`${API}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }) }));
    assert.equal(r.status, 201); assert.match(r.body.client_id, /^frc_/); oauthClient = r.body.client_id;
  });
  await check('consent page checks the client and redirect address', async () => {
    const ok = await j(await fetch(`${API}/api/oauth/client?${new URLSearchParams({ client_id: oauthClient, redirect_uri: REDIRECT })}`));
    assert.equal(ok.body.clientName, 'Claude'); assert.equal(ok.body.redirectHost, 'claude.ai');
    assert.equal((await fetch(`${API}/api/oauth/client?${new URLSearchParams({ client_id: oauthClient, redirect_uri: 'https://evil.example/cb' })}`)).status, 400);
  });
  await check('approving needs a signed-in user and PKCE', async () => {
    assert.equal((await fetch(`${API}/api/oauth/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const noPkce = await authorize(A, { code_challenge: '', code_challenge_method: 'plain' });
    assert.equal(noPkce.r.status, 400);
    const wrongResource = await authorize(A, { resource: 'https://other.example/mcp' });
    assert.equal(wrongResource.r.status, 400);
  });
  let oauthTokens;
  await check('authorization code flow issues tokens', async () => {
    const { url, code, verifier } = await authorize(A);
    assert.equal(url.origin + url.pathname, REDIRECT); assert.equal(url.searchParams.get('state'), 'st8');
    const t = await exchange(code, verifier);
    assert.equal(t.status, 200); assert.match(t.body.access_token, /^fra_/); assert.match(t.body.refresh_token, /^frr_/); assert.equal(t.body.scope, 'read draft');
    oauthTokens = t.body;
    assert.equal((await exchange(code, verifier)).status, 400, 'codes are single use');
  });
  await check('wrong PKCE verifier is refused', async () => {
    const { code } = await authorize(A);
    const t = await exchange(code, pkce().verifier);
    assert.equal(t.status, 400); assert.equal(t.body.error, 'invalid_grant');
  });
  await check('OAuth token works with MCP and the API', async () => {
    const tools = await mcp(oauthTokens.access_token, 'tools/list');
    assert.ok(tools.body.result.tools.some(t => t.name === 'create_draft_document'));
    const acct = await mcp(oauthTokens.access_token, 'tools/call', { name: 'get_account', arguments: {} });
    assert.equal(JSON.parse(acct.body.result.content[0].text).businesses[0].name, 'Alice Studio');
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: keyAuth(oauthTokens.access_token) })).status, 200);
  });
  await check('refresh tokens rotate, and reuse ends the connection', async () => {
    const r1 = await j(await fetch(`${API}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: oauthTokens.refresh_token, client_id: oauthClient })));
    assert.equal(r1.status, 200); assert.notEqual(r1.body.refresh_token, oauthTokens.refresh_token);
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: keyAuth(r1.body.access_token) })).status, 200);
    const reuse = await j(await fetch(`${API}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: oauthTokens.refresh_token, client_id: oauthClient })));
    assert.equal(reuse.status, 400);
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: keyAuth(r1.body.access_token) })).status, 401, 'stolen refresh token revokes the connection');
  });
  await check('read-only consent limits the connection', async () => {
    const { code, verifier } = await authorize(A, { access: 'read' });
    const t = (await exchange(code, verifier)).body;
    assert.equal(t.scope, 'read');
    const names = (await mcp(t.access_token, 'tools/list')).body.result.tools.map(x => x.name);
    assert.ok(!names.includes('create_draft_document'));
    assert.equal((await fetch(`${API}/api/v1/clients`, { method: 'POST', headers: keyAuth(t.access_token), body: JSON.stringify({ name: 'X' }) })).status, 403);
  });
  await check('connected apps can be listed and disconnected', async () => {
    const { code, verifier } = await authorize(A);
    const t = (await exchange(code, verifier)).body;
    const list = await j(await fetch(`${API}/api/oauth/connections`, { headers: auth(A) }));
    assert.ok(list.body.connections.length >= 1 && list.body.connections.every(c => c.name === 'Claude'));
    const newest = list.body.connections[0];
    assert.equal((await fetch(`${API}/api/oauth/connections/${newest.id}`, { method: 'DELETE', headers: auth(B) })).status, 404, "can't remove someone else's");
    assert.equal((await fetch(`${API}/api/oauth/connections/${newest.id}`, { method: 'DELETE', headers: auth(A) })).status, 200);
    assert.equal((await fetch(`${API}/api/v1/me`, { headers: keyAuth(t.access_token) })).status, 401);
  });
  await check('OAuth tokens are per user', async () => {
    const { code, verifier } = await authorize(B);
    const t = (await exchange(code, verifier)).body;
    const r = await j(await fetch(`${API}/api/v1/clients`, { headers: keyAuth(t.access_token) }));
    assert.ok(r.body.clients.every(c => c.name !== 'Reef Cafe'));
  });
  await check('denying sends the user back with access_denied', async () => {
    const { url } = await authorize(A, { decision: 'deny' });
    assert.equal(url.searchParams.get('error'), 'access_denied'); assert.equal(url.searchParams.get('code'), null);
  });
  await check('OAuth records are not readable from the browser', async () => {
    for (const c of ['oauth_clients', 'oauth_grants', 'oauth_tokens', 'oauth_codes']) {
      const r = await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/${c}`, { headers: { Authorization: `Bearer ${A.token}` } });
      assert.equal(r.status, 403, c);
    }
  });

  // Reimbursable expenses: receipts in file storage, shown to the client through the document
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  let receipt;
  await check('receipts upload to file storage for the signed-in owner', async () => {
    assert.equal((await fetch(`${API}/api/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'taxi.png', type: 'image/png', dataUrl: PNG }) })).status, 401);
    const bad = await fetch(`${API}/api/files`, { method: 'POST', headers: auth(A), body: JSON.stringify({ name: 'x.html', type: 'text/html', dataUrl: 'data:text/html;base64,PGgxPg==' }) });
    assert.equal(bad.status, 400, 'only photos and PDFs');
    const r = await j(await fetch(`${API}/api/files`, { method: 'POST', headers: auth(A), body: JSON.stringify({ name: 'taxi.png', type: 'image/png', dataUrl: PNG }) }));
    assert.equal(r.status, 200); assert.equal(r.body.type, 'image/png'); receipt = r.body;
  });
  await check('only the owner can open their file directly', async () => {
    const mine = await fetch(`${API}/api/files/${receipt.id}`, { headers: auth(A) });
    assert.equal(mine.status, 200); assert.equal(mine.headers.get('content-type'), 'image/png');
    assert.match(mine.headers.get('content-security-policy') || '', /sandbox/);
    assert.equal((await fetch(`${API}/api/files/${receipt.id}`, { headers: auth(B) })).status, 404);
  });
  const RTOK = 'reimbTokenFFFFFFFFFFFFFFF';
  const reimbDoc = { id: 'r-inv', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-1100', total: 1182.5, subtotal: 1070, vatRate: 12.5, vatAmount: 112.5, shareToken: RTOK, clientId: 'c1', businessId: 'b1',
    items: [{ id: 'i1', name: 'Shoot', quantity: 1, rate: 900, total: 900 }, { id: 'i2', kind: 'reimbursement', expenseId: 'x1', name: 'Taxi', quantity: 1, rate: 170, total: 170, costAmount: 170, taxable: false, receiptFileId: '' }] };
  await check('client sees a receipt only through a sent document it is on', async () => {
    const withReceipt = { ...reimbDoc, items: reimbDoc.items.map(it => it.kind ? { ...it, receiptFileId: receipt.id } : it) };
    await put(`documents/${A.uid}_r-inv`, { ...withReceipt, consultantId: A.uid, clientEmail: 'client@one.fj', clientName: 'Client One', businessName: 'Alice Studio' });
    const ok = await fetch(`${API}/api/public/documents/${RTOK}/files/${receipt.id}`);
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${API}/api/public/documents/${TOK_INV}/files/${receipt.id}`)).status, 404, 'not through another document');
    await put(`documents/${A.uid}_r-inv`, { ...withReceipt, status: 'draft', consultantId: A.uid, clientEmail: 'client@one.fj' });
    assert.equal((await fetch(`${API}/api/public/documents/${RTOK}/files/${receipt.id}`)).status, 404, 'not while the invoice is a draft');
    await put(`documents/${A.uid}_r-inv`, { ...withReceipt, consultantId: A.uid, clientEmail: 'client@one.fj' });
  });
  await check("a document can't expose another owner's file", async () => {
    const bobFile = (await j(await fetch(`${API}/api/files`, { method: 'POST', headers: auth(B), body: JSON.stringify({ name: 'b.png', type: 'image/png', dataUrl: PNG }) }))).body;
    const trick = { ...reimbDoc, shareToken: 'trickTokenGGGGGGGGGGGGGGG', items: [{ ...reimbDoc.items[1], receiptFileId: bobFile.id }] };
    await put(`documents/${A.uid}_trick`, { ...trick, id: 'trick', consultantId: A.uid, clientEmail: 'client@one.fj' });
    assert.equal((await fetch(`${API}/api/public/documents/trickTokenGGGGGGGGGGGGGGG/files/${bobFile.id}`)).status, 404);
  });
  await check('portal client can open the receipt on their own document', async () => {
    const link = await j(await fetch(`${API}/api/portal/admin/link`, { method: 'POST', headers: auth(A), body: JSON.stringify({ clientId: 'c1', clientName: 'Client One', email: 'client@one.fj' }) }));
    const s2 = (await j(await fetch(`${API}/api/portal/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: link.body.token }) }))).body.sessionToken;
    const r = await fetch(`${API}/api/portal/documents/r-inv/files/${receipt.id}`, { headers: { Authorization: `Portal ${s2}` } });
    assert.equal(r.status, 200);
    assert.equal((await fetch(`${API}/api/portal/documents/r-inv/files/${receipt.id}`)).status, 401);
  });
  await check('API bills marked expenses onto a draft invoice without VAT by default', async () => {
    const e = await j(await fetch(`${API}/api/v1/expenses`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ date: '2026-10-03', vendor: 'Fiji Airways', description: 'Flight to Labasa', amount: 300, billToClientId: 'c1' }) }));
    assert.equal(e.status, 200); assert.equal(e.body.expense.billToClientId, 'c1');
    const unbilled = await j(await fetch(`${API}/api/v1/expenses?unbilledForClientId=c1`, { headers: keyAuth(aliceKey) }));
    assert.ok(unbilled.body.expenses.some(x => x.id === e.body.expense.id));
    const d = await j(await fetch(`${API}/api/v1/documents`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ type: 'invoice', clientId: 'c1', vatRate: 12.5, items: [{ name: 'Design', quantity: 1, rate: 1000 }], expenseIds: [e.body.expense.id] }) }));
    assert.equal(d.status, 200);
    assert.equal(d.body.document.vatAmount, 125, 'VAT only on the service line');
    assert.equal(d.body.document.total, 1425);
    assert.ok(d.body.document.items.some(it => it.reimbursable && it.vatCharged === false));
    const ws = await get(`consultants/${A.uid}`);
    assert.equal(ws.expenses.find(x => x.id === e.body.expense.id).billedDocumentId, d.body.document.id, 'expense marked as billed');
    const again = await fetch(`${API}/api/v1/documents`, { method: 'POST', headers: keyAuth(aliceKey), body: JSON.stringify({ type: 'invoice', clientId: 'c1', expenseIds: [e.body.expense.id] }) });
    assert.equal(again.status, 409, 'an expense is billed once');
  });
  // Daily automation job
  const jobs = (secret) => fetch(`${API}/api/jobs/daily`, { method: 'POST', headers: secret ? { 'X-Job-Secret': secret } : {} });
  const retInvoiceId = `doc-ret-ret1-${fijiToday.slice(0, 7)}`;
  await check('daily job refuses a missing or wrong secret', async () => { assert.equal((await jobs()).status, 401); assert.equal((await jobs('wrong')).status, 401); });
  await check('daily job runs with the secret', async () => { const r = await j(await jobs('e2e-jobs-secret')); assert.equal(r.status, 200); assert.equal(r.body.invoicesCreated, 1); assert.equal(r.body.remindersSent, 2); });
  await check('retainer invoice is created in the workspace', async () => {
    const ws = await get(`consultants/${B.uid}`);
    const inv = ws.documents.find(d => d.id === retInvoiceId);
    assert.ok(inv, 'invoice missing');
    assert.equal(inv.documentNumber, `INV-${new Date().getFullYear()}-3000`);
    assert.equal(inv.total, 562.5);
    assert.equal(inv.status, 'sent');
    assert.equal(ws.recurringInvoices.find(r => r.id === 'ret1').lastGeneratedDate, fijiToday);
    assert.equal(ws.recurringInvoices.find(r => r.id === 'ret2').lastGeneratedDate, undefined, 'manual retainer left alone');
    assert.equal(ws.documents.length, 3, 'existing documents kept');
  });
  await check('retainer invoice has an online copy and link', async () => {
    const flat = await get(`documents/${B.uid}_${retInvoiceId}`);
    assert.equal(flat.consultantId, B.uid); assert.equal(flat.clientEmail, 'payer@client.fj');
    const r = await j(await fetch(`${API}/api/public/documents/${flat.shareToken}`)); assert.equal(r.status, 200); assert.equal(r.body.business.name, 'Bob Agency');
  });
  await check('retainer invoice is emailed to the client and logged', async () => {
    await emailTo('payer@client.fj', /Invoice #INV-\d{4}-3000 from Bob Agency/);
    const inv = (await get(`consultants/${B.uid}`)).documents.find(d => d.id === retInvoiceId);
    assert.equal(inv.emailHistory.length, 1); assert.equal(inv.emailHistory[0].recipientEmail, 'payer@client.fj');
  });
  await check('overdue invoices get the right reminder with a link', async () => {
    const gentle = await emailTo('payer@client.fj', /Friendly reminder: invoice INV-2026-2001/);
    assert.ok(gentle.html.includes(`https://frilensa.example/?doc=${TOK_LATE}`), 'link to the invoice');
    await emailTo('payer@client.fj', /Second reminder: invoice INV-2026-2002 is 12 days overdue/);
  });
  await check('reminders are recorded on the workspace and online copy', async () => {
    const ws = await get(`consultants/${B.uid}`);
    assert.deepEqual(ws.documents.find(d => d.id === 'late1').remindersSent.map(r => r.level), [1]);
    assert.deepEqual(ws.documents.find(d => d.id === 'late2').remindersSent.map(r => r.level), [2]);
    assert.deepEqual((await get(`documents/${B.uid}_late1`)).remindersSent.map(r => r.level), [1]);
    assert.equal(await get(`documents/${B.uid}_late2`), null, 'no partial online copy created');
  });
  await check('running again the same day sends and creates nothing', async () => {
    const before = emails.filter(e => e.to === 'payer@client.fj').length;
    const r = await j(await jobs('e2e-jobs-secret'));
    assert.equal(r.body.invoicesCreated, 0); assert.equal(r.body.remindersSent, 0);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(emails.filter(e => e.to === 'payer@client.fj').length, before);
    assert.equal((await get(`consultants/${B.uid}`)).documents.length, 3);
  });
  await check('automation status needs sign-in and shows the last run', async () => {
    assert.equal((await fetch(`${API}/api/automation/status`)).status, 401);
    const r = await j(await fetch(`${API}/api/automation/status`, { headers: auth(B) }));
    assert.equal(r.status, 200); assert.equal(r.body.emailConfigured, true); assert.equal(r.body.scheduleConfigured, true);
    assert.equal(r.body.lastRun.trigger, 'schedule');
  });
  await check('run now works for the signed-in consultant only', async () => {
    const r = await j(await fetch(`${API}/api/automation/run-now`, { method: 'POST', headers: auth(B) }));
    assert.equal(r.status, 200); assert.equal(r.body.lastRun.trigger, 'manual'); assert.equal(r.body.lastRun.invoicesCreated.length, 0);
    const a = await j(await fetch(`${API}/api/automation/status`, { headers: auth(A) }));
    assert.equal(a.body.lastRun, null, "Alice has no runs and can't see Bob's");
  });
  await check('automation run records are not readable from the browser', async () => {
    const r = await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/automation_runs/${B.uid}`, { headers: { Authorization: `Bearer ${B.token}` } });
    assert.equal(r.status, 403);
  });

  // --- rate cards and quote requests ---
  let card1, card2, requestId;
  const RC = `${API}/api/public/rate-cards`;
  await check('rate card admin needs sign-in', async () => { assert.equal((await fetch(`${API}/api/rate-cards`, { method: 'POST' })).status, 401); });
  await check('rate card link needs one of your businesses', async () => { assert.equal((await fetch(`${API}/api/rate-cards`, { method: 'POST', headers: auth(C), body: JSON.stringify({ businessId: 'bb1' }) })).status, 404); });
  await check('rate card works once the token is saved on the business', async () => {
    const r = await j(await fetch(`${API}/api/rate-cards`, { method: 'POST', headers: auth(C), body: JSON.stringify({ businessId: 'cb1' }) }));
    assert.equal(r.status, 200); card1 = r.body.token; assert.ok(card1.length >= 20);
    assert.equal((await fetch(`${RC}/${card1}`)).status, 404, 'not live until saved on the business');
    await put(`consultants/${C.uid}`, carolWs(card1));
    assert.equal((await fetch(`${RC}/${card1}`)).status, 200);
  });
  await check('rate card lists only active, visible items for that business', async () => {
    const r = await j(await fetch(`${RC}/${card1}`));
    assert.deepEqual(r.body.services.map(s => s.id), ['s1', 's5']);
    assert.equal(r.body.business.name, 'Carol Photo');
    assert.equal(r.body.services[0].costPrice, undefined); assert.equal(r.body.services[0].sku, undefined);
    assert.equal(r.body.services[0].vat, true); assert.equal(r.body.services[1].vat, false);
    assert.deepEqual(r.body.terms, { text: '50% deposit to book.', paymentTermsDays: 7, quoteValidDays: 21 });
    assert.equal(JSON.stringify(r.body).includes(C.uid), false, 'owner id must not leak');
  });
  await check('quote request needs a name and email', async () => {
    assert.equal((await fetch(`${RC}/${card1}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Dee', items: [{ serviceId: 's1', quantity: 1 }] }) })).status, 400);
  });
  await check('quote request uses the card\'s rates and ignores hidden items', async () => {
    const r = await j(await fetch(`${RC}/${card1}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Dee', email: 'dee@client.fj', message: 'Family shoot', items: [{ serviceId: 's1', quantity: 2, rate: 1 }, { serviceId: 's2', quantity: 1 }, { serviceId: 's4', quantity: 1 }, { serviceId: 's5', quantity: 3 }] }) }));
    assert.equal(r.status, 200); assert.match(r.body.ref, /^QR-/);
  });
  await check('consultant is emailed about the quote request', async () => { await emailTo(C.email, /Quote request QR-.* from Dee/); });
  await check('only the card owner sees the request', async () => {
    const r = await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(C) }));
    assert.equal(r.body.requests.length, 1);
    const q = r.body.requests[0]; requestId = q.id;
    assert.deepEqual(q.items.map(i => [i.serviceId, i.quantity, i.rate]), [['s1', 2, 150], ['s5', 3, 20]]);
    assert.equal(q.estimate, 360);
    assert.equal((await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(B) }))).body.requests.length, 0);
    assert.equal((await fetch(`${API}/api/rate-cards/requests/${requestId}`, { method: 'PATCH', headers: auth(B), body: JSON.stringify({ status: 'dismissed' }) })).status, 404);
  });
  await check('marking a request quoted removes it from the inbox', async () => {
    assert.equal((await fetch(`${API}/api/rate-cards/requests/${requestId}`, { method: 'PATCH', headers: auth(C), body: JSON.stringify({ status: 'quoted', documentId: 'doc-1' }) })).status, 200);
    assert.equal((await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(C) }))).body.requests.length, 0);
  });
  await check('quote requests are not readable from the browser', async () => {
    const r = await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/quote_requests/${requestId}`, { headers: { Authorization: `Bearer ${C.token}` } });
    assert.equal(r.status, 403);
  });
  await check('someone else cannot turn off the rate card', async () => {
    await fetch(`${API}/api/rate-cards/${card1}`, { method: 'DELETE', headers: auth(B) });
    assert.equal((await fetch(`${RC}/${card1}`)).status, 200);
  });
  await check('a new link retires the old one', async () => {
    card2 = (await j(await fetch(`${API}/api/rate-cards`, { method: 'POST', headers: auth(C), body: JSON.stringify({ businessId: 'cb1' }) }))).body.token;
    await put(`consultants/${C.uid}`, carolWs(card2));
    assert.equal((await fetch(`${RC}/${card1}`)).status, 404);
    assert.equal((await fetch(`${RC}/${card2}`)).status, 200);
  });
  await check('turning the card off stops the link', async () => {
    await fetch(`${API}/api/rate-cards/${card2}`, { method: 'DELETE', headers: auth(C) });
    assert.equal((await fetch(`${RC}/${card2}`)).status, 404);
  });

  // --- in-app assistant (Claude) ---
  let assistantRes;
  await check('assistant needs sign-in', async () => { assert.equal((await fetch(`${API}/api/ai/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401); });
  await check('assistant looks things up and proposes without saving', async () => {
    const r = await j(await fetch(`${API}/api/ai/assistant`, { method: 'POST', headers: auth(C), body: JSON.stringify({ message: 'Add a task to send the wedding proofs by Friday please', history: [{ sender: 'ai', text: 'Welcome' }], memories: ['Works weekends'] }) }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assistantRes = r.body;
    assert.equal(r.body.reply, 'I proposed a task for you to confirm.');
    assert.equal(r.body.proposals.length, 1, 'the invalid proposal is refused');
    assert.equal(r.body.proposals[0].kind, 'task'); assert.equal(r.body.proposals[0].title, 'Add task: Send proofs');
    assert.ok(r.body.proposals[0].details.includes('Project: Wedding shoot'));
    assert.deepEqual(r.body.newMemories, ['Sends clients proofs within a week of a shoot']);
    const ws = await get(`consultants/${C.uid}`);
    assert.equal(ws.projects[0].tasks.length, 1, 'nothing saved before confirming');
  });
  await check('assistant gets the help articles, tools, memories and a user-first history', async () => {
    const first = claudeCalls.find(c => c.tools);
    assert.ok(first.system[0].text.includes('# Help articles'));
    assert.equal(first.system[0].cache_control.type, 'ephemeral');
    assert.ok(first.system[1].text.includes('Works weekends'));
    assert.equal(first.messages[0].role, 'user', 'leading assistant greeting dropped');
    const names = first.tools.map(t => t.name);
    for (const n of ['list_clients', 'get_document', 'list_tasks', 'get_vat_return', 'propose_task', 'propose_draft_document']) assert.ok(names.includes(n), n);
    assert.ok(!names.some(n => /send|email|payment|delete/.test(n)), 'no tools that send, pay or delete');
    const afterProjects = claudeCalls.find(c => c.messages.at(-1).content?.[0]?.tool_use_id === 'tu1');
    assert.ok(afterProjects.messages.at(-1).content[0].content.includes('Wedding shoot'));
    const afterPropose = claudeCalls.find(c => c.messages.at(-1).content?.[0]?.tool_use_id === 'tu2');
    assert.equal(afterPropose.messages.at(-1).content[1].is_error, true);
  });
  await check('confirming saves the task with an activity entry', async () => {
    const p = assistantRes.proposals[0];
    const r = await j(await fetch(`${API}/api/ai/assistant/confirm`, { method: 'POST', headers: auth(C), body: JSON.stringify({ kind: p.kind, input: p.input }) }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.task.title, 'Send proofs');
    const ws = await get(`consultants/${C.uid}`);
    const t = ws.projects[0].tasks.find(x => x.title === 'Send proofs');
    assert.equal(t.status, 'todo'); assert.equal(t.dueDate, '2026-10-16'); assert.equal(t.priority, 'high');
    assert.ok(ws.activityLogs[0].description.includes('via the assistant'));
  });
  await check('confirm validates its input and kind', async () => {
    assert.equal((await fetch(`${API}/api/ai/assistant/confirm`, { method: 'POST', headers: auth(C), body: JSON.stringify({ kind: 'payment', input: {} }) })).status, 400);
    assert.equal((await fetch(`${API}/api/ai/assistant/confirm`, { method: 'POST', headers: auth(C), body: JSON.stringify({ kind: 'task', input: { projectId: 'p1', title: 'x', status: 'done' } }) })).status, 400);
    assert.equal((await fetch(`${API}/api/ai/assistant/confirm`, { method: 'POST', headers: auth(B), body: JSON.stringify({ kind: 'task', input: { projectId: 'p1', title: 'x' } }) })).status, 404, "can't add to someone else's project");
  });
  await check('assistant status reports it is set up', async () => {
    const r = await j(await fetch(`${API}/api/ai/assistant/status`, { headers: auth(C) }));
    assert.equal(r.body.configured, true); assert.ok(r.body.helpArticles >= 10);
  });
} finally {
  // Kill the whole process group (npx -> tsx -> node), not just npx.
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  fakeSendGrid.close();
  fakeClaude.close();
}
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} end-to-end checks passed`);
if (failed) console.log('--- server log ---\n' + log.slice(-3000));
process.exit(failed ? 1 : 0);
