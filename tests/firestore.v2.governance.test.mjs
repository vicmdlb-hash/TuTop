import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

// Rules are generated exactly once by the CI step before the emulator starts.
// Test files must never rewrite the shared generated file because node --test runs files concurrently.
const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();

async function seedBase() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/global'), { active: true, role: 'trust_safety' });
    await setDoc(doc(db, 'admins/uatxmod'), { active: true, role: 'institution_moderator', institution_id: 'uatx' });
    await setDoc(doc(db, 'admins/buapmod'), { active: true, role: 'institution_moderator', institution_id: 'buap' });
    await setDoc(doc(db, 'admins/support'), { active: true, role: 'support' });
    await setDoc(doc(db, 'admins/verify'), { active: true, role: 'verification_reviewer' });
    await setDoc(doc(db, 'admins/legacy'), { active: true });
    await setDoc(doc(db, 'institutions/uatx'), { id: 'uatx', active: true });
    await setDoc(doc(db, 'institutions/buap'), { id: 'buap', active: true });
    await setDoc(doc(db, 'campuses/uatx-riberena'), { id: 'uatx-riberena', institution_id: 'uatx', active: true });
    await setDoc(doc(db, 'campuses/buap-cu'), { id: 'buap-cu', institution_id: 'buap', active: true });
    await setDoc(doc(db, 'users/uatx-user'), { uid: 'uatx-user', institution_id: 'uatx', campus_id: 'uatx-riberena', nombre: 'UATx', facultad: 'FCEA' });
    await setDoc(doc(db, 'users/buap-user'), { uid: 'buap-user', institution_id: 'buap', campus_id: 'buap-cu', nombre: 'BUAP', facultad: 'Admin' });
    await setDoc(doc(db, 'reports/r-uatx'), { created_by: 'reporter', target_type: 'product', target_id: 'p1', reason: 'spam', status: 'open', institution_id: 'uatx', priority: 'normal', created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'reports/r-buap'), { created_by: 'reporter', target_type: 'product', target_id: 'p2', reason: 'spam', status: 'open', institution_id: 'buap', priority: 'normal', created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'reports/r-global'), { created_by: 'reporter', target_type: 'user', target_id: 'u3', reason: 'abuse', status: 'open', priority: 'urgent', created_at: now(), updated_at: now() });
  });
}

function preferences() {
  return {
    new_message: true,
    offer_received: true,
    offer_accepted: true,
    counter_offer: true,
    reservation_expiring: true,
    meetup_reminder: true,
    saved_search_match: true,
    favorite_price_drop: true,
    saved_item_available: true,
    followed_seller_new_listing: false,
    listing_saved_count: false,
    weekly_digest: false,
    safety_alert: true,
    updated_at: now(),
  };
}

function canonicalListing(seller = 'uatx-user') {
  return {
    schema_version: 2,
    seller_id: seller,
    institution_id: seller === 'buap-user' ? 'buap' : 'uatx',
    campus_id: seller === 'buap-user' ? 'buap-cu' : 'uatx-riberena',
    city_id: seller === 'buap-user' ? 'PUE-puebla' : 'TLAX-tlaxcala',
    category_id: 'electronica',
    title: 'Calculadora Casio',
    description: 'Buen estado',
    attributes: { brand: 'Casio' },
    price_mxn: 450,
    negotiable: true,
    quantity: 1,
    delivery_methods: ['campus_meetup'],
    meeting_point_ids: [],
    shipping_available: false,
    photo_urls: ['data:image/png;base64,a'],
    status: 'active',
    moderation_status: 'pending',
    visibility_scope: 'campus',
    published_at: now(),
    created_at: now(),
    updated_at: now(),
  };
}

function createListingWithRate(db, listingId, listing, count = 1, windowStart = now()) {
  const batch = writeBatch(db);
  batch.set(doc(db, `listings_v2/${listingId}`), listing);
  batch.set(doc(db, 'rate_limits/uatx-user-listing_create'), {
    uid: 'uatx-user',
    action: 'listing_create',
    window_start: windowStart,
    count,
    updated_at: now(),
  });
  return batch.commit();
}

test('moderador institucional sólo puede leer y resolver reportes de su institución', async () => {
  await seedBase();
  const uatx = verifiedContext(env, 'uatxmod').firestore();
  await assertSucceeds(getDoc(doc(uatx, 'reports/r-uatx')));
  await assertFails(getDoc(doc(uatx, 'reports/r-buap')));
  await assertFails(getDoc(doc(uatx, 'reports/r-global')));
  await assertSucceeds(updateDoc(doc(uatx, 'reports/r-uatx'), { status: 'reviewing', updated_at: now() }));
  await assertFails(updateDoc(doc(uatx, 'reports/r-buap'), { status: 'reviewing', updated_at: now() }));
});

