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

// Carol's workspace for rate cards, the assistant and Pay now.
const C = await user('carol@rates.fj');
const TOK_C1 = 'carolInvoiceOneAAAAAAAAAA', TOK_C2 = 'carolInvoiceTwoBBBBBBBBBB';
const carolBooking = {
  services: { s5: { minQuantity: 5, maxQuantity: 50 } },
  builtIn: { date: true, location: true },
  questions: [
    { id: 'q_aud', type: 'number', label: 'Expected audience', required: true },
    { id: 'q_watch', type: 'single_choice', label: 'How people will watch', options: ['Free', 'Ticketed'] },
    { id: 'q_prints', type: 'yes_no', label: 'Framed prints?', required: true, appliesToServiceIds: ['s5'] }
  ],
  intro: 'Book a shoot', afterMessage: "We'll reply within one working day."
};
const carolDocs = [
  { id: 'ci1', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-5001', currency: 'FJD', issueDate: '2026-10-01', total: 300, subtotal: 300, vatRate: 0, vatAmount: 0, shareToken: TOK_C1, clientId: 'cc1', businessId: 'cb1', items: [{ id: 'x', name: 'Shoot', quantity: 1, rate: 300, total: 300 }] },
  { id: 'ci2', type: 'invoice', status: 'sent', documentNumber: 'INV-2026-5002', currency: 'USD', issueDate: '2026-10-02', total: 100, subtotal: 100, vatRate: 0, vatAmount: 0, shareToken: TOK_C2, clientId: 'cc1', businessId: 'cb1', items: [{ id: 'y', name: 'Prints', quantity: 1, rate: 100, total: 100 }] }
];
const carolWs = rateCardToken => ({
  consultantEmail: C.email,
  userProfile: { email: C.email, defaultCurrency: 'FJD', defaultVatRate: 12.5 },
  clients: [],
  businesses: [{ id: 'cb1', name: 'Carol Photo', email: 'hi@carol.fj', isPrimary: true, quoteTerms: '50% deposit to book.', quoteValidDays: 21, paymentTermsDays: 7, bankDetails: 'BSP 999', mPaisaId: '9991234', customExchangeRates: { AUD: 1.5 }, payNow: { paypal: true, paypalCurrency: 'AUD', surchargePercent: 2 }, booking: carolBooking, ...(rateCardToken ? { rateCardToken } : {}) }, { id: 'cb2', name: 'Carol Other' }],
  services: [
    { id: 's1', name: 'Portrait session', description: 'One hour', rate: 150, unit: 'Hour', businessId: 'cb1', costPrice: 40, sku: 'SECRET-SKU' },
    { id: 's2', name: 'Hidden item', rate: 999, unit: 'Item', businessId: 'cb1', showOnRateCard: false },
    { id: 's3', name: 'Retired item', rate: 5, unit: 'Item', businessId: 'cb1', isActive: false },
    { id: 's4', name: 'Other business item', rate: 7, unit: 'Item', businessId: 'cb2' },
    { id: 's5', name: 'Prints', rate: 20, unit: 'Item', isTaxable: false }
  ],
  documents: carolDocs, transactions: [], projects: [{ id: 'p1', name: 'Wedding shoot', status: 'in_progress', businessId: 'cb1', tasks: [{ id: 't0', projectId: 'p1', title: 'Scout venue', status: 'done' }] }]
});
await put(`consultants/${C.uid}`, carolWs(''));
for (const d of carolDocs) await put(`documents/${C.uid}_${d.id}`, { ...d, consultantId: C.uid, clientName: 'Dee', businessName: 'Carol Photo' });

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

// Fake PayPal REST API.
const PP_ID = 'AcarolClientIdGoodGoodGood01', PP_SECRET = 'EcarolSecretGoodGoodGoodGood1';
const ppOrders = new Map(); let ppN = 0;
const fakePaypal = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/v1/oauth2/token') {
      const ok = req.headers.authorization === `Basic ${Buffer.from(`${PP_ID}:${PP_SECRET}`).toString('base64')}`;
      return ok ? send(200, { access_token: 'pp-token', expires_in: 3600 }) : send(401, { error: 'invalid_client' });
    }
    if (req.headers.authorization !== 'Bearer pp-token') return send(401, {});
    if (req.method === 'POST' && req.url === '/v2/checkout/orders') {
      const id = `ORDER${++ppN}`; ppOrders.set(id, JSON.parse(body)); return send(201, { id, status: 'CREATED' });
    }
    const m = req.url.match(/^\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/);
    if (m && ppOrders.has(m[1])) {
      const unit = ppOrders.get(m[1]).purchase_units[0];
      return send(201, { id: m[1], status: 'COMPLETED', purchase_units: [{ reference_id: unit.reference_id, payments: { captures: [{ id: `CAP${m[1]}`, status: 'COMPLETED', amount: unit.amount, custom_id: unit.custom_id, seller_receivable_breakdown: { paypal_fee: { currency_code: unit.amount.currency_code, value: '2.50' } } }] } }] });
    }
    send(404, { name: 'RESOURCE_NOT_FOUND' });
  });
}).listen(3397);

