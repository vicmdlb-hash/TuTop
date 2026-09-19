import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, writeBatch, deleteDoc } from 'firebase/firestore';

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

async function seedCanonicalListing(db, at = now(), status = 'active', availability = 'available') {
  await setDoc(doc(db, 'listings_v2/listing-1'), {
    schema_version: 2,
    seller_id: 'seller',
    institution_id: 'uatx',
    campus_id: 'campus',
    category_id: 'electronics',
    title: 'Listing QA',
    description: 'Fixture canónico completo para pruebas de reserva.',
    attributes: {},
    price_mxn: 400,
    negotiable: true,
    quantity: 1,
    condition: 'good',
    delivery_methods: ['meetup'],
    meeting_point_ids: [],
    shipping_available: false,
    photo_urls: ['data:image/png;base64,AA'],
    status,
    moderation_status: 'approved',
    availability_status: availability,
    visibility_scope: 'campus',
    published_at: at,
    created_at: at,
    updated_at: at,
  });
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await seedCatalog(db);
    await seedCanonicalListing(db);
    for (const buyer of ['buyer-a', 'buyer-b']) {
      const suffix = buyer === 'buyer-a' ? 'a' : 'b';
      await setDoc(doc(db, `chats/chat-${suffix}`), { product_id: 'listing-1', buyer_id: buyer, seller_id: 'seller', participants: [buyer, 'seller'], last_message: '', updated_at: now(), last_message_at: now() });
      await setDoc(doc(db, `offers/offer-${suffix}`), { listing_id: 'listing-1', chat_id: `chat-${suffix}`, buyer_id: buyer, seller_id: 'seller', created_by: buyer, amount_mxn: 400 + (suffix === 'b' ? 10 : 0), status: 'pending', created_at: now(), updated_at: now() });
    }
    await setDoc(doc(db, 'offers/seller-counter-a'), {
      listing_id: 'listing-1',
      chat_id: 'chat-a',
      buyer_id: 'buyer-a',
      seller_id: 'seller',
      created_by: 'seller',
      amount_mxn: 390,
      status: 'pending',
      parent_offer_id: 'offer-a',
      expires_at: future(1440),
      created_at: now(),
      updated_at: now(),
    });
  });
}

function createOfferBatch(db, { offerId, buyerId, chatId, amountMxn, rateCount, windowStart }) {
  const at = now();
  const batch = writeBatch(db);
  batch.set(doc(db, `offers/${offerId}`), {
    listing_id: 'listing-1',
    chat_id: chatId,
    buyer_id: buyerId,
    seller_id: 'seller',
    created_by: buyerId,
    amount_mxn: amountMxn,
    status: 'pending',
    expires_at: future(1440),
    created_at: at,
    updated_at: at,
  });
  batch.update(doc(db, `chats/${chatId}`), { current_offer_id: offerId, updated_at: at });
  batch.set(doc(db, `rate_limits/${buyerId}-offer_create`), {
    uid: buyerId,
    action: 'offer_create',
    window_start: windowStart,
    count: rateCount,
    updated_at: at,
  });
  return batch;
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
  batch.update(doc(db, 'listings_v2/listing-1'), { availability_status: 'reserved', updated_at: at });
  batch.update(doc(db, `chats/chat-${suffix}`), { transaction_id: txId, current_offer_id: `offer-${suffix}`, updated_at: at });
  return batch;
}

function buyerAcceptSellerCounterBatch(db) {
  const at = now();
  const txId = 'tx-seller-counter-a';
  const batch = writeBatch(db);
  batch.update(doc(db, 'offers/seller-counter-a'), { status: 'accepted', updated_at: at });
  batch.set(doc(db, `transactions_v2/${txId}`), {
    listing_id: 'listing-1',
    chat_id: 'chat-a',
    buyer_id: 'buyer-a',
    seller_id: 'seller',
    accepted_offer_id: 'seller-counter-a',
    agreed_amount_mxn: 390,
    status: 'reserved',
    reservation_expires_at: future(),
    created_at: at,
    updated_at: at,
  });
  batch.set(doc(db, 'listing_reservation_locks/listing-1'), {
    listing_id: 'listing-1',
    transaction_id: txId,
    buyer_id: 'buyer-a',
    seller_id: 'seller',
    created_at: at,
    updated_at: at,
  });
  batch.update(doc(db, 'listings_v2/listing-1'), { availability_status: 'reserved', updated_at: at });
  batch.update(doc(db, 'chats/chat-a'), { transaction_id: txId, current_offer_id: 'seller-counter-a', updated_at: at });
  return batch;
}


