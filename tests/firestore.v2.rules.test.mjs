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
    await setDoc(doc(db, 'users/loose'), {
      uid: 'loose', nombre: 'Loose', facultad: 'Turismo Internacional', esta_verificado: false,
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
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', created_by: 'buyer', amount_mxn: 450,
    status: 'pending', expires_at: future(1440), created_at: now(), updated_at: now(), ...overrides,
  };
}

function transaction(overrides = {}) {
  return {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller', accepted_offer_id: 'offer-1',
    agreed_amount_mxn: 450, status: 'reserved', reservation_expires_at: future(120), created_at: now(), updated_at: now(), ...overrides,
  };
}

function product(overrides = {}) {
  return {
    vendedor_id: 'seller', vendedor_nombre: 'Seller', vendedor_handle: '@seller', titulo: 'Audífonos', descripcion: 'Nuevos', precio_mxn: 600,
    stock: 1, categoria: 'Electrónica', facultad: 'Turismo Internacional', country_code: 'MX', state_code: 'TLAX', city_id: 'tlaxcala', city_name: 'Tlaxcala',
    institution_id: institutionId, campus_id: campusId, visibility_scope: 'city', listing_kind: 'offer', shipping_available: false,
    punto_encuentro: 'Coordinar por Chat', imagen_url: image, estado: 'Activo', likes: 0, fecha_creacion: now(), updated_at: now(), ...overrides,
  };
}

test('V2 mantiene privados offers y transactions frente a terceros', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'offers/offer-1'), offer());
    await setDoc(doc(db, 'transactions_v2/tx-offer-1'), transaction());
  });
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  const stranger = env.authenticatedContext('stranger').firestore();
  await assertSucceeds(getDoc(doc(buyer, 'offers/offer-1')));
  await assertSucceeds(getDoc(doc(seller, 'offers/offer-1')));
  await assertFails(getDoc(doc(stranger, 'offers/offer-1')));
  await assertSucceeds(getDoc(doc(buyer, 'transactions_v2/tx-offer-1')));
  await assertFails(getDoc(doc(stranger, 'transactions_v2/tx-offer-1')));
});

test('oferta inicial sólo puede crearla el comprador y no puede falsificar created_by', async () => {
  await seedMarketplace();
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  const stranger = env.authenticatedContext('stranger').firestore();
  await assertSucceeds(setDoc(doc(buyer, 'offers/offer-1'), offer()));
  await assertFails(setDoc(doc(seller, 'offers/seller-initial'), offer({ created_by: 'seller' })));
  await assertFails(setDoc(doc(buyer, 'offers/forged-creator'), offer({ created_by: 'seller' })));
  await assertFails(setDoc(doc(stranger, 'offers/evil'), offer({ buyer_id: 'stranger', created_by: 'stranger' })));
  await assertFails(setDoc(doc(buyer, 'offers/wrong-seller'), offer({ seller_id: 'stranger' })));
  await assertFails(setDoc(doc(buyer, 'offers/wrong-listing'), offer({ listing_id: 'missing' })));
});

test('sólo la contraparte puede aceptar/rechazar y sólo el creador retirar', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'offers/offer-1'), offer()));
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails(updateDoc(doc(buyer, 'offers/offer-1'), { status: 'accepted', updated_at: now() }));
  await assertFails(updateDoc(doc(seller, 'offers/offer-1'), { status: 'withdrawn', updated_at: now() }));
  await assertSucceeds(updateDoc(doc(seller, 'offers/offer-1'), { status: 'accepted', updated_at: now() }));
});

test('seller puede contraofertar una oferta buyer y buyer puede responder la nueva propuesta', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'offers/offer-1'), offer()));
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();

  await assertSucceeds(setDoc(doc(seller, 'offers/counter-1'), offer({ created_by: 'seller', amount_mxn: 480, parent_offer_id: 'offer-1' })));
  await assertFails(setDoc(doc(seller, 'offers/counter-self'), offer({ created_by: 'seller', amount_mxn: 490, parent_offer_id: 'counter-1' })));
  await assertSucceeds(updateDoc(doc(seller, 'offers/offer-1'), { status: 'countered', counter_offer_id: 'counter-1', updated_at: now() }));
  await assertFails(updateDoc(doc(seller, 'offers/counter-1'), { status: 'accepted', updated_at: now() }));
  await assertSucceeds(updateDoc(doc(buyer, 'offers/counter-1'), { status: 'accepted', updated_at: now() }));
});

