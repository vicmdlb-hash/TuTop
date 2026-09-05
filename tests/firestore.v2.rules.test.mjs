import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

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
const institutionId = 'uatx';
const campusId = 'uatx-riberena';

async function seedMarketplace() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `institutions/${institutionId}`), { name: 'Universidad Autónoma de Tlaxcala', country_code: 'MX', active: true });
    await setDoc(doc(db, `campuses/${campusId}`), { institution_id: institutionId, name: 'Campus Ribereña', city_id: 'tlaxcala', active: true });
    await setDoc(doc(db, 'users/buyer'), {
      uid: 'buyer', nombre: 'Buyer', facultad: 'Turismo Internacional', esta_verificado: false,
      country_code: 'MX', state_code: 'TLAX', city_id: 'tlaxcala', city_name: 'Tlaxcala',
      institution_id: institutionId, campus_id: campusId, created_at: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'users/seller'), {
      uid: 'seller', nombre: 'Seller', facultad: 'Turismo Internacional', esta_verificado: false,
      country_code: 'MX', state_code: 'TLAX', city_id: 'tlaxcala', city_name: 'Tlaxcala',
      institution_id: institutionId, campus_id: campusId, created_at: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'users/stranger'), {
      uid: 'stranger', nombre: 'Stranger', facultad: 'Derecho', esta_verificado: false,
      created_at: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'products/listing'), {
      vendedor_id: 'seller', vendedor_nombre: 'Seller', vendedor_handle: '@seller', titulo: 'Calculadora Casio', descripcion: 'Funciona correctamente',
      precio_mxn: 500, stock: 1, categoria: 'Electrónica', facultad: 'Turismo Internacional', country_code: 'MX', state_code: 'TLAX',
      city_id: 'tlaxcala', city_name: 'Tlaxcala', institution_id: institutionId, campus_id: campusId,
      visibility_scope: 'campus', listing_kind: 'offer', shipping_available: false,
      punto_encuentro: 'Cafetería Central', imagen_url: image, estado: 'Activo', likes: 0, fecha_creacion: now(), updated_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing'), {
      product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer', seller_id: 'seller', vendedor_id: 'seller',
      participants: ['buyer', 'seller'], nombre_otro_usuario: 'Seller', created_at: now(), updated_at: now(), last_message: '', last_message_at: now(),
    });
  });
}

function offer(overrides = {}) {
  return {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', amount_mxn: 450,
    status: 'pending', expires_at: future(1440), created_at: now(), updated_at: now(), ...overrides,
  };
}

function transaction(overrides = {}) {
  return {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', accepted_offer_id: 'offer-1',
    agreed_amount_mxn: 450, status: 'reserved', reservation_expires_at: future(120), created_at: now(), updated_at: now(), ...overrides,
  };
}

test('V2 mantiene privados offers y transactions frente a terceros', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'offers/offer-1'), offer());
    await setDoc(doc(db, 'transactions_v2/tx-1'), transaction());
  });
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  const stranger = env.authenticatedContext('stranger').firestore();
  await assertSucceeds(getDoc(doc(buyer, 'offers/offer-1')));
  await assertSucceeds(getDoc(doc(seller, 'offers/offer-1')));
  await assertFails(getDoc(doc(stranger, 'offers/offer-1')));
  await assertSucceeds(getDoc(doc(buyer, 'transactions_v2/tx-1')));
  await assertFails(getDoc(doc(stranger, 'transactions_v2/tx-1')));
});

test('sólo el comprador del chat puede crear la oferta inicial', async () => {
  await seedMarketplace();
  const buyer = env.authenticatedContext('buyer').firestore();
  const stranger = env.authenticatedContext('stranger').firestore();
  await assertSucceeds(setDoc(doc(buyer, 'offers/offer-1'), offer()));
  await assertFails(setDoc(doc(stranger, 'offers/evil'), offer({ buyer_id: 'stranger' })));
  await assertFails(setDoc(doc(buyer, 'offers/wrong-seller'), offer({ seller_id: 'stranger' })));
  await assertFails(setDoc(doc(buyer, 'offers/wrong-listing'), offer({ listing_id: 'missing' })));
});

test('comprador no puede aceptar su propia oferta y vendedor no puede retirarla', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'offers/offer-1'), offer()));
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails(updateDoc(doc(buyer, 'offers/offer-1'), { status: 'accepted', updated_at: now() }));
  await assertFails(updateDoc(doc(seller, 'offers/offer-1'), { status: 'withdrawn', updated_at: now() }));
  await assertSucceeds(updateDoc(doc(seller, 'offers/offer-1'), { status: 'accepted', updated_at: now() }));
});

test('transacción sólo la crea el vendedor desde una oferta aceptada y por el importe exacto', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'offers/offer-1'), offer({ status: 'accepted' })));
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails(setDoc(doc(buyer, 'transactions_v2/tx-buyer'), transaction()));
  await assertFails(setDoc(doc(seller, 'transactions_v2/tx-wrong-price'), transaction({ agreed_amount_mxn: 1 })));
  await assertSucceeds(setDoc(doc(seller, 'transactions_v2/tx-ok'), transaction()));
});

test('tercero no puede cambiar estado de operación ni reservar producto ajeno', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'offers/offer-1'), offer({ status: 'accepted' }));
    await setDoc(doc(db, 'transactions_v2/tx-1'), transaction());
  });
  const stranger = env.authenticatedContext('stranger').firestore();
  await assertFails(updateDoc(doc(stranger, 'transactions_v2/tx-1'), { status: 'completed', updated_at: now() }));
  await assertFails(updateDoc(doc(stranger, 'products/listing'), { estado: 'Reservado', updated_at: now() }));
});

test('producto nacional requiere coherencia con la identidad del vendedor', async () => {
  await seedMarketplace();
  const seller = env.authenticatedContext('seller').firestore();
  const base = {
    vendedor_id: 'seller', vendedor_nombre: 'Seller', vendedor_handle: '@seller', titulo: 'Audífonos', descripcion: 'Nuevos', precio_mxn: 600,
    stock: 1, categoria: 'Electrónica', facultad: 'Turismo Internacional', country_code: 'MX', state_code: 'TLAX', city_id: 'tlaxcala', city_name: 'Tlaxcala',
    institution_id: institutionId, campus_id: campusId, visibility_scope: 'city', listing_kind: 'offer', shipping_available: false,
    punto_encuentro: 'Coordinar por Chat', imagen_url: image, estado: 'Activo', likes: 0, fecha_creacion: now(), updated_at: now(),
  };
  await assertSucceeds(setDoc(doc(seller, 'products/good'), base));
  await assertFails(setDoc(doc(seller, 'products/fake-campus'), { ...base, campus_id: 'otro-campus' }));
  await assertFails(setDoc(doc(seller, 'products/fake-institution'), { ...base, institution_id: 'otra-universidad' }));
});

test('usuario suspendido no puede ofertar ni modificar operación', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'moderationStatus/buyer'), { suspended: true, reason: 'abuso', updated_at: now(), admin_uid: 'admin' });
    await setDoc(doc(db, 'offers/offer-1'), offer({ status: 'accepted' }));
    await setDoc(doc(db, 'transactions_v2/tx-1'), transaction());
  });
  const buyer = env.authenticatedContext('buyer').firestore();
  await assertFails(setDoc(doc(buyer, 'offers/offer-suspended'), offer()));
  await assertFails(updateDoc(doc(buyer, 'transactions_v2/tx-1'), { status: 'disputed', updated_at: now() }));
});
