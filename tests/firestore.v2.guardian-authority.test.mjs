import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

// This suite tests the Firestore STORAGE trust boundary only. It does not prove
// trusted issuance, consent validity, or guardian enforcement of chats/offers.
const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-guardian-authority';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: hostname, port: Number(portRaw || 8080), rules },
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/operator'), { active: true, role: 'super_admin' });
    await setDoc(doc(db, 'age_proofs_v2/child'), {
      subjectUid: 'child', band: 'under_13', issuer: 'trusted_server', revoked: false,
    });
    await setDoc(doc(db, 'guardian_grants_v2/child'), {
      childUid: 'child', guardianUid: 'guardian', active: true,
      approvedCapabilities: ['publish_listing'], issuer: 'trusted_server',
    });
    await setDoc(doc(db, 'adult_actions_v2/child'), {
      subjectUid: 'child', actorUid: 'guardian', capability: 'share_personal_info',
      authorized: true, issuer: 'trusted_server',
    });
  });
});

const paths = [
  'age_proofs_v2/child',
  'guardian_grants_v2/child',
  'adult_actions_v2/child',
];

test('only the exact child account can read trusted evidence documents', async () => {
  const child = verifiedContext(env, 'child').firestore();
  const guardian = verifiedContext(env, 'guardian').firestore();
  const stranger = verifiedContext(env, 'stranger').firestore();
  const clientAdmin = verifiedContext(env, 'operator').firestore();
  const guest = env.unauthenticatedContext().firestore();
  for (const path of paths) {
    await assertSucceeds(getDoc(doc(child, path)));
    await assertFails(getDoc(doc(guardian, path)));
    await assertFails(getDoc(doc(stranger, path)));
    await assertFails(getDoc(doc(clientAdmin, path)));
    await assertFails(getDoc(doc(guest, path)));
  }
});

test('no signed-in client, including subject and admin-role client, may issue or rewrite trusted evidence', async () => {
  for (const uid of ['child', 'guardian', 'stranger', 'operator']) {
    const db = verifiedContext(env, uid).firestore();
    for (const path of paths) {
      await assertFails(setDoc(doc(db, path), { issuer: 'trusted_server', revoked: false }));
      await assertFails(updateDoc(doc(db, path), { revoked: false }));
      await assertFails(deleteDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path.replace('/child', '/new-subject')), {
        issuer: 'trusted_server', authorized: true,
      }));
    }
  }
});

test('list enumeration is denied even to the document subject', async () => {
  const child = verifiedContext(env, 'child').firestore();
  const clientAdmin = verifiedContext(env, 'operator').firestore();
  for (const prefix of ['age_proofs_v2', 'guardian_grants_v2', 'adult_actions_v2']) {
    await assertFails(getDocs(collection(child, prefix)));
    await assertFails(getDocs(collection(clientAdmin, prefix)));
  }
});

test('backend revocation is visible to subject and cannot be reversed from an app', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/child'), { revoked: true });
    await updateDoc(doc(ctx.firestore(), 'guardian_grants_v2/child'), { active: false });
    await updateDoc(doc(ctx.firestore(), 'adult_actions_v2/child'), { authorized: false });
  });
  const child = verifiedContext(env, 'child').firestore();
  assert.equal((await assertSucceeds(getDoc(doc(child, paths[0])))).data().revoked, true);
  assert.equal((await assertSucceeds(getDoc(doc(child, paths[1])))).data().active, false);
  assert.equal((await assertSucceeds(getDoc(doc(child, paths[2])))).data().authorized, false);
  await assertFails(updateDoc(doc(child, paths[0]), { revoked: false }));
  await assertFails(updateDoc(doc(child, paths[1]), { active: true }));
  await assertFails(updateDoc(doc(child, paths[2]), { authorized: true }));
});
