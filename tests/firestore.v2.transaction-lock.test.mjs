import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());
const now = () => Timestamp.now();
const future = (minutes = 120) => Timestamp.fromMillis(Date.now() + minutes * 60_000);

async function seedCatalog(db) {
  await setDoc(doc(db, 'institutions/uatx'), { name: 'UATx', active: true });
  await setDoc(doc(db, 'campuses/campus'), { institution_id: 'uatx', name: 'Campus', active: true });
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await seedCatalog(db);
    await setDoc(doc(db, 'listings_v2/listing-1'), { seller_id: 'seller', institution_id: 'uatx', campus_id: 'campus', status: 'active', moderation_status: 'approved' });
    for (const buyer of ['buyer-a', 'buyer-b']) {
      const suffix = buyer === 'buyer-a' ? 'a' : 'b';
      await setDoc(doc(db, `chats/chat-${suffix}`), { product_id: 'listing-1', buyer_id: buyer, seller_id: 'seller', participants: [buyer, 'seller'], last_message: '', updated_at: now(), last_message_at: now() });
      await setDoc(doc(db, `offers/offer-${suffix}`), { listing_id: 'listing-1', chat_id: `chat-${suffix}`, buyer_id: buyer, seller_id: 'seller', created_by: buyer, amount_mxn: 400 + (suffix === 'b' ? 10 : 0), status: 'pending', created_at: now(), updated_at: now() });
    }
  });
}

function reserveBatch(db, suffix, buyer, amount) {
  const txId = `tx-offer-${suffix}`;
  const at = now();
  const batch = writeBatch(db);
  batch.update(doc(db, `offers/offer-${suffix}`), { status: 'accepted', updated_at: at });
  batch.set(doc(db, `transactions_v2/${txId}`), {
    listing_id: 'listing-1', chat_id: `chat-${suffix}`, buyer_id: buyer, seller_id: 'seller', accepted_offer_id: `offer-${suffix}`,
    agreed_amount_mxn: amount, status: 'reserved', reservation_expires_at: future(), created_at: at, updated_at: at,
  });
  batch.set(doc(db, 'listing_reservation_locks/listing-1'), {
    listing_id: 'listing-1', transaction_id: txId, buyer_id: buyer, seller_id: 'seller', created_at: at, updated_at: at,
  });
  batch.update(doc(db, `chats/chat-${suffix}`), { transaction_id: txId, current_offer_id: `offer-${suffix}`, updated_at: at });
  return batch;
}

test('sólo una reservation lock puede existir por listing', async () => {
  await seed();
  const seller = env.authenticatedContext('seller').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());
  await assertFails(reserveBatch(seller, 'b', 'buyer-b', 410).commit());
  const lock = await getDoc(doc(seller, 'listing_reservation_locks/listing-1'));
  if (lock.data()?.transaction_id !== 'tx-offer-a') throw new Error('reservation lock changed unexpectedly');
});

test('cancelación atómica libera lock y permite una nueva reserva', async () => {
  await seed();
  const seller = env.authenticatedContext('seller').firestore();
  const buyerA = env.authenticatedContext('buyer-a').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());

  const cancel = writeBatch(buyerA);
  const at = now();
  cancel.update(doc(buyerA, 'transactions_v2/tx-offer-a'), {
    status: 'cancelled', outcome_code: 'buyer_cancelled', outcome_actor_id: 'buyer-a', outcome_recorded_at: at, updated_at: at,
  });
  cancel.delete(doc(buyerA, 'listing_reservation_locks/listing-1'));
  await assertSucceeds(cancel.commit());

  await assertSucceeds(reserveBatch(seller, 'b', 'buyer-b', 410).commit());
});

test('cancelar sin borrar lock queda bloqueado', async () => {
  await seed();
  const seller = env.authenticatedContext('seller').firestore();
  const buyerA = env.authenticatedContext('buyer-a').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());
  const at = now();
  const bad = writeBatch(buyerA);
  bad.update(doc(buyerA, 'transactions_v2/tx-offer-a'), {
    status: 'cancelled', outcome_code: 'buyer_cancelled', outcome_actor_id: 'buyer-a', outcome_recorded_at: at, updated_at: at,
  });
  await assertFails(bad.commit());
});

test('venta completada sólo libera lock junto con sold_out', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const at = now();
    await seedCatalog(db);
    await setDoc(doc(db, 'listings_v2/listing-1'), { seller_id: 'seller', institution_id: 'uatx', campus_id: 'campus', status: 'active', moderation_status: 'approved', created_at: at, updated_at: at });
    await setDoc(doc(db, 'transactions_v2/tx-done'), {
      listing_id: 'listing-1', chat_id: 'chat-done', buyer_id: 'buyer-a', seller_id: 'seller', accepted_offer_id: 'offer-done', agreed_amount_mxn: 400,
      status: 'completed', reservation_expires_at: future(), buyer_confirmed_at: at, seller_confirmed_at: at, created_at: at, updated_at: at,
    });
    await setDoc(doc(db, 'listing_reservation_locks/listing-1'), {
      listing_id: 'listing-1', transaction_id: 'tx-done', buyer_id: 'buyer-a', seller_id: 'seller', created_at: at, updated_at: at,
    });
  });
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails((async () => {
    const bad = writeBatch(seller);
    bad.delete(doc(seller, 'listing_reservation_locks/listing-1'));
    return bad.commit();
  })());
  const complete = writeBatch(seller);
  complete.update(doc(seller, 'listings_v2/listing-1'), { status: 'sold_out', updated_at: now() });
  complete.delete(doc(seller, 'listing_reservation_locks/listing-1'));
  await assertSucceeds(complete.commit());
});
