import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getCountFromServer, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const ts = (millis) => Timestamp.fromMillis(millis);

async function seedChat() {
  const base = Date.now() - 60_000;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'chats/chat-unread'), {
      product_id: 'listing-unread', producto_id: 'listing-unread',
      buyer_id: 'alice', comprador_id: 'alice', seller_id: 'bob', vendedor_id: 'bob',
      participants: ['alice', 'bob'], nombre_otro_usuario: 'Bob',
      created_at: ts(base - 10_000), updated_at: ts(base + 40_000),
      last_message: 'último', last_message_at: ts(base + 40_000),
    });
    await setDoc(doc(db, 'chats/chat-unread/reads/alice'), { user_id: 'alice', read_at: ts(base) });
    await setDoc(doc(db, 'chats/chat-unread/reads/bob'), { user_id: 'bob', read_at: ts(base + 40_000) });
    await setDoc(doc(db, 'chats/chat-unread/messages/m1'), { sender_id: 'bob', text: 'uno', created_at: ts(base + 10_000) });
    await setDoc(doc(db, 'chats/chat-unread/messages/m2'), { sender_id: 'bob', text: 'dos', created_at: ts(base + 20_000) });
    await setDoc(doc(db, 'chats/chat-unread/messages/m3'), { sender_id: 'bob', text: 'tres', created_at: ts(base + 30_000) });
  });
  return base;
}

test('participante obtiene COUNT exacto de mensajes posteriores a read_at', async () => {
  const base = await seedChat();
  const alice = env.authenticatedContext('alice').firestore();
  const q = query(collection(alice, 'chats/chat-unread/messages'), where('created_at', '>', ts(base)));
  const result = await assertSucceeds(getCountFromServer(q));
  if (result.data().count !== 3) throw new Error(`UNREAD_COUNT_MISMATCH:${result.data().count}`);
});

test('usuario ajeno no puede ejecutar COUNT sobre mensajes del chat', async () => {
  const base = await seedChat();
  const eve = env.authenticatedContext('eve').firestore();
  const q = query(collection(eve, 'chats/chat-unread/messages'), where('created_at', '>', ts(base)));
  await assertFails(getCountFromServer(q));
});

test('read-marker sólo puede actualizarlo el participante propietario', async () => {
  const base = await seedChat();
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(updateDoc(doc(alice, 'chats/chat-unread/reads/alice'), { user_id: 'alice', read_at: ts(base + 35_000) }));
  await assertFails(updateDoc(doc(bob, 'chats/chat-unread/reads/alice'), { user_id: 'alice', read_at: ts(base + 36_000) }));
});

test('COUNT después de read-marker actualizado refleja sólo mensajes posteriores', async () => {
  const base = await seedChat();
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(updateDoc(doc(alice, 'chats/chat-unread/reads/alice'), { user_id: 'alice', read_at: ts(base + 20_000) }));
  const q = query(collection(alice, 'chats/chat-unread/messages'), where('created_at', '>', ts(base + 20_000)));
  const result = await assertSucceeds(getCountFromServer(q));
  if (result.data().count !== 1) throw new Error(`UNREAD_AFTER_MARKER_MISMATCH:${result.data().count}`);
});