// Fake webhook receiver: records each delivery; can be told to fail.
const hookHits = []; let hookFail = false;
const fakeHooks = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    hookHits.push({ headers: req.headers, body, failed: hookFail });
    res.writeHead(hookFail ? 500 : 200); res.end('ok');
  });
}).listen(3396);
const waitHook = async (match, ms = 5000) => {
  for (let i = 0; i < ms / 100; i++) { const h = hookHits.find(x => !x.failed && match(JSON.parse(x.body))); if (h) return h; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('webhook not received');
};

// --- start the real server against the emulators ---
try { await fetch(`${API}/api/health`); console.error('Port 3300 is already in use; stop that process and rerun.'); process.exit(1); } catch {}
const server = spawn('npx', ['tsx', 'server.ts'], { cwd: process.argv[2], env: { ...process.env, PORT: '3300', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: P, FIRESTORE_DATABASE_ID: '(default)', GCLOUD_PROJECT: P, PORTAL_SESSION_SECRET: 'e2e', SENDGRID_API_KEY: 'test-key', SENDGRID_API_URL: 'http://127.0.0.1:3399/v3/mail/send', APP_URL: 'https://frilensa.example', JOBS_SECRET: 'e2e-jobs-secret', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', FILES_BUCKET: 'frilensa-e2e-files', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3398', PAYPAL_API_BASE: 'http://127.0.0.1:3397', PAYMENT_SECRETS_KEY: 'e2e-payment-secrets', BOOKING_MIN_FILL_MS: '300', BOOKING_PAGE_DAILY_CAP: '3', BOOKING_PAGE_IP_LIMIT: '50', WEBHOOK_ALLOW_PRIVATE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
    assert.ok(ro.includes('get_summary') && ro.includes('list_tasks') && ro.includes('get_booking_form') && ro.includes('list_booking_requests') && ro.includes('get_booking_request') && !ro.includes('create_draft_document') && !ro.includes('add_expense') && !ro.includes('create_task'));
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
  await check('consultant is emailed about the quote request', async () => { await emailTo(C.email, /New booking request QR-.* from Dee/); });
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

  // --- Pay now: manual methods, PayPal and card ---
  const PAY = tok => `${API}/api/public/documents/${tok}/pay`;
  let order1;
  await check('pay options list the manual methods before PayPal is connected', async () => {
    const r = await j(await fetch(PAY(TOK_C1)));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.bank.details, 'BSP 999'); assert.equal(r.body.mpaisa.number, '9991234'); assert.equal(r.body.mycash, null);
    assert.equal(r.body.paypal, null); assert.equal(r.body.balance, 300); assert.equal(r.body.reference, 'INV-2026-5001');
  });
  await check('connecting PayPal needs sign-in and working keys', async () => {
    assert.equal((await fetch(`${API}/api/payments/paypal`, { method: 'PUT' })).status, 401);
    const bad = await j(await fetch(`${API}/api/payments/paypal`, { method: 'PUT', headers: auth(C), body: JSON.stringify({ businessId: 'cb1', clientId: PP_ID, secret: 'EwrongSecretWrongWrongWrong1' }) }));
    assert.equal(bad.status, 400); assert.match(bad.body.error, /didn't accept/);
    assert.equal((await fetch(`${API}/api/payments/paypal`, { method: 'PUT', headers: auth(B), body: JSON.stringify({ businessId: 'cb1', clientId: PP_ID, secret: PP_SECRET }) })).status, 404, "can't connect someone else's business");
    const ok = await j(await fetch(`${API}/api/payments/paypal`, { method: 'PUT', headers: auth(C), body: JSON.stringify({ businessId: 'cb1', clientId: PP_ID, secret: PP_SECRET }) }));
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.env, 'live');
  });
  await check('the PayPal secret is stored encrypted and never returned', async () => {
    const st = await j(await fetch(`${API}/api/payments/paypal?businessId=cb1`, { headers: auth(C) }));
    assert.equal(st.body.connected, true); assert.equal(JSON.stringify(st.body).includes(PP_SECRET), false);
    const stored = await get(`paypal_accounts/${C.uid}_cb1`);
    assert.ok(stored.secret.startsWith('v1.')); assert.equal(stored.secret.includes(PP_SECRET), false);
    assert.equal((await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/paypal_accounts/${C.uid}_cb1`, { headers: { Authorization: `Bearer ${C.token}` } })).status, 403);
  });
  await check('FJD invoices are charged in the business PayPal currency with the surcharge shown', async () => {
    const r = await j(await fetch(PAY(TOK_C1)));
    const pp = r.body.paypal;
    assert.equal(pp.clientId, PP_ID); assert.equal(pp.currency, 'AUD'); assert.equal(pp.rate, 1.5);
    assert.equal(pp.amount, 200); assert.equal(pp.surcharge, 4); assert.equal(pp.total, 204);
    const usd = (await j(await fetch(PAY(TOK_C2)))).body.paypal;
    assert.equal(usd.currency, 'USD', 'PayPal currencies are charged as they are'); assert.equal(usd.amount, 100); assert.equal(usd.total, 102);
  });
  await check('the order is created server-side for the amount owed', async () => {
    const r = await j(await fetch(`${PAY(TOK_C1)}/paypal/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 1 }) }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); order1 = r.body.orderId;
    const unit = ppOrders.get(order1).purchase_units[0];
    assert.deepEqual(unit.amount, { currency_code: 'AUD', value: '204.00' }); assert.equal(unit.custom_id, `${C.uid}:ci1`);
  });
  await check('an order for one invoice is refused on another', async () => {
    const r = await fetch(`${PAY(TOK_C2)}/paypal/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order1 }) });
    assert.equal(r.status, 400);
  });
  await check('capturing marks the invoice paid, logs it and issues a receipt', async () => {
    const r = await j(await fetch(`${PAY(TOK_C1)}/paypal/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order1 }) }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.receiptNumber);
    const ws = await get(`consultants/${C.uid}`);
    const inv = ws.documents.find(d => d.id === 'ci1');
    assert.equal(inv.status, 'paid'); assert.equal(inv.paymentMethod, 'PayPal'); assert.match(inv.paymentExchangeNotes, /AUD 204\.00 incl\. AUD 4\.00 surcharge, PayPal fee AUD 2\.50/);
    const receipt = ws.documents.find(d => d.type === 'receipt' && d.originalInvoiceId === 'ci1');
    assert.equal(receipt.documentNumber, r.body.receiptNumber);
    const tx = ws.transactions.find(t => t.documentId === 'ci1'); assert.equal(tx.amount, 300, 'ledger in FJD');
    assert.equal((await get(`documents/${C.uid}_ci1`)).status, 'paid', 'portal copy updated');
    assert.equal((await get(`documents/${C.uid}_${receipt.id}`)).type, 'receipt');
  });
  await check('a repeated capture is not recorded twice', async () => {
    const r = await j(await fetch(`${PAY(TOK_C1)}/paypal/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order1 }) }));
    assert.equal(r.status, 200); assert.equal(r.body.alreadyRecorded, true);
    const ws = await get(`consultants/${C.uid}`);
    assert.equal(ws.documents.filter(d => d.type === 'receipt' && d.originalInvoiceId === 'ci1').length, 1);
    assert.equal(ws.transactions.filter(t => t.documentId === 'ci1').length, 1);
  });
  await check('consultant is emailed about the online payment', async () => { await emailTo(C.email, /Invoice INV-2026-5001 paid online/); });
  await check('a paid invoice offers no payment and refuses new orders', async () => {
    const r = await j(await fetch(PAY(TOK_C1))); assert.equal(r.body.balance, 0); assert.equal(r.body.paypal, null);
    assert.equal((await fetch(`${PAY(TOK_C1)}/paypal/order`, { method: 'POST' })).status, 409);
  });
  await check('a USD invoice is paid in USD and logged at the business rate', async () => {
    const o = (await j(await fetch(`${PAY(TOK_C2)}/paypal/order`, { method: 'POST' }))).body.orderId;
    assert.deepEqual(ppOrders.get(o).purchase_units[0].amount, { currency_code: 'USD', value: '102.00' });
    assert.equal((await fetch(`${PAY(TOK_C2)}/paypal/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: o }) })).status, 200);
    const inv = (await get(`consultants/${C.uid}`)).documents.find(d => d.id === 'ci2'); assert.equal(inv.status, 'paid');
  });
  await check('drafts and quotes have no Pay now, and the portal route needs a session', async () => {
    assert.equal((await fetch(PAY(TOK_DRAFT))).status, 404);
    assert.equal((await fetch(PAY(TOK_QUOTE))).status, 404);
    assert.equal((await fetch(`${API}/api/portal/documents/ci1/pay`)).status, 401);
  });
  await check('disconnecting PayPal removes the keys', async () => {
    assert.equal((await fetch(`${API}/api/payments/paypal?businessId=cb1`, { method: 'DELETE', headers: auth(C) })).status, 200);
    assert.equal(await get(`paypal_accounts/${C.uid}_cb1`), null);
  });

  // --- Bookings API ---
  let carolKey, carolReadKey, bookReqId;
  const V1 = `${API}/api/v1`;
  const keyHdr = k => ({ Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
  const booking = (extra = {}) => ({
    businessId: 'cb1', name: 'Mere Tuilau', email: 'mere@example.com', phone: '+679 999 9999', company: 'Suva Methodist Church',
    items: [{ serviceId: 's1', quantity: 2, rate: 1 }, { serviceId: 's5', quantity: 2 }, { serviceId: 's2', quantity: 1 }, { serviceId: 's3', quantity: 1 }, { serviceId: 'nope', quantity: 1 }],
    answers: [{ questionId: 'q_date', value: '2027-03-28' }, { questionId: 'q_location', value: 'Centenary Church, Suva' }, { questionId: 'q_aud', value: 300 }, { questionId: 'q_watch', value: 'Free' }, { questionId: 'q_prints', value: true }],
    details: [{ label: 'Viewing', value: 'Free' }],
    startTime: '10:00',
    source: { app: 'Soqo Stream', reference: 'SQB-7Q2K4M', url: 'https://soqo.stream/admin/collections/bookings/12' },
    ...extra
  });
  const post = (k, body) => fetch(`${V1}/booking-requests`, { method: 'POST', headers: keyHdr(k), body: JSON.stringify(body) });
  await check('Carol creates keys for a booking app', async () => {
    carolKey = (await j(await fetch(`${API}/api/keys`, { method: 'POST', headers: auth(C), body: JSON.stringify({ name: 'Soqo Stream' }) }))).body.key;
    carolReadKey = (await j(await fetch(`${API}/api/keys`, { method: 'POST', headers: auth(C), body: JSON.stringify({ name: 'Viewer', access: 'read' }) }))).body.key;
    assert.ok(carolKey && carolReadKey);
  });
  await check('booking form by key: bookable services, limits and questions', async () => {
    const r = await j(await fetch(`${V1}/booking-form?businessId=cb1`, { headers: keyHdr(carolReadKey) }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.business.name, 'Carol Photo'); assert.equal(r.body.currency, 'FJD'); assert.equal(r.body.vatRate, 12.5);
    assert.deepEqual(r.body.services.map(s => s.id), ['s1', 's5']);
    const prints = r.body.services.find(s => s.id === 's5'); assert.equal(prints.minQuantity, 5); assert.equal(prints.maxQuantity, 50); assert.equal(prints.vat, false);
    assert.deepEqual(r.body.questions.map(q => q.id), ['q_date', 'q_location', 'q_aud', 'q_watch', 'q_prints']);
    assert.deepEqual(r.body.questions.find(q => q.id === 'q_prints').appliesToServiceIds, ['s5']);
    assert.equal(r.body.afterMessage, "We'll reply within one working day.");
    assert.equal(JSON.stringify(r.body).includes('SECRET-SKU'), false, 'no cost or SKU');
  });
  await check("booking form: another user's business is 404, and businessId is needed with several businesses", async () => {
    assert.equal((await fetch(`${V1}/booking-form?businessId=cb1`, { headers: keyHdr(bobKey) })).status, 404);
    assert.equal((await fetch(`${V1}/booking-form`, { headers: keyHdr(carolReadKey) })).status, 400);
    const bob = await j(await fetch(`${V1}/booking-form`, { headers: keyHdr(bobKey) }));
    assert.equal(bob.status, 200); assert.equal(bob.body.businessId, 'bb1');
  });
  await check('booking requests need draft access', async () => { assert.equal((await post(carolReadKey, booking())).status, 403); });
  await check('booking answers are checked against the questions', async () => {
    const noAud = await j(await post(carolKey, booking({ answers: [{ questionId: 'q_date', value: '2027-03-28' }, { questionId: 'q_prints', value: true }] })));
    assert.equal(noAud.status, 400); assert.match(noAud.body.error, /Expected audience/);
    const badChoice = await j(await post(carolKey, booking({ answers: [{ questionId: 'q_date', value: '2027-03-28' }, { questionId: 'q_aud', value: 5 }, { questionId: 'q_watch', value: 'Maybe' }, { questionId: 'q_prints', value: true }] })));
    assert.equal(badChoice.status, 400); assert.match(badChoice.body.error, /How people will watch/);
    const badDate = await j(await post(carolKey, booking({ answers: [{ questionId: 'q_date', value: '2027-02-30' }, { questionId: 'q_aud', value: 5 }, { questionId: 'q_prints', value: true }] })));
    assert.equal(badDate.status, 400); assert.match(badDate.body.error, /Event or job date/);
    const noPrints = await j(await post(carolKey, booking({ answers: [{ questionId: 'q_date', value: '2027-03-28' }, { questionId: 'q_aud', value: 5 }] })));
    assert.equal(noPrints.status, 400, 'a question that applies to a chosen service is required'); assert.match(noPrints.body.error, /Framed prints/);
    const unknownQ = await post(carolKey, booking({ answers: [{ questionId: 'q_zzz', value: 'x' }] }));
    assert.equal(unknownQ.status, 400);
  });
  await check('booking requests reject unknown fields and oversized details', async () => {
    assert.equal((await post(carolKey, booking({ price: 1 }))).status, 400);
    assert.equal((await post(carolKey, booking({ details: Array.from({ length: 31 }, (_, i) => ({ label: `L${i}`, value: 'v' })) }))).status, 400);
    assert.equal((await post(carolKey, booking({ details: [{ label: 'x'.repeat(61), value: 'v' }] }))).status, 400);
    assert.equal((await post(carolKey, booking({ source: { app: 'Soqo Stream', reference: 'R2', url: 'http://soqo.stream/x' } }))).status, 400, 'https only');
  });
  await check('a booking request uses server prices and limits, and drops what can\'t be booked', async () => {
    const r = await j(await post(carolKey, booking()));
    assert.equal(r.status, 201, JSON.stringify(r.body)); bookReqId = r.body.id;
    assert.match(r.body.ref, /^QR-/); assert.equal(r.body.status, 'new'); assert.equal(r.body.currency, 'FJD');
    assert.equal(r.body.estimate, 2 * 150 + 5 * 20, 's1 at 150, s5 raised to its minimum of 5 at 20; hidden, inactive and unknown dropped');
  });
  await check('sending the same app reference again returns the same request', async () => {
    const r = await j(await post(carolKey, booking({ name: 'Someone else' })));
    assert.equal(r.status, 200); assert.equal(r.body.id, bookReqId);
  });
  await check('the booking arrives in the owner\'s inbox, with answers as details', async () => {
    const mine = (await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(C) }))).body.requests;
    const r = mine.find(x => x.id === bookReqId);
    assert.equal(r.channel, 'api'); assert.equal(r.via, 'Soqo Stream'); assert.equal(r.eventDate, '2027-03-28'); assert.equal(r.startTime, '10:00'); assert.equal(r.location, 'Centenary Church, Suva');
    assert.deepEqual(r.details.map(d => `${d.label}=${d.value}`), ['Event or job date=2027-03-28', 'Location=Centenary Church, Suva', 'Expected audience=300', 'How people will watch=Free', 'Framed prints?=Yes', 'Viewing=Free']);
    assert.deepEqual(r.items.map(i => [i.serviceId, i.quantity, i.rate]), [['s1', 2, 150], ['s5', 5, 20]]);
    const bobs = (await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(B) }))).body.requests;
    assert.equal(bobs.some(x => x.id === bookReqId), false);
  });
  await check('the consultant is emailed, the customer is not', async () => {
    await emailTo(C.email, /New booking request QR-.* via Soqo Stream/);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(emails.filter(e => e.to === 'mere@example.com').length, 0);
  });

  // Progress, worked out from the workspace documents.
  const stageOf = async () => (await j(await fetch(`${V1}/booking-requests/${bookReqId}`, { headers: keyHdr(carolReadKey) }))).body.bookingRequest;
  const withDocs = docs => put(`consultants/${C.uid}`, { ...carolWs(''), documents: [...carolDocs, ...docs] });
  const QUOTE_TOKEN = 'bookingQuoteTokenAAAAAAA', INV_TOKEN = 'bookingInvoiceTokenAAAAAA';
  const bq = status => ({ id: 'bq1', type: 'quote', status, documentNumber: 'QT-2027-0012', currency: 'FJD', total: 450, subtotal: 400, vatRate: 12.5, vatAmount: 50, shareToken: QUOTE_TOKEN, clientId: 'cc1', businessId: 'cb1', items: [], updatedAt: '2026-10-11T01:00:00.000Z' });
  const bi = (status, extra = {}) => ({ id: 'bi1', type: 'invoice', status, documentNumber: 'INV-2027-0031', currency: 'FJD', total: 450, subtotal: 400, vatRate: 12.5, vatAmount: 50, shareToken: INV_TOKEN, clientId: 'cc1', businessId: 'cb1', items: [], sourceQuoteId: 'bq1', dueDate: '2027-03-14', updatedAt: '2026-10-11T02:00:00.000Z', ...extra });
  await check('booking progress: every stage', async () => {
    let r = await stageOf(); assert.equal(r.stage, 'new'); assert.equal(r.quote, null); assert.deepEqual(r.source, { app: 'Soqo Stream', reference: 'SQB-7Q2K4M', url: 'https://soqo.stream/admin/collections/bookings/12' });
    await fetch(`${API}/api/rate-cards/requests/${bookReqId}`, { method: 'PATCH', headers: auth(C), body: JSON.stringify({ status: 'quoted', documentId: 'bq1' }) });
    await withDocs([bq('draft')]); r = await stageOf();
    assert.equal(r.stage, 'quoted'); assert.equal(r.quote.number, 'QT-2027-0012'); assert.equal(r.quote.onlineUrl, null, 'no link while draft');
    await withDocs([bq('sent')]); r = await stageOf(); assert.equal(r.stage, 'quoted'); assert.match(r.quote.onlineUrl, /\/\?doc=bookingQuoteToken/);
    await withDocs([bq('accepted')]); assert.equal((await stageOf()).stage, 'quote_accepted');
    await withDocs([bq('accepted'), bi('draft')]); assert.equal((await stageOf()).stage, 'quote_accepted', 'draft invoices don\'t count');
    await withDocs([bq('accepted'), bi('sent')]); r = await stageOf(); assert.equal(r.stage, 'invoiced'); assert.equal(r.invoices[0].balance, 450); assert.equal(r.invoices[0].dueDate, '2027-03-14');
    await withDocs([bq('accepted'), bi('partial', { partiallyPaidAmount: 200 })]); r = await stageOf(); assert.equal(r.stage, 'part_paid'); assert.equal(r.invoices[0].amountPaid, 200); assert.equal(r.invoices[0].balance, 250);
    await withDocs([bq('accepted'), bi('paid', { updatedAt: '2099-01-01T00:00:00.000Z' })]); r = await stageOf(); assert.equal(r.stage, 'paid');
    assert.equal(r.updatedAt, '2099-01-01T00:00:00.000Z', 'updatedAt follows the documents');
    const changed = (await j(await fetch(`${V1}/booking-requests?since=2098-12-31`, { headers: keyHdr(carolReadKey) }))).body;
    assert.deepEqual(changed.bookingRequests.map(b => b.id), [bookReqId], 'since uses the worked-out updatedAt');
    await withDocs([bq('cancelled')]); assert.equal((await stageOf()).stage, 'cancelled');
    await fetch(`${API}/api/rate-cards/requests/${bookReqId}`, { method: 'PATCH', headers: auth(C), body: JSON.stringify({ status: 'dismissed' }) });
    assert.equal((await stageOf()).stage, 'dismissed');
  });
  await check('booking progress never shows tokens, PINs or attachments', async () => {
    await withDocs([bq('accepted'), bi('sent', { portalPin: '1234', paymentAttachments: [{ name: 'slip', dataUrl: 'data:x' }] })]);
    const text = JSON.stringify(await stageOf());
    for (const bad of ['"shareToken"', 'portalPin', 'paymentAttachments', '1234', 'accessToken']) assert.equal(text.includes(bad), false, bad);
  });
  await check('booking requests list filters by app, channel and since', async () => {
    const all = (await j(await fetch(`${V1}/booking-requests?app=${encodeURIComponent('Soqo Stream')}`, { headers: keyHdr(carolReadKey) }))).body;
    assert.ok(all.bookingRequests.some(b => b.id === bookReqId));
    assert.ok(all.bookingRequests.every(b => b.source?.app === 'Soqo Stream'));
    const api = (await j(await fetch(`${V1}/booking-requests?channel=api`, { headers: keyHdr(carolReadKey) }))).body.bookingRequests;
    assert.ok(api.every(b => b.channel === 'api'));
    const future = (await j(await fetch(`${V1}/booking-requests?since=2100-01-01`, { headers: keyHdr(carolReadKey) }))).body;
    assert.equal(future.total, 0);
  });
  await check("another user's booking request is 404", async () => {
    assert.equal((await fetch(`${V1}/booking-requests/${bookReqId}`, { headers: keyHdr(bobKey) })).status, 404);
  });
  await check('directory bookings arrive in the same inbox', async () => {
    const r = (await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(A) }))).body.requests;
    const d = r.find(x => x.channel === 'directory');
    assert.ok(d, 'directory booking in the inbox'); assert.ok(d.directoryBookingId);
    assert.equal(d.eventDate, '2026-11-01'); assert.ok(d.details.some(x => x.label === 'Service' && x.value === 'Logo'));
  });

  // --- Hosted booking page and website widget ---
  const BOOK = `${API}/api/public/book`;
  const withPage = page => { const ws = carolWs(''); ws.businesses[0].booking = { ...carolBooking, page }; return put(`consultants/${C.uid}`, ws); };
  const pageBody = (extra = {}) => ({
    name: 'Seini', email: 'seini@client.fj', items: [{ serviceId: 's1', quantity: 1, rate: 1 }],
    answers: [{ questionId: 'q_date', value: '2027-05-01' }, { questionId: 'q_aud', value: 40 }], ...extra
  });
  const sendPage = body => fetch(`${BOOK}/carol-photo/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const myRequests = async () => (await j(await fetch(`${API}/api/rate-cards/requests`, { headers: auth(C) }))).body.requests;
  let pageToken;
  await check('claiming a booking page address: sign-in, format, reserved words, taken', async () => {
    assert.equal((await fetch(`${API}/api/booking-page`, { method: 'PUT' })).status, 401);
    const put1 = body => fetch(`${API}/api/booking-page`, { method: 'PUT', headers: auth(C), body: JSON.stringify(body) });
    assert.equal((await put1({ businessId: 'cb1', slug: 'admin' })).status, 400);
    assert.equal((await put1({ businessId: 'cb1', slug: 'No Spaces!' })).status, 400);
    assert.equal((await put1({ businessId: 'bb1', slug: 'carol-photo' })).status, 404, "someone else's business");
    const ok = await j(await put1({ businessId: 'cb1', slug: 'carol-photo' }));
    assert.equal(ok.status, 200); assert.equal(ok.body.slug, 'carol-photo');
    const taken = await fetch(`${API}/api/booking-page`, { method: 'PUT', headers: auth(B), body: JSON.stringify({ businessId: 'bb1', slug: 'carol-photo' }) });
    assert.equal(taken.status, 409);
  });
  await check('the booking page is off until the business turns it on', async () => {
    await withPage({ enabled: false, slug: 'carol-photo' });
    assert.equal((await fetch(`${BOOK}/carol-photo`)).status, 404);
    await withPage({ enabled: true, slug: 'carol-photo' });
    const r = await j(await fetch(`${BOOK}/carol-photo`));
    assert.equal(r.status, 200); assert.deepEqual(r.body.form.services.map(s => s.id), ['s1', 's5']); assert.ok(r.body.formToken);
    pageToken = r.body.formToken;
    assert.equal((await fetch(`${BOOK}/nobody-here`)).status, 404);
  });
  await check('the booking page needs a valid form token and a human fill time', async () => {
    assert.equal((await sendPage(pageBody())).status, 400, 'no token');
    assert.equal((await sendPage(pageBody({ formToken: pageToken.replace(/.$/, c => c === 'a' ? 'b' : 'a') }))).status, 400, 'tampered token');
    const fresh = (await j(await fetch(`${BOOK}/carol-photo`))).body.formToken;
    const quick = await j(await sendPage(pageBody({ formToken: fresh })));
    assert.equal(quick.status, 400); assert.match(quick.body.error, /quick/);
  });
  await check('a filled honeypot looks accepted but nothing is saved', async () => {
    const before = (await myRequests()).length;
    const r = await j(await sendPage(pageBody({ formToken: pageToken, website: 'http://spam.example' })));
    assert.equal(r.status, 200); assert.match(r.body.ref, /^QR-/);
    assert.equal((await myRequests()).length, before);
  });
  await check('a booking from the page arrives with checked answers and no customer email when off', async () => {
    await new Promise(r => setTimeout(r, 350));
    const bad = await j(await sendPage(pageBody({ formToken: pageToken, answers: [{ questionId: 'q_date', value: '2027-05-01' }] })));
    assert.equal(bad.status, 400); assert.match(bad.body.error, /Expected audience/);
    const r = await j(await sendPage(pageBody({ formToken: pageToken })));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.afterMessage, "We'll reply within one working day.");
    const req = (await myRequests()).find(x => x.ref === r.body.ref);
    assert.equal(req.channel, 'booking_page'); assert.equal(req.eventDate, '2027-05-01'); assert.deepEqual(req.items.map(i => i.rate), [150]);
    await new Promise(r => setTimeout(r, 400));
    assert.equal(emails.filter(e => e.to === 'seini@client.fj').length, 0);
  });
  await check('a widget booking records the website and, when on, emails the customer an acknowledgement', async () => {
    await withPage({ enabled: true, slug: 'carol-photo', ackEmail: true });
    const r = await j(await sendPage(pageBody({ formToken: pageToken, email: 'tui@client.fj', embed: true, hostUrl: 'https://church.example/events?x=1' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const req = (await myRequests()).find(x => x.ref === r.body.ref);
    assert.equal(req.channel, 'widget'); assert.equal(req.source.url, 'https://church.example/events?x=1'); assert.equal(req.source.app, 'church.example');
    await emailTo('tui@client.fj', /We've got your booking request QR-/);
    const ack = emails.find(e => e.to === 'tui@client.fj');
    assert.ok(ack.html.includes('Expected audience: 40')); assert.ok(!/invoice|paid|payment/i.test(ack.html), 'nothing about documents or payments');
  });
  await check('the booking page has a daily cap per business', async () => {
    assert.equal((await sendPage(pageBody({ formToken: pageToken, email: 'third@client.fj' }))).status, 200);
    assert.equal((await sendPage(pageBody({ formToken: pageToken, email: 'fourth@client.fj' }))).status, 429);
  });
  await check('the widget script is served', async () => {
    const r = await fetch(`${API}/embed/booking.js`);
    assert.equal(r.status, 200); assert.match(await r.text(), /data-frilensa-booking/);
  });

  // --- Webhooks ---
  const HOOK_URL = 'http://127.0.0.1:3396/hook';
  let hookId, hookSecret, hookedReq;
  await check('adding a webhook needs sign-in and an event, and shows the secret once', async () => {
    assert.equal((await fetch(`${API}/api/webhooks`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${API}/api/webhooks`, { method: 'POST', headers: auth(C), body: JSON.stringify({ url: HOOK_URL, events: ['nope'] }) })).status, 400);
    const r = await j(await fetch(`${API}/api/webhooks`, { method: 'POST', headers: auth(C), body: JSON.stringify({ url: HOOK_URL, events: ['booking_request.created', 'booking_request.stage_changed'] }) }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.secret, /^whsec_/);
    hookId = r.body.webhook.id; hookSecret = r.body.secret;
    const list = await j(await fetch(`${API}/api/webhooks`, { headers: auth(C) }));
    assert.equal(list.body.webhooks.length, 1); assert.equal(JSON.stringify(list.body).includes(hookSecret), false);
    const stored = await get(`webhooks/${hookId}`); assert.ok(stored.secret.startsWith('v1.')); assert.equal(stored.secret.includes(hookSecret), false);
  });
  await check('a test delivery is signed with the secret', async () => {
    const r = await j(await fetch(`${API}/api/webhooks/${hookId}/test`, { method: 'POST', headers: auth(C) }));
    assert.equal(r.body.delivery.status, 'delivered', JSON.stringify(r.body));
    const hit = hookHits.at(-1);
    const [, t, v1] = hit.headers['frilensa-signature'].match(/^t=(\d+),v1=([0-9a-f]{64})$/);
    const expected = (await import('crypto')).createHmac('sha256', hookSecret).update(`${t}.${hit.body}`).digest('hex');
    assert.equal(v1, expected); assert.equal(hit.headers['frilensa-event'], 'booking_request.created'); assert.equal(JSON.parse(hit.body).test, true);
  });
  await check("someone else can't test or delete the webhook", async () => {
    assert.equal((await fetch(`${API}/api/webhooks/${hookId}/test`, { method: 'POST', headers: auth(B) })).status, 404);
    assert.equal((await fetch(`${API}/api/webhooks/${hookId}`, { method: 'DELETE', headers: auth(B) })).status, 404);
  });
  await check('a new booking request fires booking_request.created with the progress object', async () => {
    await withDocs([]);
    const r = await j(await post(carolKey, booking({ source: { app: 'Soqo Stream', reference: 'SQB-HOOK01' } })));
    assert.equal(r.status, 201, JSON.stringify(r.body)); hookedReq = r.body.id;
    const hit = await waitHook(b => b.event === 'booking_request.created' && b.bookingRequest?.id === hookedReq);
    const body = JSON.parse(hit.body); assert.equal(body.bookingRequest.stage, 'new'); assert.equal(body.bookingRequest.source.reference, 'SQB-HOOK01');
  });
  await check('stage changes fire booking_request.stage_changed (server and browser changes)', async () => {
    await fetch(`${API}/api/rate-cards/requests/${hookedReq}`, { method: 'PATCH', headers: auth(C), body: JSON.stringify({ status: 'quoted', documentId: 'hq1' }) });
    let hit = await waitHook(b => b.event === 'booking_request.stage_changed' && b.bookingRequest?.id === hookedReq && b.bookingRequest.stage === 'quoted');
    assert.equal(JSON.parse(hit.body).previousStage, 'new');
    await withDocs([{ ...bq('accepted'), id: 'hq1' }]);
    await fetch(`${API}/api/events/document-changed`, { method: 'POST', headers: auth(C), body: '{}' });
    hit = await waitHook(b => b.event === 'booking_request.stage_changed' && b.bookingRequest?.id === hookedReq && b.bookingRequest.stage === 'quote_accepted');
    assert.equal(JSON.parse(hit.body).previousStage, 'quoted');
    const before = hookHits.length;
    await fetch(`${API}/api/events/document-changed`, { method: 'POST', headers: auth(C), body: '{}' });
    await new Promise(r => setTimeout(r, 500));
    assert.equal(hookHits.filter((h, i) => i >= before && JSON.parse(h.body).bookingRequest?.id === hookedReq).length, 0, 'no event when nothing moved');
  });
  await check('failed deliveries are retried by the daily job', async () => {
    hookFail = true;
    await withDocs([{ ...bq('accepted'), id: 'hq1' }, { ...bi('sent'), id: 'hi1', sourceQuoteId: 'hq1' }]);
    await fetch(`${API}/api/events/document-changed`, { method: 'POST', headers: auth(C), body: '{}' });
    await new Promise(r => setTimeout(r, 800));
    const deliveries = (await j(await fetch(`${API}/api/webhooks/${hookId}/deliveries`, { headers: auth(C) }))).body.deliveries;
    const pending = deliveries.find(d => d.status === 'pending');
    assert.ok(pending, JSON.stringify(deliveries)); assert.equal(pending.attempts, 1); assert.match(pending.lastError, /500/);
    hookFail = false;
    const doc = await get(`webhook_deliveries/${pending.id}`);
    await put(`webhook_deliveries/${pending.id}`, { ...doc, nextAttemptAt: '2000-01-01T00:00:00.000Z' });
    const job = await j(await fetch(`${API}/api/jobs/daily`, { method: 'POST', headers: { 'X-Job-Secret': 'e2e-jobs-secret' } }));
    assert.equal(job.status, 200); assert.ok(job.body.retried >= 1, JSON.stringify(job.body));
    await waitHook(b => b.event === 'booking_request.stage_changed' && b.bookingRequest?.id === hookedReq && b.bookingRequest.stage === 'invoiced');
    const after = (await j(await fetch(`${API}/api/webhooks/${hookId}/deliveries`, { headers: auth(C) }))).body.deliveries.find(d => d.id === pending.id);
    assert.equal(after.status, 'delivered'); assert.equal(after.attempts, 2);
  });
  await check('webhook deliveries are not readable from the browser', async () => {
    assert.equal((await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/webhooks/${hookId}`, { headers: { Authorization: `Bearer ${C.token}` } })).status, 403);
  });
  await check('deleting a webhook stops deliveries', async () => {
    assert.equal((await fetch(`${API}/api/webhooks/${hookId}`, { method: 'DELETE', headers: auth(C) })).status, 200);
    assert.equal((await j(await fetch(`${API}/api/webhooks`, { headers: auth(C) }))).body.webhooks.length, 0);
  });

  // --- Availability and deposits ---
  const isoPlus = n => { const d = new Date(`${fijiToday}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = iso => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const nextDow = (from, want) => { for (let i = from; i < from + 14; i++) if (dow(isoPlus(i)) === want) return isoPlus(i); };
  const monday = nextDow(10, 1), tuesday = nextDow(10, 2), saturday = nextDow(10, 6);
  const withAvailability = availability => { const ws = carolWs(''); ws.businesses[0].booking = { ...carolBooking, availability, deposit: { type: 'percent', value: 30 } }; ws.documents = carolDocs; return put(`consultants/${C.uid}`, ws); };
  const dated = (date, ref) => booking({ answers: [{ questionId: 'q_date', value: date }, { questionId: 'q_aud', value: 50 }, { questionId: 'q_prints', value: false }], source: { app: 'Soqo Stream', reference: ref } });
  await check('the booking form lists unavailable dates and the deposit', async () => {
    await withAvailability({ enabled: true, workingDays: [1, 2, 3, 4, 5], leadDays: 3, blockedDates: [tuesday], maxPerDay: 1, countPending: true });
    const f = (await j(await fetch(`${V1}/booking-form?businessId=cb1`, { headers: keyHdr(carolReadKey) }))).body;
    assert.equal(f.availability.enabled, true); assert.equal(f.availability.earliestDate, isoPlus(3));
    assert.ok(f.availability.unavailableDates.includes(tuesday)); assert.ok(f.availability.unavailableDates.includes(saturday)); assert.ok(f.availability.unavailableDates.includes(isoPlus(1)));
    assert.ok(!f.availability.unavailableDates.includes(monday));
    assert.deepEqual(f.deposit, { type: 'percent', value: 30 });
  });
  await check('booking requests on unavailable dates are refused', async () => {
    const blocked = await j(await post(carolKey, dated(tuesday, 'AV-1'))); assert.equal(blocked.status, 409); assert.match(blocked.body.error, /isn't available/);
    const weekend = await j(await post(carolKey, dated(saturday, 'AV-2'))); assert.equal(weekend.status, 409); assert.match(weekend.body.error, /day of the week/);
    const soon = await j(await post(carolKey, dated(isoPlus(1), 'AV-3'))); assert.equal(soon.status, 409); assert.match(soon.body.error, /at least 3 days/);
    assert.equal((await post(carolKey, dated(monday, 'AV-4'))).status, 201);
    const full = await j(await post(carolKey, dated(monday, 'AV-5'))); assert.equal(full.status, 409); assert.match(full.body.error, /fully booked/);
    assert.equal((await post(carolKey, dated(monday, 'AV-4'))).status, 200, 'a repeat of an accepted booking still returns it');
    const f = (await j(await fetch(`${V1}/booking-form?businessId=cb1`, { headers: keyHdr(carolReadKey) }))).body;
    assert.ok(f.availability.fullDates.includes(monday));
  });
} finally {
  // Kill the whole process group (npx -> tsx -> node), not just npx.
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  fakeSendGrid.close();
  fakeClaude.close();
  fakePaypal.close();
  fakeHooks.close();
}
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} end-to-end checks passed`);
if (failed) console.log('--- server log ---\n' + log.slice(-3000));
process.exit(failed ? 1 : 0);
