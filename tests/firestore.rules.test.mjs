import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'frilensa-rules-test',
  firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 }
});
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'consultants/u1'), { userProfile: { email: 'one@x.co' } });
  await setDoc(doc(db, 'consultants/one@x.co'), { legacy: true });
  await setDoc(doc(db, 'documents/d1'), { consultantId: 'u1', clientId: 'c1' });
  await setDoc(doc(db, 'documents/legacy1'), { consultantId: 'one@x.co', clientId: 'c1' });
  await setDoc(doc(db, 'clients_auth/client@x.co'), { passcode: '1234' });
  await setDoc(doc(db, 'portal_access/u1_abc'), { pinHash: 'x' });
  await setDoc(doc(db, 'support_messages/m1'), { consultantId: 'u1', clientEmail: 'client@x.co', sender: 'client' });
});

const anon = env.unauthenticatedContext().firestore();
const u1 = env.authenticatedContext('u1', { email: 'one@x.co', email_verified: true }).firestore();
const u1unverified = env.authenticatedContext('u1', { email: 'one@x.co', email_verified: false }).firestore();
const u2 = env.authenticatedContext('u2', { email: 'two@x.co', email_verified: true }).firestore();

const results = [];
async function check(name, p) {
  try { await p; results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}

await check('anon cannot read a workspace', assertFails(getDoc(doc(anon, 'consultants/u1'))));
await check('owner reads own workspace', assertSucceeds(getDoc(doc(u1, 'consultants/u1'))));
await check('owner writes own workspace', assertSucceeds(setDoc(doc(u1, 'consultants/u1'), { a: 1 })));
await check('other user cannot read workspace', assertFails(getDoc(doc(u2, 'consultants/u1'))));
await check('other user cannot write workspace', assertFails(setDoc(doc(u2, 'consultants/u1'), { a: 1 })));
await check('verified owner reads legacy email workspace', assertSucceeds(getDoc(doc(u1, 'consultants/one@x.co'))));
await check('unverified cannot read legacy email workspace', assertFails(getDoc(doc(u1unverified, 'consultants/one@x.co'))));
await check('nobody writes legacy email workspace', assertFails(setDoc(doc(u1, 'consultants/one@x.co'), { a: 1 })));
await check('other user cannot read legacy email workspace', assertFails(getDoc(doc(u2, 'consultants/one@x.co'))));
await check('cannot list all workspaces', assertFails(getDocs(collection(u1, 'consultants'))));
await check('owner creates own document', assertSucceeds(setDoc(doc(u1, 'documents/d2'), { consultantId: 'u1' })));
await check('cannot create document for someone else', assertFails(setDoc(doc(u2, 'documents/d3'), { consultantId: 'u1' })));
await check('other user cannot read document', assertFails(getDoc(doc(u2, 'documents/d1'))));
await check('other user cannot overwrite document', assertFails(setDoc(doc(u2, 'documents/d1'), { consultantId: 'u2' })));
await check('owner queries own documents', assertSucceeds(getDocs(query(collection(u1, 'documents'), where('consultantId', '==', 'u1')))));
await check('cannot query all documents', assertFails(getDocs(collection(u2, 'documents'))));
await check('verified owner migrates legacy document', assertSucceeds(setDoc(doc(u1, 'documents/legacy1'), { consultantId: 'u1', clientId: 'c1' })));
await check('anon cannot read client PINs', assertFails(getDoc(doc(anon, 'clients_auth/client@x.co'))));
await check('signed-in user cannot read client PINs', assertFails(getDoc(doc(u1, 'clients_auth/client@x.co'))));
await check('nobody reads portal_access from browser', assertFails(getDoc(doc(u1, 'portal_access/u1_abc'))));
await check('nobody writes mail queue', assertFails(setDoc(doc(u1, 'mail/x'), { to: ['a@b.co'] })));
await check('consultant reads own client message', assertSucceeds(getDoc(doc(u1, 'support_messages/m1'))));
await check('other user cannot read message', assertFails(getDoc(doc(u2, 'support_messages/m1'))));
await check('consultant queries thread', assertSucceeds(getDocs(query(collection(u1, 'support_messages'), where('consultantId', '==', 'u1'), where('clientEmail', '==', 'client@x.co')))));
await check('consultant posts reply', assertSucceeds(setDoc(doc(u1, 'support_messages/m2'), { consultantId: 'u1', sender: 'consultant' })));
await check('consultant cannot forge client message', assertFails(setDoc(doc(u1, 'support_messages/m3'), { consultantId: 'u1', sender: 'client' })));
await check('consultant marks message read', assertSucceeds(updateDoc(doc(u1, 'support_messages/m1'), { status: 'read' })));
await check('anon cannot post message', assertFails(setDoc(doc(anon, 'support_messages/m4'), { consultantId: 'u1', sender: 'client' })));

await env.cleanup();
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} rule checks passed`);
process.exit(failed ? 1 : 0);
