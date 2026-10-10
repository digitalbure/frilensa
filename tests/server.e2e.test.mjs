// End-to-end test of the server against the Firebase Auth + Firestore emulators.
// Run with: npm run test:e2e (needs Java). Starts server.ts on port 3300.
import { spawn } from 'node:child_process';
import http from 'node:http';
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

// --- start the real server against the emulators ---
try { await fetch(`${API}/api/health`); console.error('Port 3300 is already in use; stop that process and rerun.'); process.exit(1); } catch {}
const server = spawn('npx', ['tsx', 'server.ts'], { cwd: process.argv[2], env: { ...process.env, PORT: '3300', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: P, FIRESTORE_DATABASE_ID: '(default)', GCLOUD_PROJECT: P, PORTAL_SESSION_SECRET: 'e2e', SENDGRID_API_KEY: 'test-key', SENDGRID_API_URL: 'http://127.0.0.1:3399/v3/mail/send', APP_URL: 'https://frilensa.example', JOBS_SECRET: 'e2e-jobs-secret' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
} finally {
  // Kill the whole process group (npx -> tsx -> node), not just npx.
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  fakeSendGrid.close();
}
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} end-to-end checks passed`);
if (failed) console.log('--- server log ---\n' + log.slice(-3000));
process.exit(failed ? 1 : 0);