test('buyer también puede contraofertar una propuesta seller pendiente', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'offers/offer-1'), offer({ status: 'countered', counter_offer_id: 'counter-1' }));
    await setDoc(doc(db, 'offers/counter-1'), offer({ created_by: 'seller', amount_mxn: 480, parent_offer_id: 'offer-1' }));
  });
  const buyer = env.authenticatedContext('buyer').firestore();
  await assertSucceeds(setDoc(doc(buyer, 'offers/counter-2'), offer({ created_by: 'buyer', amount_mxn: 465, parent_offer_id: 'counter-1' })));
  await assertSucceeds(updateDoc(doc(buyer, 'offers/counter-1'), { status: 'countered', counter_offer_id: 'counter-2', updated_at: now() }));
});

test('transacción sólo la crea el vendedor, con importe exacto e ID derivado de la oferta', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'offers/offer-1'), offer({ status: 'accepted' })));
  const buyer = env.authenticatedContext('buyer').firestore();
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails(setDoc(doc(buyer, 'transactions_v2/tx-offer-1'), transaction()));
  await assertFails(setDoc(doc(seller, 'transactions_v2/tx-offer-1'), transaction({ agreed_amount_mxn: 1 })));
  await assertFails(setDoc(doc(seller, 'transactions_v2/tx-another-name'), transaction()));
  await assertSucceeds(setDoc(doc(seller, 'transactions_v2/tx-offer-1'), transaction()));
});

test('tercero no puede cambiar estado de operación ni reservar producto ajeno', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'offers/offer-1'), offer({ status: 'accepted' }));
    await setDoc(doc(db, 'transactions_v2/tx-offer-1'), transaction());
  });
  const stranger = env.authenticatedContext('stranger').firestore();
  await assertFails(updateDoc(doc(stranger, 'transactions_v2/tx-offer-1'), { status: 'completed', updated_at: now() }));
  await assertFails(updateDoc(doc(stranger, 'products/listing'), { estado: 'Reservado', updated_at: now() }));
});

test('producto respeta identidad del vendedor y catálogo universitario', async () => {
  await seedMarketplace();
  const seller = env.authenticatedContext('seller').firestore();
  await assertSucceeds(setDoc(doc(seller, 'products/good'), product()));
  await assertFails(setDoc(doc(seller, 'products/fake-campus'), product({ campus_id: 'otro-campus' })));
  await assertFails(setDoc(doc(seller, 'products/fake-institution'), product({ institution_id: 'otra-universidad' })));

  const loose = env.authenticatedContext('loose').firestore();
  await assertFails(updateDoc(doc(loose, 'users/loose'), { institution_id: 'universidad-fantasma', updated_at: now() }));
  await assertSucceeds(updateDoc(doc(loose, 'users/loose'), { institution_id: institutionId, campus_id: campusId, updated_at: now() }));
});

test('alcance nacional requiere envío también en reglas', async () => {
  await seedMarketplace();
  const seller = env.authenticatedContext('seller').firestore();
  await assertFails(setDoc(doc(seller, 'products/national-no-shipping'), product({ visibility_scope: 'national', shipping_available: false })));
  await assertSucceeds(setDoc(doc(seller, 'products/national-shipping'), product({ visibility_scope: 'national', shipping_available: true })));
});

test('usuario suspendido no puede ofertar ni modificar operación', async () => {
  await seedMarketplace();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'moderationStatus/buyer'), { suspended: true, reason: 'abuso', updated_at: now(), admin_uid: 'admin' });
    await setDoc(doc(db, 'offers/offer-1'), offer({ status: 'accepted' }));
    await setDoc(doc(db, 'transactions_v2/tx-offer-1'), transaction());
  });
  const buyer = env.authenticatedContext('buyer').firestore();
  await assertFails(setDoc(doc(buyer, 'offers/offer-suspended'), offer()));
  await assertFails(updateDoc(doc(buyer, 'transactions_v2/tx-offer-1'), { status: 'disputed', updated_at: now() }));
});
