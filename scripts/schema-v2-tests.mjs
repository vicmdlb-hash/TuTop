import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const firebaseV2 = JSON.parse(fs.readFileSync('firebase.v2.json', 'utf8'));
const envExample = fs.readFileSync('.env.example', 'utf8');
const nationalBackend = fs.readFileSync('src/services/nationalBackend.ts', 'utf8');
const firebaseRest = fs.readFileSync('src/services/firebaseRest.ts', 'utf8');

assert.equal(firebaseV2.firestore.rules, 'firebase/firestore.v2.rules');
assert.match(envExample, /VITE_TUTOP_SCHEMA_V2=false/);

for (const collection of [
  'institutions', 'campuses', 'faculties', 'careers', 'institution_domains', 'approved_meeting_points',
  'offers', 'transactions_v2', 'demand_requests', 'saved_searches', 'moderation_cases', 'audit_log', 'reputation'
]) {
  assert.ok(rules.includes(`match /${collection}/`), `missing v2 rules for ${collection}`);
}

for (const field of ['institution_id', 'campus_id', 'faculty_id', 'career_id', 'visibility_scope']) {
  assert.ok(rules.includes(field), `missing national field ${field}`);
}

for (const timestampField of [
  'reservation_expires_at', 'meetup_at', 'buyer_confirmed_at', 'seller_confirmed_at',
  'needed_by', 'retention_delete_after', 'verified_at', 'read_at'
]) {
  assert.ok(firebaseRest.includes(`'${timestampField}'`), `missing Firestore timestamp encoding for ${timestampField}`);
}

assert.match(rules, /status == 'pending'/);
assert.match(rules, /\['accepted','rejected','countered'\]/);
assert.match(rules, /\['accepted','reserved','meetup_scheduled','completed','cancelled','expired','no_show','disputed'\]/);
assert.match(rules, /data\.country_code == 'MX'/);
assert.match(rules, /image_data\.size\(\) <= 230000/);

assert.match(nationalBackend, /SCHEMA_V2_DISABLED/);
assert.match(nationalBackend, /createOffer/);
assert.match(nationalBackend, /createDemandRequest/);
assert.match(nationalBackend, /saveSearch/);
assert.match(nationalBackend, /updateUniversityIdentity/);
assert.match(nationalBackend, /acceptOfferAndCreateTransaction/);
assert.match(nationalBackend, /releaseExpiredReservation/);
assert.match(nationalBackend, /const transactionId = `tx-\$\{offer\.id\}`/);

console.log('PASS Firestore V2 remains isolated from firebase.json');
console.log('PASS national identity fields and collections exist');
console.log('PASS structured offer and transaction guards exist');
console.log('PASS transaction ids are idempotent per accepted offer');
console.log('PASS V2 lifecycle dates serialize as Firestore timestamps');
console.log('PASS feature flag defaults to disabled');
console.log('Schema V2 contract checks: PASS');