async function seedCompletionState({ txStatus = 'meetup_scheduled', listingStatus = 'active', preconfirmed = 'buyer' } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const at = now();
    await seedCatalog(db);
    await seedCanonicalListing(db, at, listingStatus, 'reserved');
    await setDoc(doc(db, 'transactions_v2/tx-done'), {
      listing_id: 'listing-1',
      chat_id: 'chat-done',
      buyer_id: 'buyer-a',
      seller_id: 'seller',
      accepted_offer_id: 'offer-done',
      agreed_amount_mxn: 400,
      status: txStatus,
      reservation_expires_at: future(),
      meeting_point_id: 'point-done',
      meetup_at: future(60),
      ...((preconfirmed === 'buyer' || txStatus === 'completed') ? { buyer_confirmed_at: at } : {}),
      ...((preconfirmed === 'seller' || txStatus === 'completed') ? { seller_confirmed_at: at } : {}),
      created_at: at,
      updated_at: at,
    });
    await setDoc(doc(db, 'listing_reservation_locks/listing-1'), {
      listing_id: 'listing-1', transaction_id: 'tx-done', buyer_id: 'buyer-a', seller_id: 'seller', created_at: at, updated_at: at,
    });
  });
}

function completionPhaseOne(db, { sellOut = true, completeTx = true, actor = 'seller' } = {}) {
  const at = now();
  const batch = writeBatch(db);
  if (completeTx) {
    batch.update(doc(db, 'transactions_v2/tx-done'), {
      status: 'completed',
      ...(actor === 'buyer' ? { buyer_confirmed_at: at } : { seller_confirmed_at: at }),
      updated_at: at,
    });
  }
  if (sellOut) batch.update(doc(db, 'listings_v2/listing-1'), { status: 'sold_out', updated_at: at });
  return batch;
}

test('comprador acepta contraoferta creada por vendedor y reserva atómicamente', async () => {
  await seed();
  const buyer = verifiedContext(env, 'buyer-a').firestore();
  await assertSucceeds(buyerAcceptSellerCounterBatch(buyer).commit());

  const tx = await getDoc(doc(buyer, 'transactions_v2/tx-seller-counter-a'));
  if (!tx.exists() || tx.data()?.status !== 'reserved') throw new Error('buyer acceptance must create reserved transaction');
  const lock = await getDoc(doc(buyer, 'listing_reservation_locks/listing-1'));
  if (lock.data()?.transaction_id !== 'tx-seller-counter-a') throw new Error('buyer acceptance must create reservation lock');
  const listing = await getDoc(doc(buyer, 'listings_v2/listing-1'));
  if (listing.data()?.availability_status !== 'reserved') throw new Error('buyer acceptance must project reserved availability');
});

test('comprador no puede auto-reservar una oferta creada por comprador', async () => {
  await seed();
  const buyer = verifiedContext(env, 'buyer-a').firestore();
  const at = now();
  const batch = writeBatch(buyer);
  batch.update(doc(buyer, 'offers/offer-a'), { status: 'accepted', updated_at: at });
  batch.set(doc(buyer, 'transactions_v2/tx-offer-a'), {
    listing_id: 'listing-1',
    chat_id: 'chat-a',
    buyer_id: 'buyer-a',
    seller_id: 'seller',
    accepted_offer_id: 'offer-a',
    agreed_amount_mxn: 400,
    status: 'reserved',
    reservation_expires_at: future(),
    created_at: at,
    updated_at: at,
  });
  batch.set(doc(buyer, 'listing_reservation_locks/listing-1'), {
    listing_id: 'listing-1',
    transaction_id: 'tx-offer-a',
    buyer_id: 'buyer-a',
    seller_id: 'seller',
    created_at: at,
    updated_at: at,
  });
  batch.update(doc(buyer, 'listings_v2/listing-1'), { availability_status: 'reserved', updated_at: at });
  batch.update(doc(buyer, 'chats/chat-a'), { transaction_id: 'tx-offer-a', current_offer_id: 'offer-a', updated_at: at });
  await assertFails(batch.commit());
});

