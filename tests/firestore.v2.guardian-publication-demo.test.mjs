import fs from 'node:fs';
import test, { beforeEach, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { verifiedContext } from './verified-context.mjs';

// DEMO-ONLY: policy tests, not proof of legal guardian consent or release safety.
if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules')
  throw new Error('GUARDIAN_DEMO_PROJECT_ONLY');
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.guardian-demo.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT,
  firestore: { host: hostname, port: Number(portRaw || 8080), rules },
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());
const at = () => Timestamp.now();
const expires = ms => Timestamp.fromMillis(Date.now() + ms);
const photo = 'data:image/webp;base64,UklGRg==';
const listing = () => {
  const timestamp = at();
  return {
    schema_version: 2, seller_id: 'seller', institution_id: 'uatx',
    campus_id: 'riberena', category_id: 'electronics',
    title: 'Test listing', description: 'Guardian synthetic test',
    attributes: {}, price_mxn: 500, negotiable: true, quantity: 1,
    condition: 'good', delivery_methods: ['campus_meetup'],
    meeting_point_ids: [], shipping_available: false,
    photo_urls: [photo], status: 'active', moderation_status: 'pending',
    visibility_scope: 'campus', published_at: timestamp,
    created_at: timestamp, updated_at: timestamp,
  };
};
const age = (band, extra = {}) => ({
  subjectUid: 'seller', band, issuer: 'trusted_server',
  revoked: false, expires_at: expires(3_600_000), ...extra,
});
const guardian = (extra = {}) => ({
  childUid: 'seller', guardianUid: 'verified-parent',
  issuer: 'trusted_server', active: true,
  consentVersion: 'families-2026-v1',
  approvedCapabilities: ['publish_listing'],
  expires_at: expires(3_600_000), ...extra,
});
async function seed(band, guardianOverride) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'institutions/uatx'), { name: 'UATx', active: true });
    await setDoc(doc(db, 'campuses/riberena'), {
      institution_id: 'uatx', name: 'Riberena', active: true,
    });
    await setDoc(doc(db, 'users/seller'), {
      uid: 'seller', nombre: 'Seller', institution_id: 'uatx',
      campus_id: 'riberena', created_at: at(), updated_at: at(),
    });
    if (band !== null) {
      await setDoc(doc(db, 'age_proofs_v2/seller'),
        typeof band === 'string' ? age(band) : band);
    }
    if (guardianOverride) {
      await setDoc(doc(db, 'guardian_grants_v2/seller'), guardianOverride);
    }
  });
}
function publish(suffix) {
  const db = verifiedContext(env, 'seller').firestore();
  const batch = writeBatch(db);
  const timestamp = at();
  batch.set(doc(db, 'rate_limits/seller-listing_create'), {
    uid: 'seller', action: 'listing_create', window_start: timestamp,
    count: 1, updated_at: timestamp,
  });
  batch.set(doc(db, 'listings_v2/' + suffix), listing());
  return batch.commit();
}
test('adult with trusted age can publish without a guardian grant', async () => {
  await seed('adult');
  await assertSucceeds(publish('approved-adult'));
});
test('under13 with valid specific guardian grant can publish pending moderation', async () => {
  await seed('under_13', guardian());
  await assertSucceeds(publish('guardian-approved'));
});
test('under13 without any guardian proof is denied publication', async () => {
  await seed('under_13');
  await assertFails(publish('guardian-missing'));
});
test('under13 with expired guardian grant is denied publication', async () => {
  await seed('under_13', guardian({ expires_at: expires(-1_000) }));
  await assertFails(publish('guardian-expired'));
});
test('under13 with revoked guardian grant is denied publication', async () => {
  await seed('under_13', guardian({ active: false }));
  await assertFails(publish('guardian-revoked'));
});
test('under13 with untrusted issuer or self-guardian is denied', async () => {
  await seed('under_13', guardian({ issuer: 'client', guardianUid: 'seller' }));
  await assertFails(publish('guardian-forged'));
});
test('under13 with irrelevant capability is denied', async () => {
  await seed('under_13', guardian({ approvedCapabilities: ['browse_approved'] }));
  await assertFails(publish('guardian-wrong-capability'));
});
test('unknown-age account cannot publish', async () => {
  await seed(null, guardian());
  await assertFails(publish('age-unverified'));
});
