import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-post106-verified-identity';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const institutionId = 'uatx';
const campusId = 'campus';
const now = () => Timestamp.now();
const future = (minutes = 120) => Timestamp.fromMillis(Date.now() + minutes * 60_000);
const photo = (n) => `data:image/webp;base64,UklGRg${n}`;

function auth(uid, verified) {
  return env.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    email_verified: verified,
  }).firestore();
}

async function seedIdentity(uid = 'seller') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `institutions/${institutionId}`), { name: 'UATx', country_code: 'MX', active: true });
    await setDoc(doc(db, `campuses/${campusId}`), { institution_id: institutionId, name: 'Campus', city_id: 'tlaxcala', active: true });
    await setDoc(doc(db, `users/${uid}`), {
      uid,
      nombre: uid,
      facultad: 'Turismo Internacional',
      esta_verificado: false,
      institution_id: institutionId,
      campus_id: campusId,
      created_at: now(),
      updated_at: now(),
    });
  });
}

function listing(uid, id, photos) {
  const at = now();
  return {
    schema_version: 2,
    seller_id: uid,
    institution_id: institutionId,
    campus_id: campusId,
    category_id: 'electronics',
    title: `Listing ${id}`,
    description: 'Publicación canónica post106 con identidad de correo verificada.',
    attributes: {},
    price_mxn: 500,
    negotiable: true,
    quantity: 1,
    condition: 'good',
    delivery_methods: ['meetup'],
    meeting_point_ids: [],
    shipping_available: false,
    photo_urls: photos,
    status: 'active',
    moderation_status: 'pending',
    visibility_scope: 'campus',
    published_at: at,
    created_at: at,
    updated_at: at,
  };
}

function publicationBatch(db, uid, listingId, photos) {
  const at = now();
  const batch = writeBatch(db);
  batch.set(doc(db, `rate_limits/${uid}-listing_create`), {
    uid,
    action: 'listing_create',
    window_start: at,
    count: 1,
    updated_at: at,
  });
  batch.set(doc(db, `listings_v2/${listingId}`), listing(uid, listingId, photos));
  return batch;
}

test('post106 rechaza publicación canónica si email_verified=false', async () => {
  await seedIdentity('seller');
  const db = auth('seller', false);
  await assertFails(publicationBatch(db, 'seller', 'unverified-listing', [photo(1)]).commit());
});

test('post106 permite publicación canónica verificada con una foto', async () => {
  await seedIdentity('seller');
  const db = auth('seller', true);
  await assertSucceeds(publicationBatch(db, 'seller', 'verified-one-photo', [photo(1)]).commit());
});

test('post106 permite publicación canónica verificada con cuatro fotos', async () => {
  await seedIdentity('seller');
  const db = auth('seller', true);
  await assertSucceeds(publicationBatch(db, 'seller', 'verified-four-photos', [photo(1), photo(2), photo(3), photo(4)]).commit());
});

test('post106 rechaza mutación sensible de transacción si email_verified=false y la permite verificada', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const at = now();
    await setDoc(doc(db, 'transactions_v2/tx-identity-gate'), {
      listing_id: 'listing-1',
      chat_id: 'chat-1',
      buyer_id: 'buyer',
      seller_id: 'seller',
      accepted_offer_id: 'offer-1',
      agreed_amount_mxn: 500,
      status: 'reserved',
      reservation_expires_at: future(),
      created_at: at,
      updated_at: at,
    });
  });

  const unverified = auth('buyer', false);
  await assertFails(updateDoc(doc(unverified, 'transactions_v2/tx-identity-gate'), {
    status: 'disputed',
    updated_at: now(),
  }));

  const verified = auth('buyer', true);
  await assertSucceeds(updateDoc(doc(verified, 'transactions_v2/tx-identity-gate'), {
    status: 'disputed',
    updated_at: now(),
  }));
});

console.log('✅ post106 Firestore emulator gate PASS: unverified blocked; verified listing 1/4 photos + transaction mutation allowed');