test('comprador no puede crear reserva de contraoferta sin aceptar la oferta en el mismo commit', async () => {
  await seed();
  const buyer = verifiedContext(env, 'buyer-a').firestore();
  const at = now();
  const batch = writeBatch(buyer);
  batch.set(doc(buyer, 'transactions_v2/tx-seller-counter-a'), {
    listing_id: 'listing-1',
    chat_id: 'chat-a',
    buyer_id: 'buyer-a',
    seller_id: 'seller',
    accepted_offer_id: 'seller-counter-a',
    agreed_amount_mxn: 390,
    status: 'reserved',
    reservation_expires_at: future(),
    created_at: at,
    updated_at: at,
  });
  batch.set(doc(buyer, 'listing_reservation_locks/listing-1'), {
    listing_id: 'listing-1',
    transaction_id: 'tx-seller-counter-a',
    buyer_id: 'buyer-a',
    seller_id: 'seller',
    created_at: at,
    updated_at: at,
  });
  batch.update(doc(buyer, 'listings_v2/listing-1'), { availability_status: 'reserved', updated_at: at });
  await assertFails(batch.commit());
});

test('buyer puede ofertar antes del lock pero no crear nuevas ofertas mientras listing está reservado', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  const buyerB = verifiedContext(env, 'buyer-b').firestore();
  const windowStart = now();

  await assertSucceeds(createOfferBatch(buyerB, {
    offerId: 'offer-b-prelock',
    buyerId: 'buyer-b',
    chatId: 'chat-b',
    amountMxn: 415,
    rateCount: 1,
    windowStart,
  }).commit());

  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());

  await assertFails(createOfferBatch(buyerB, {
    offerId: 'offer-b-after-lock',
    buyerId: 'buyer-b',
    chatId: 'chat-b',
    amountMxn: 420,
    rateCount: 2,
    windowStart,
  }).commit());
});

test('reserva exige proyección pública reserved en el mismo commit', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  const at = now();
  const batch = writeBatch(seller);
  batch.update(doc(seller, 'offers/offer-a'), { status: 'accepted', updated_at: at });
  batch.set(doc(seller, 'transactions_v2/tx-offer-a'), {
    listing_id: 'listing-1', chat_id: 'chat-a', buyer_id: 'buyer-a', seller_id: 'seller', accepted_offer_id: 'offer-a',
    agreed_amount_mxn: 400, status: 'reserved', reservation_expires_at: future(), created_at: at, updated_at: at,
  });
  batch.set(doc(seller, 'listing_reservation_locks/listing-1'), {
    listing_id: 'listing-1', transaction_id: 'tx-offer-a', buyer_id: 'buyer-a', seller_id: 'seller', created_at: at, updated_at: at,
  });
  batch.update(doc(seller, 'chats/chat-a'), { transaction_id: 'tx-offer-a', current_offer_id: 'offer-a', updated_at: at });
  await assertFails(batch.commit());
});

test('seller no puede fingir reserved sin lock transaccional', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  await assertFails(setDoc(doc(seller, 'listings_v2/listing-1'), {
    availability_status: 'reserved',
    updated_at: now(),
  }, { merge: true }));
});

test('sólo una reservation lock puede existir por listing', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());
  await assertFails(reserveBatch(seller, 'b', 'buyer-b', 410).commit());
  const lock = await getDoc(doc(seller, 'listing_reservation_locks/listing-1'));
  if (lock.data()?.transaction_id !== 'tx-offer-a') throw new Error('reservation lock changed unexpectedly');
});

test('cancelación atómica libera lock y permite una nueva reserva', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  const buyerA = verifiedContext(env, 'buyer-a').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());

  const cancel = writeBatch(buyerA);
  const at = now();
  cancel.update(doc(buyerA, 'transactions_v2/tx-offer-a'), {
    status: 'cancelled', outcome_code: 'buyer_cancelled', outcome_actor_id: 'buyer-a', outcome_recorded_at: at, updated_at: at,
  });
  cancel.delete(doc(buyerA, 'listing_reservation_locks/listing-1'));
  cancel.update(doc(buyerA, 'listings_v2/listing-1'), { availability_status: 'available', updated_at: at });
  await assertSucceeds(cancel.commit());

  const reopened = await getDoc(doc(seller, 'listings_v2/listing-1'));
  if (reopened.data()?.availability_status !== 'available') throw new Error('cancel must restore public availability');
  await assertSucceeds(reserveBatch(seller, 'b', 'buyer-b', 410).commit());
});

