import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

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
    await setDoc(doc(ctx.firestore(), 'notification_outbox/n1'), {
      recipient_uid: 'alice', kind: 'new_message', title: 'Mensaje', body: 'Hola', created_at: now(), updated_at: now(),
    });
  });
});

test('destinatario puede crear recibo sólo para su notificación', async () => {
  const alice = verifiedContext(env, 'alice').firestore();
  const payload = { owner_uid: 'alice', notification_id: 'n1', read_at: now(), created_at: now(), updated_at: now() };
  await assertSucceeds(setDoc(doc(alice, 'notification_receipts/alice-n1'), payload));
  await assertSucceeds(getDoc(doc(alice, 'notification_receipts/alice-n1')));
  await assertFails(setDoc(doc(alice, 'notification_receipts/alice-missing'), { ...payload, notification_id: 'missing' }));
});

test('otro usuario no puede leer, crear ni modificar el recibo', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'notification_receipts/alice-n1'), { owner_uid: 'alice', notification_id: 'n1', read_at: now(), created_at: now(), updated_at: now() });
  });
  const bob = verifiedContext(env, 'bob').firestore();
  await assertFails(getDoc(doc(bob, 'notification_receipts/alice-n1')));
  await assertFails(updateDoc(doc(bob, 'notification_receipts/alice-n1'), { read_at: now(), updated_at: now() }));
});

test('propietario sólo puede actualizar read_at y updated_at', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'notification_receipts/alice-n1'), { owner_uid: 'alice', notification_id: 'n1', read_at: now(), created_at: now(), updated_at: now() });
  });
  const alice = verifiedContext(env, 'alice').firestore();
  await assertSucceeds(updateDoc(doc(alice, 'notification_receipts/alice-n1'), { read_at: now(), updated_at: now() }));
  await assertFails(updateDoc(doc(alice, 'notification_receipts/alice-n1'), { notification_id: 'other', read_at: now(), updated_at: now() }));
});
