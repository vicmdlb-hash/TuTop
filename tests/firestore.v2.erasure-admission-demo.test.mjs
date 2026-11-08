import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { verifiedContext } from './verified-context.mjs';

// DEMO ONLY. This does not authorize Admin SDK writers or destructive --apply.
if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules')
  throw new Error('ERASURE_FREEZE_TEST_DEMO_ONLY');
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-tutop-post120-rules',
  firestore: {
    host: hostname, port: Number(portRaw || 8080),
    rules: fs.readFileSync('firebase/firestore.v2.erasure-freeze-demo.rules', 'utf8'),
  },
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());
const now = () => Timestamp.now(), future = () => Timestamp.fromMillis(Date.now() + 3600000);

async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/buyer'), { uid: 'buyer', institution_id: 'uatx', campus_id: 'u', nombre: 'Buyer' });
    await setDoc(doc(db, 'users/seller'), { uid: 'seller', institution_id: 'uatx', campus_id: 'u', nombre: 'Seller' });
    await setDoc(doc(db, 'products/listing'), { vendedor_id: 'seller', estado: 'Activo' });
    await setDoc(doc(db, 'listings_v2/listing'), { schema_version: 2, seller_id: 'seller', status: 'active', moderation_status: 'approved' });
  });
}
function chat() {
  return { product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer',
    seller_id: 'seller', vendedor_id: 'seller', participants: ['buyer', 'seller'],
    nombre_otro_usuario: 'Seller', last_message: '', last_message_at: now(),
    created_at: now(), updated_at: now() };
}
async function preseedChat() {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'chats/chat-buyer-listing'), chat()));
}
function countedWrite(db, action, operation) {
  const batch = writeBatch(db);
  operation(batch);
  batch.set(doc(db, 'rate_limits/buyer-' + action),
    { uid: 'buyer', action, window_start: now(), count: 1, updated_at: now() });
  return batch.commit();
}
const asBuyer = () => verifiedContext(env, 'buyer').firestore();
const createChat = db => countedWrite(db, 'chat_create', b => b.set(doc(db,'chats/chat-buyer-listing'), chat()));
const createOffer = db => countedWrite(db, 'offer_create', b => b.set(doc(db,'offers/offer-1'), {
  listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller',
  created_by: 'buyer', amount_mxn: 300, status: 'pending', expires_at: future(),
  created_at: now(), updated_at: now(),
}));
const createMessage = db => countedWrite(db, 'message_create', b => b.set(doc(db,'chats/chat-buyer-listing/messages/m1'), {
  sender_id: 'buyer', text: 'Prueba sin datos reales', created_at: now(),
}));
async function deletion(uid, status = 'pending') {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'account_deletion_requests/' + uid),
      { uid, status, requested_at: now(), updated_at: now() }));
}

test('no active erasure permits normal buyer chat creation (regression)', async () => {
  await seed();
  await assertSucceeds(createChat(asBuyer()));
});
test('baseline active buyer and seller permit an offer to an existing chat (positive control)', async () => {
  await seed(); await preseedChat();
  await assertSucceeds(createOffer(asBuyer()));
});
test('baseline active buyer and seller permit a message to an existing chat (positive control)', async () => {
  await seed(); await preseedChat();
  await assertSucceeds(createMessage(asBuyer()));
});
test('pending buyer forbids a new chat, even if authenticated and verified', async () => {
  await seed(); await deletion('buyer');
  await assertFails(createChat(asBuyer()));
});
test('pending seller forbids a buyer-originated chat (counterparty freeze)', async () => {
  await seed(); await deletion('seller');
  await assertFails(createChat(asBuyer()));
});
test('rejected request may resume normal chat', async () => {
  await seed(); await deletion('seller', 'rejected');
  await assertSucceeds(createChat(asBuyer()));
});
test('unknown deletion status fails closed instead of allowing new commerce', async () => {
  await seed(); await deletion('seller', 'unexpected');
  await assertFails(createChat(asBuyer()));
});
test('processing buyer blocks a new chat just like pending buyer', async () => {
  await seed(); await deletion('buyer', 'processing');
  await assertFails(createChat(asBuyer()));
});
test('pending seller cannot admit an offer to historical chat', async () => {
  await seed(); await preseedChat();
  await deletion('seller');
  await assertFails(createOffer(asBuyer()));
});
test('pending buyer cannot admit an offer to historical chat either', async () => {
  await seed(); await preseedChat();
  await deletion('buyer');
  await assertFails(createOffer(asBuyer()));
});
test('pending counterparty denies new messages but preserves historical chat read', async () => {
  await seed(); await preseedChat(); await deletion('seller', 'processing');
  const db = asBuyer();
  await assertFails(createMessage(db));
  await assertSucceeds(getDoc(doc(db,'chats/chat-buyer-listing')));
});
test('owner can create own deletion request, then commerce admission closes', async () => {
  await seed(); const db = asBuyer();
  await assertSucceeds(setDoc(doc(db,'account_deletion_requests/buyer'),
    { uid:'buyer', status:'pending', requested_at:now(), updated_at:now() }));
  await assertFails(createChat(db));
});