test('cancelación con lock borrado pero sin restaurar availability queda bloqueada', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  const buyerA = verifiedContext(env, 'buyer-a').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());
  const at = now();
  const bad = writeBatch(buyerA);
  bad.update(doc(buyerA, 'transactions_v2/tx-offer-a'), {
    status: 'cancelled', outcome_code: 'buyer_cancelled', outcome_actor_id: 'buyer-a', outcome_recorded_at: at, updated_at: at,
  });
  bad.delete(doc(buyerA, 'listing_reservation_locks/listing-1'));
  await assertFails(bad.commit());
});

test('cancelar sin borrar lock queda bloqueado', async () => {
  await seed();
  const seller = verifiedContext(env, 'seller').firestore();
  const buyerA = verifiedContext(env, 'buyer-a').firestore();
  await assertSucceeds(reserveBatch(seller, 'a', 'buyer-a', 400).commit());
  const at = now();
  const bad = writeBatch(buyerA);
  bad.update(doc(buyerA, 'transactions_v2/tx-offer-a'), {
    status: 'cancelled', outcome_code: 'buyer_cancelled', outcome_actor_id: 'buyer-a', outcome_recorded_at: at, updated_at: at,
  });
  await assertFails(bad.commit());
});

test('vendedor-segundo: tx completed + listing sold_out es atómica y conserva lock', async () => {
  await seedCompletionState({ preconfirmed: 'buyer' });
  const seller = verifiedContext(env, 'seller').firestore();
  await assertSucceeds(completionPhaseOne(seller, { actor: 'seller' }).commit());
  const lock = await getDoc(doc(seller, 'listing_reservation_locks/listing-1'));
  if (!lock.exists()) throw new Error('lock debe sobrevivir hasta cleanup trusted');
});

test('comprador-segundo: tx completed también exige y permite sold_out atómico', async () => {
  await seedCompletionState({ preconfirmed: 'seller' });
  const buyer = verifiedContext(env, 'buyer-a').firestore();
  const seller = verifiedContext(env, 'seller').firestore();
  await assertSucceeds(completionPhaseOne(buyer, { actor: 'buyer' }).commit());
  const listing = await getDoc(doc(seller, 'listings_v2/listing-1'));
  if (listing.data()?.status !== 'sold_out') throw new Error('buyer-second completion must atomically close listing');
});

test('comprador-segundo no puede completar tx sin sold_out', async () => {
  await seedCompletionState({ preconfirmed: 'seller' });
  const buyer = verifiedContext(env, 'buyer-a').firestore();
  await assertFails(completionPhaseOne(buyer, { actor: 'buyer', sellOut: false }).commit());
});

test('comprador no puede marcar sold_out sin completar su transacción', async () => {
  await seedCompletionState({ preconfirmed: 'seller' });
  const buyer = verifiedContext(env, 'buyer-a').firestore();
  await assertFails(completionPhaseOne(buyer, { actor: 'buyer', completeTx: false, sellOut: true }).commit());
});

test('cliente no puede borrar lock completado aunque listing ya esté sold_out', async () => {
  await seedCompletionState({ txStatus: 'completed', listingStatus: 'sold_out' });
  const seller = verifiedContext(env, 'seller').firestore();
  await assertFails(deleteDoc(doc(seller, 'listing_reservation_locks/listing-1')));
});

test('completion vendedor-segundo sin sold_out queda bloqueada por regla de transacción', async () => {
  await seedCompletionState({ preconfirmed: 'buyer' });
  const seller = verifiedContext(env, 'seller').firestore();
  await assertFails(completionPhaseOne(seller, { actor: 'seller', sellOut: false, completeTx: true }).commit());
});

test('sold_out del seller sin completar tx no autoriza liberar lock', async () => {
  await seedCompletionState({ preconfirmed: 'buyer' });
  const seller = verifiedContext(env, 'seller').firestore();
  await assertSucceeds(completionPhaseOne(seller, { actor: 'seller', sellOut: true, completeTx: false }).commit());
  await assertFails(deleteDoc(doc(seller, 'listing_reservation_locks/listing-1')));
});

test('lock histórico completed no se libera desde cliente aunque listing siga active', async () => {
  await seedCompletionState({ txStatus: 'completed', listingStatus: 'active' });
  const seller = verifiedContext(env, 'seller').firestore();
  await assertFails(deleteDoc(doc(seller, 'listing_reservation_locks/listing-1')));
});
