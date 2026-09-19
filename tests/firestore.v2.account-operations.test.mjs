import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

const now = () => Timestamp.now();

after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/support'), { active: true, role: 'support' });
    await setDoc(doc(db, 'admins/moderator'), { active: true, role: 'moderator' });
  });
});

test('owner crea solicitud pending y terceros no pueden leerla ni modificarla', async () => {
  const owner = verifiedContext(env, 'alice').firestore();
  const stranger = verifiedContext(env, 'bob').firestore();
  const ref = doc(owner, 'account_deletion_requests/alice');
  await assertSucceeds(setDoc(ref, { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() }));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(stranger, 'account_deletion_requests/alice')));
  await assertFails(updateDoc(ref, { status: 'processing', updated_at: now() }));
});

test('support puede iniciar procesamiento pero no declarar completed desde cliente', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const support = verifiedContext(env, 'support').firestore();
  const ref = doc(support, 'account_deletion_requests/alice');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'pending', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'completed', updated_at: now() }));
  await assertSucceeds(updateDoc(ref, { status: 'rejected', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'processing', updated_at: now() }));
});

test('support puede rechazar pending pero no alterar identidad ni fecha original', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const support = verifiedContext(env, 'support').firestore();
  const ref = doc(support, 'account_deletion_requests/alice');
  await assertFails(updateDoc(ref, { uid: 'mallory', status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { requested_at: now(), status: 'processing', updated_at: now() }));
  await assertSucceeds(updateDoc(ref, { status: 'rejected', updated_at: now() }));
});

test('support audita sólo operaciones de eliminación de cuenta', async () => {
  const support = verifiedContext(env, 'support').firestore();
  await assertSucceeds(setDoc(doc(support, 'audit_log/delete-alice'), {
    admin_uid: 'support', actor_type: 'admin', role: 'support', action: 'account_deletion_processing',
    target_type: 'account_deletion_request', target_id: 'alice', created_at: now(),
  }));
  await assertSucceeds(getDoc(doc(support, 'audit_log/delete-alice')));
  await assertFails(setDoc(doc(support, 'audit_log/moderate-product'), {
    admin_uid: 'support', actor_type: 'admin', role: 'support', action: 'listing_approved',
    target_type: 'listing', target_id: 'listing-1', created_at: now(),
  }));
});

test('moderator general no hereda permisos de privacidad de soporte', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const moderator = verifiedContext(env, 'moderator').firestore();
  await assertFails(getDoc(doc(moderator, 'account_deletion_requests/alice')));
  await assertFails(updateDoc(doc(moderator, 'account_deletion_requests/alice'), { status: 'processing', updated_at: now() }));
});
