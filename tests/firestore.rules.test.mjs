import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'frilensa-rules-test',
  firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 }
});
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'consultants/u1'), { userProfile: { email: 'one@x.co' } });
  await setDoc(doc(db, 'consultants/one@x.co'), { legacy: true });
  await setDoc(doc(db, 'consultants/u1/documents/inv1'), { id: 'inv1', total: 10 });
  await setDoc(doc(db, 'account_access/u5'), { via: 'invite' });
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
const u3 = env.authenticatedContext('u3', { email: 'three@x.co', email_verified: true }).firestore();
const u5 = env.authenticatedContext('u5', { email: 'five@x.co', email_verified: true }).firestore();
await check('unapproved new account cannot create a workspace', assertFails(setDoc(doc(u3, 'consultants/u3'), { a: 1 })));
await check('unapproved new account cannot write records', assertFails(setDoc(doc(u3, 'consultants/u3/clients/c1'), { id: 'c1' })));
await check('approved new account creates its workspace', assertSucceeds(setDoc(doc(u5, 'consultants/u5'), { a: 1 })));
await check('approved new account writes records', assertSucceeds(setDoc(doc(u5, 'consultants/u5/clients/c1'), { id: 'c1' })));
await check('nobody approves themselves', assertFails(setDoc(doc(u3, 'account_access/u3'), { via: 'self' })));
await check('existing workspace keeps saving without approval', assertSucceeds(setDoc(doc(u1, 'consultants/u1'), { userProfile: { email: 'one@x.co' }, b: 2 })));
await check('owner reads own records', assertSucceeds(getDocs(collection(u1, 'consultants/u1/documents'))));
await check('owner writes own record', assertSucceeds(setDoc(doc(u1, 'consultants/u1/clients/c9'), { id: 'c9' })));
await check('other user cannot read records', assertFails(getDocs(collection(u2, 'consultants/u1/documents'))));
await check('other user cannot write a record', assertFails(setDoc(doc(u2, 'consultants/u1/documents/inv2'), { id: 'inv2' })));
await check('anon cannot read a record', assertFails(getDoc(doc(anon, 'consultants/u1/documents/inv1'))));
await check('owner writes a pay run record', assertSucceeds(setDoc(doc(u1, 'consultants/u1/payRuns/run1'), { id: 'run1' })));
await check('owner writes a supplier record', assertSucceeds(setDoc(doc(u1, 'consultants/u1/suppliers/s1'), { id: 's1' })));
await check('other user cannot read pay runs', assertFails(getDocs(collection(u2, 'consultants/u1/payRuns'))));
await check('owner cannot write an unknown list', assertFails(setDoc(doc(u1, 'consultants/u1/secrets/x'), { a: 1 })));
await check('verified email owner cannot write records under the email doc', assertFails(setDoc(doc(u1, 'consultants/one@x.co/documents/x'), { id: 'x' })));
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

// ---------- Team and accountant access ----------
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'consultants/own1'), { consultantEmail: 'owner@x.co', userProfile: { email: 'owner@x.co' } });
  await setDoc(doc(db, 'consultants/own1/clients/c1'), { id: 'c1', name: 'Client' });
  await setDoc(doc(db, 'consultants/own1/aiConversations/a1'), { id: 'a1', title: 'private' });
  await setDoc(doc(db, 'documents/own1_inv1'), { consultantId: 'own1', id: 'inv1' });
  await setDoc(doc(db, 'workspace_members/own1_acc1'), { ownerUid: 'own1', memberUid: 'acc1', role: 'viewer' });
  await setDoc(doc(db, 'workspace_members/own1_ed1'), { ownerUid: 'own1', memberUid: 'ed1', role: 'editor' });
});
const acc = env.authenticatedContext('acc1', { email: 'acc@x.co', email_verified: true }).firestore();
const ed = env.authenticatedContext('ed1', { email: 'ed@x.co', email_verified: true }).firestore();
await check('viewer reads the owner workspace', assertSucceeds(getDoc(doc(acc, 'consultants/own1'))));
await check('viewer reads the owner records', assertSucceeds(getDocs(collection(acc, 'consultants/own1/clients'))));
await check('viewer cannot read the owner AI chats', assertFails(getDocs(collection(acc, 'consultants/own1/aiConversations'))));
await check('viewer cannot write the head', assertFails(setDoc(doc(acc, 'consultants/own1'), { consultantEmail: 'owner@x.co', x: 1 })));
await check('viewer cannot write a record', assertFails(setDoc(doc(acc, 'consultants/own1/clients/c2'), { id: 'c2' })));
await check('viewer queries the owner documents', assertSucceeds(getDocs(query(collection(acc, 'documents'), where('consultantId', '==', 'own1')))));
await check('viewer cannot write a document', assertFails(setDoc(doc(acc, 'documents/own1_inv2'), { consultantId: 'own1', id: 'inv2' })));
await check('editor writes a record', assertSucceeds(setDoc(doc(ed, 'consultants/own1/clients/c3'), { id: 'c3' })));
await check('editor saves the head keeping the owner', assertSucceeds(setDoc(doc(ed, 'consultants/own1'), { consultantEmail: 'owner@x.co', userProfile: { email: 'owner@x.co' }, y: 2 })));
await check('editor cannot change whose books they are', assertFails(setDoc(doc(ed, 'consultants/own1'), { consultantEmail: 'ed@x.co' })));
await check('editor cannot write the owner AI chats', assertFails(setDoc(doc(ed, 'consultants/own1/aiConversations/a2'), { id: 'a2' })));
await check('editor writes a document for the owner', assertSucceeds(setDoc(doc(ed, 'documents/own1_inv3'), { consultantId: 'own1', id: 'inv3' })));
await check('editor cannot move a document to themselves', assertFails(setDoc(doc(ed, 'documents/own1_inv1'), { consultantId: 'ed1', id: 'inv1' })));
await check('editor cannot delete the workspace', assertFails(deleteDoc(doc(ed, 'consultants/own1'))));
await check('a stranger still cannot read it', assertFails(getDoc(doc(u2, 'consultants/own1'))));
await check('nobody reads memberships from the browser', assertFails(getDoc(doc(acc, 'workspace_members/own1_acc1'))));
await check('nobody makes themselves a member', assertFails(setDoc(doc(u2, 'workspace_members/own1_u2'), { ownerUid: 'own1', memberUid: 'u2', role: 'editor' })));
await check('nobody reads invites', assertFails(getDocs(collection(acc, 'team_invites'))));
await env.withSecurityRulesDisabled(async ctx => { await deleteDoc(doc(ctx.firestore(), 'workspace_members/own1_ed1')); });
await check('access ends when the membership is removed', assertFails(getDoc(doc(ed, 'consultants/own1'))));

await env.cleanup();
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} rule checks passed`);
process.exit(failed ? 1 : 0);