test('trust safety y admin legacy conservan alcance global', async () => {
  await seedBase();
  const global = verifiedContext(env, 'global').firestore();
  const legacy = verifiedContext(env, 'legacy').firestore();
  await assertSucceeds(getDoc(doc(global, 'reports/r-uatx')));
  await assertSucceeds(getDoc(doc(global, 'reports/r-global')));
  await assertSucceeds(getDoc(doc(legacy, 'reports/r-buap')));
});

test('moderador institucional sólo puede suspender usuarios de su institución', async () => {
  await seedBase();
  const uatx = verifiedContext(env, 'uatxmod').firestore();
  await assertSucceeds(setDoc(doc(uatx, 'moderationStatus/uatx-user'), { suspended: true, reason: 'case', updated_at: now(), admin_uid: 'uatxmod' }));
  await assertFails(setDoc(doc(uatx, 'moderationStatus/buap-user'), { suspended: true, reason: 'case', updated_at: now(), admin_uid: 'uatxmod' }));
});

test('preferencias de notificación son privadas del propietario', async () => {
  const owner = verifiedContext(env, 'alice').firestore();
  const stranger = verifiedContext(env, 'bob').firestore();
  await assertSucceeds(setDoc(doc(owner, 'notification_preferences/alice'), preferences()));
  await assertSucceeds(getDoc(doc(owner, 'notification_preferences/alice')));
  await assertFails(getDoc(doc(stranger, 'notification_preferences/alice')));
  await assertFails(setDoc(doc(stranger, 'notification_preferences/alice'), preferences()));
});

test('solicitud de eliminación la crea el usuario y soporte puede procesarla', async () => {
  await seedBase();
  const owner = verifiedContext(env, 'alice').firestore();
  const support = verifiedContext(env, 'support').firestore();
  const stranger = verifiedContext(env, 'bob').firestore();
  await assertSucceeds(setDoc(doc(owner, 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() }));
  await assertFails(getDoc(doc(stranger, 'account_deletion_requests/alice')));
  await assertSucceeds(getDoc(doc(support, 'account_deletion_requests/alice')));
  await assertSucceeds(updateDoc(doc(support, 'account_deletion_requests/alice'), { status: 'processing', updated_at: now() }));
});

test('reviewer de verificación no obtiene permisos generales de moderación', async () => {
  await seedBase();
  const verify = verifiedContext(env, 'verify').firestore();
  await assertFails(getDoc(doc(verify, 'reports/r-uatx')));
});

test('listings_v2 requiere identidad de campus y propietario real', async () => {
  await seedBase();
  const seller = verifiedContext(env, 'uatx-user').firestore();
  const windowStart = now();
  await assertSucceeds(createListingWithRate(seller, 'l1', canonicalListing(), 1, windowStart));
  await assertFails(createListingWithRate(seller, 'l2', { ...canonicalListing(), institution_id: 'buap', campus_id: 'buap-cu' }, 2, windowStart));
  await assertFails(createListingWithRate(seller, 'l3', { ...canonicalListing(), seller_id: 'buap-user' }, 2, windowStart));
});

test('listing pendiente es privado hasta aprobación y moderación respeta institución', async () => {
  await seedBase();
  const seller = verifiedContext(env, 'uatx-user').firestore();
  const stranger = verifiedContext(env, 'viewer').firestore();
  const uatxMod = verifiedContext(env, 'uatxmod').firestore();
  const buapMod = verifiedContext(env, 'buapmod').firestore();
  await assertSucceeds(createListingWithRate(seller, 'l1', canonicalListing()));
  await assertSucceeds(getDoc(doc(seller, 'listings_v2/l1')));
  await assertFails(getDoc(doc(stranger, 'listings_v2/l1')));
  await assertSucceeds(getDoc(doc(uatxMod, 'listings_v2/l1')));
  await assertFails(getDoc(doc(buapMod, 'listings_v2/l1')));
  await assertSucceeds(updateDoc(doc(uatxMod, 'listings_v2/l1'), { moderation_status: 'approved', updated_at: now() }));
  await assertSucceeds(getDoc(doc(stranger, 'listings_v2/l1')));
});

test('reserva no existe como estado canónico de listings_v2', async () => {
  await seedBase();
  const seller = verifiedContext(env, 'uatx-user').firestore();
  await assertSucceeds(createListingWithRate(seller, 'l1', canonicalListing()));
  await assertFails(updateDoc(doc(seller, 'listings_v2/l1'), { status: 'reserved', updated_at: now() }));
  await assertSucceeds(updateDoc(doc(seller, 'listings_v2/l1'), { status: 'paused', updated_at: now() }));
});
