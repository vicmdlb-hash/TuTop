import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, writeBatch, getDoc } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();
const past = (minutes = 30) => Timestamp.fromMillis(Date.now() - minutes * 60_000);
const future = (minutes = 60) => Timestamp.fromMillis(Date.now() + minutes * 60_000);
const image = 'data:image/webp;base64,UklGRg==';

async function seedBase({ reserved = false, staleChat = false } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'institutions/uatx'), { name: 'UATx', country_code: 'MX', active: true });
    await setDoc(doc(db, 'campuses/uatx-riberena'), { institution_id: 'uatx', name: 'Campus Ribereña', active: true });
    await setDoc(doc(db, 'users/buyer'), { uid: 'buyer', nombre: 'Buyer', facultad: 'Turismo Internacional', esta_verificado: false, created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'users/seller'), { uid: 'seller', nombre: 'Seller', facultad: 'Turismo Internacional', esta_verificado: false, created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'products/listing'), {
      vendedor_id: 'seller', vendedor_nombre: 'Seller', vendedor_handle: '@seller', titulo: 'Libro', descripcion: 'Buen estado', precio_mxn: 300,
      stock: 1, categoria: 'Libros & Apuntes', facultad: 'Turismo Internacional', country_code: 'MX', institution_id: 'uatx', campus_id: 'uatx-riberena',
      visibility_scope: 'campus', listing_kind: 'offer', shipping_available: false, punto_encuentro: 'Biblioteca', imagen_url: image,
      estado: reserved ? 'Reservado' : 'Activo', likes: 0, fecha_creacion: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing'), {
      product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer', seller_id: 'seller', vendedor_id: 'seller',
      participants: ['buyer', 'seller'], nombre_otro_usuario: 'Seller', created_at: staleChat ? past(60) : now(), updated_at: staleChat ? past(60) : now(),
      last_message: '¿Sigue disponible?', last_message_at: staleChat ? past(60) : now(),
    });
  });
}

async function seedSellerSecondConfirmation() {
  await seedBase({ reserved: true });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'offers/offer-1'), {
      listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', created_by: 'buyer', amount_mxn: 280,
      status: 'accepted', created_at: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'transactions_v2/tx-offer-1'), {
      listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', accepted_offer_id: 'offer-1', agreed_amount_mxn: 280,
      status: 'meetup_scheduled', reservation_expires_at: future(120), meeting_point_id: 'some-point', meetup_at: future(30),
      buyer_confirmed_at: now(), created_at: now(), updated_at: now(),
    });
  });
}

async function seedPendingBuyerOffer({ staleChat = false } = {}) {
  await seedBase({ staleChat });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'offers/offer-1'), {
      listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', created_by: 'buyer', amount_mxn: 280,
      status: 'pending', expires_at: future(1440), created_at: now(), updated_at: now(),
    });
  });
}

test('seller puede completar transaction y marcar listing Vendido en un solo batch', async () => {
  await seedSellerSecondConfirmation();
  const seller = env.authenticatedContext('seller').firestore();
  const batch = writeBatch(seller);
  batch.update(doc(seller, 'transactions_v2/tx-offer-1'), { seller_confirmed_at: now(), status: 'completed', updated_at: now() });
  batch.update(doc(seller, 'products/listing'), { estado: 'Vendido', updated_at: now() });
  await assertSucceeds(batch.commit());

  const tx = await getDoc(doc(seller, 'transactions_v2/tx-offer-1'));
  const listing = await getDoc(doc(seller, 'products/listing'));
  if (tx.data()?.status !== 'completed') throw new Error('transaction did not complete');
  if (listing.data()?.estado !== 'Vendido') throw new Error('listing did not become sold');
});

test('buyer no puede usar el mismo batch para vender una publicación ajena', async () => {
  await seedSellerSecondConfirmation();
  const buyer = env.authenticatedContext('buyer').firestore();
  const batch = writeBatch(buyer);
  batch.update(doc(buyer, 'transactions_v2/tx-offer-1'), { status: 'completed', updated_at: now() });
  batch.update(doc(buyer, 'products/listing'), { estado: 'Vendido', updated_at: now() });
  await assertFails(batch.commit());
});

test('seller crea child, marca parent countered y mueve current_offer en un único batch', async () => {
  await seedPendingBuyerOffer();
  const seller = env.authenticatedContext('seller').firestore();
  const batch = writeBatch(seller);
  batch.set(doc(seller, 'offers/counter-1'), {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', created_by: 'seller', amount_mxn: 290,
    status: 'pending', parent_offer_id: 'offer-1', expires_at: future(1440), created_at: now(), updated_at: now(),
  });
  batch.update(doc(seller, 'offers/offer-1'), { status: 'countered', counter_offer_id: 'counter-1', updated_at: now() });
  batch.update(doc(seller, 'chats/chat-buyer-listing'), { current_offer_id: 'counter-1', updated_at: now() });
  await assertSucceeds(batch.commit());

  const parent = await getDoc(doc(seller, 'offers/offer-1'));
  const child = await getDoc(doc(seller, 'offers/counter-1'));
  const chat = await getDoc(doc(seller, 'chats/chat-buyer-listing'));
  if (parent.data()?.status !== 'countered') throw new Error('parent did not become countered');
  if (child.data()?.parent_offer_id !== 'offer-1') throw new Error('counter child was not linked');
  if (chat.data()?.current_offer_id !== 'counter-1') throw new Error('chat current offer did not move');
});

test('parent no puede quedar countered si el child no existe después del batch', async () => {
  await seedPendingBuyerOffer();
  const seller = env.authenticatedContext('seller').firestore();
  const batch = writeBatch(seller);
  batch.update(doc(seller, 'offers/offer-1'), { status: 'countered', counter_offer_id: 'missing-counter', updated_at: now() });
  batch.update(doc(seller, 'chats/chat-buyer-listing'), { current_offer_id: 'missing-counter', updated_at: now() });
  await assertFails(batch.commit());
});

test('contraoferta atómica funciona aunque last_message_at del chat sea antiguo', async () => {
  await seedPendingBuyerOffer({ staleChat: true });
  const seller = env.authenticatedContext('seller').firestore();
  const batch = writeBatch(seller);
  batch.set(doc(seller, 'offers/counter-old-chat'), {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', created_by: 'seller', amount_mxn: 295,
    status: 'pending', parent_offer_id: 'offer-1', expires_at: future(1440), created_at: now(), updated_at: now(),
  });
  batch.update(doc(seller, 'offers/offer-1'), { status: 'countered', counter_offer_id: 'counter-old-chat', updated_at: now() });
  batch.update(doc(seller, 'chats/chat-buyer-listing'), { current_offer_id: 'counter-old-chat', updated_at: now() });
  await assertSucceeds(batch.commit());
});
