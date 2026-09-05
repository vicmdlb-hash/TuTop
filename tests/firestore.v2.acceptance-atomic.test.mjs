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
const future = (minutes = 120) => Timestamp.fromMillis(Date.now() + minutes * 60_000);
const image = 'data:image/webp;base64,UklGRg==';

async function seedPendingOffer() {
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
      estado: 'Activo', likes: 0, fecha_creacion: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing'), {
      product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer', seller_id: 'seller', vendedor_id: 'seller',
      participants: ['buyer', 'seller'], nombre_otro_usuario: 'Seller', created_at: now(), updated_at: now(), last_message: '', last_message_at: now(),
    });
    await setDoc(doc(db, 'offers/offer-1'), {
      listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', created_by: 'buyer', amount_mxn: 280,
      status: 'pending', expires_at: future(1440), created_at: now(), updated_at: now(),
    });
  });
}

function atomicAcceptanceBatch(db, amount = 280) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'offers/offer-1'), { status: 'accepted', updated_at: now() });
  batch.set(doc(db, 'transactions_v2/tx-offer-1'), {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', accepted_offer_id: 'offer-1', agreed_amount_mxn: amount,
    status: 'reserved', reservation_expires_at: future(120), created_at: now(), updated_at: now(),
  });
  batch.update(doc(db, 'chats/chat-buyer-listing'), { transaction_id: 'tx-offer-1', current_offer_id: 'offer-1', updated_at: now() });
  batch.update(doc(db, 'products/listing'), { estado: 'Reservado', updated_at: now() });
  return batch;
}

test('seller acepta, crea transaction y reserva producto en un único batch', async () => {
  await seedPendingOffer();
  const seller = env.authenticatedContext('seller').firestore();
  await assertSucceeds(atomicAcceptanceBatch(seller).commit());

  const accepted = await getDoc(doc(seller, 'offers/offer-1'));
  const transaction = await getDoc(doc(seller, 'transactions_v2/tx-offer-1'));
  const listing = await getDoc(doc(seller, 'products/listing'));
  if (accepted.data()?.status !== 'accepted') throw new Error('offer not accepted');
  if (transaction.data()?.status !== 'reserved') throw new Error('transaction not reserved');
  if (listing.data()?.estado !== 'Reservado') throw new Error('listing not reserved');
});

test('seller no puede aceptar con importe económico alterado', async () => {
  await seedPendingOffer();
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails(atomicAcceptanceBatch(seller, 1).commit());
});

test('seller no puede dejar la oferta accepted sin transaction y reserva', async () => {
  await seedPendingOffer();
  const seller = env.authenticatedContext('seller').firestore();
  const batch = writeBatch(seller);
  batch.update(doc(seller, 'offers/offer-1'), { status: 'accepted', updated_at: now() });
  await assertFails(batch.commit());
});
