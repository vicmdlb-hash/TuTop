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
  const owner = env.authenticatedContext('alice').firestore();
  const stranger = env.authenticatedContext('bob').firestore();
  const ref = doc(owner, 'account_deletion_requests/alice');
  await assertSucceeds(setDoc(ref, { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() }));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(stranger, 'account_deletion_requests/alice')));
  await assertFails(updateDoc(ref, { status: 'processing', updated_at: now() }));
});

test('support procesa sólo transiciones forward y no reabre solicitudes cerradas', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const support = env.authenticatedContext('support').firestore();
  const ref = doc(support, 'account_deletion_requests/alice');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'pending', updated_at: now() }));
  await assertSucceeds(updateDoc(ref, { status: 'completed', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'rejected', updated_at: now() }));
});

test('support puede rechazar pending pero no alterar identidad ni fecha original', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const support = env.authenticatedContext('support').firestore();
  const ref = doc(support, 'account_deletion_requests/alice');
  await assertFails(updateDoc(ref, { uid: 'mallory', status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { requested_at: now(), status: 'processing', updated_at: now() }));
  await assertSucceeds(updateDoc(ref, { status: 'rejected', updated_at: now() }));
});

test('moderator general no hereda permisos de privacidad de soporte', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const moderator = env.authenticatedContext('moderator').firestore();
  await assertFails(getDoc(doc(moderator, 'account_deletion_requests/alice')));
  await assertFails(updateDoc(doc(moderator, 'account_deletion_requests/alice'), { status: 'processing', updated_at: now() }));
});
