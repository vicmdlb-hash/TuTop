import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';

// Genuine Firestore emulator, but claims/phone are synthetic. It cannot prove
// that a real device has completed SMS linking or production App Check.
const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-post120-rules';
if (projectId !== 'demo-tutop-post120-rules') throw new Error('DEMO_PROJECT_REQUIRED');
const [hostname, portText] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const rules = fs.readFileSync('firebase/firestore.v2.national-dual-factor-demo.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId, firestore: { host: hostname, port: Number(portText || 8080), rules },
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();
async function seed(uid = 'seller') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'institutions/uatx'), { name: 'UATx', active: true, country_code: 'MX' });
    await setDoc(doc(db, 'campuses/campus'), { institution_id: 'uatx', name: 'Campus', active: true });
    await setDoc(doc(db, 'users/' + uid), {
      uid, nombre: 'Seller', facultad: 'Turismo', esta_verificado: false,
      institution_id: 'uatx', campus_id: 'campus', created_at: now(), updated_at: now(),
    });
  });
}
function client(uid, overrides = {}) {
  return env.authenticatedContext(uid, {
    email: uid + '@example.test', email_verified: true,
    ...overrides,
  }).firestore();
}
function publish(db, uid, id) {
  const at = now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'rate_limits/' + uid + '-listing_create'), {
    uid, action: 'listing_create', window_start: at, count: 1, updated_at: at,
  });
  batch.set(doc(db, 'listings_v2/' + id), {
    schema_version: 2, seller_id: uid, institution_id: 'uatx', campus_id: 'campus',
    category_id: 'electronics', title: 'Synthetic verified listing', description: 'Emulator-only fixture',
    attributes: {}, price_mxn: 500, negotiable: true, quantity: 1,
    condition: 'good', delivery_methods: ['campus_meetup'], meeting_point_ids: [],
    shipping_available: false, photo_urls: ['data:image/webp;base64,UklGRg=='],
    status: 'active', moderation_status: 'pending', visibility_scope: 'campus',
    published_at: at, created_at: at, updated_at: at,
  });
  return batch.commit();
}
const mxPhone = '+522461234567';
test('email-only account never receives publication privileges', async () => {
  await seed();
  await assertFails(publish(client('seller'), 'seller', 'no-sms'));
});
test('declared telephone in user_private is not Firebase Auth proof', async () => {
  await seed();
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(
    doc(ctx.firestore(), 'user_private/seller'), { uid: 'seller', telefono: mxPhone },
  ));
  await assertFails(publish(client('seller'), 'seller', 'self-declared-phone'));
});
test('signed Firebase Auth Mexican phone + verified email + same UID grants existing campus fixture', async () => {
  await seed();
  await assertSucceeds(publish(client('seller', { phone_number: mxPhone, sub: 'seller' }), 'seller', 'trusted-pair'));
});
test('a different authenticated UID cannot publish on behalf of seller', async () => {
  await seed();
  // The Firebase emulator normalizes JWT sub to authenticatedContext's UID.
  // It cannot synthesize an inconsistent signed sub, and we never claim it can.
  // Instead prove the cross-account write is rejected with real Rules evaluation.
  await assertFails(publish(client('intruder', { phone_number: mxPhone }), 'seller', 'cross-account'));
});
test('non-Mexican and malformed phone tokens fail closed', async () => {
  for (const phone of ['+12025550199', '2461234567', '+5212461234567', '+520000000000']) {
    await env.clearFirestore();
    await seed();
    await assertFails(publish(client('seller', { phone_number: phone, sub: 'seller' }), 'seller', 'invalid-' + phone.replace(/[^0-9]/g, '')));
  }
});
test('unverified email denies even valid same-UID Mexican phone claim', async () => {
  await seed();
  await assertFails(publish(client('seller', { email_verified: false, phone_number: mxPhone, sub: 'seller' }), 'seller', 'unverified-email'));
});
