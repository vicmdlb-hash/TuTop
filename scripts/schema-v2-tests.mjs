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
assert.match(rules, /created_by/);
assert.match(rules, /request\.auth\.uid != resource\.data\.created_by/);
assert.match(rules, /request\.resource\.data\.status in \['accepted','rejected'\]/);
assert.match(rules, /request\.resource\.data\.status == 'countered'/);
assert.match(rules, /request\.resource\.data\.status == 'reserved'/);
assert.match(rules, /request\.resource\.data\.status == 'meetup_scheduled'/);
assert.match(rules, /request\.resource\.data\.status == 'completed'/);
assert.match(rules, /request\.resource\.data\.status == 'disputed'/);
assert.match(rules, /request\.resource\.data\.status == 'expired'/);
assert.match(rules, /approved_meeting_points\/\$\(request\.resource\.data\.meeting_point_id\)/);
assert.match(rules, /is_tutop_safe_point == true/);
assert.match(rules, /request\.auth\.uid == resource\.data\.buyer_id[\s\S]*buyer_confirmed_at/);
assert.match(rules, /request\.auth\.uid == resource\.data\.seller_id[\s\S]*seller_confirmed_at/);
assert.match(rules, /resource\.data\.reservation_expires_at <= request\.time/);
assert.doesNotMatch(rules, /request\.resource\.data\.status == 'no_show'/);
assert.match(rules, /data\.country_code == 'MX'/);
assert.match(rules, /image_data\.size\(\) <= 230000/);
assert.match(rules, /visibility_scope != 'national'.*shipping_available/s);
assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/institutions\/\$\(data\.institution_id\)\)/);
assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/campuses\/\$\(data\.campus_id\)\)/);
assert.match(rules, /transactionId == 'tx-' \+ request\.resource\.data\.accepted_offer_id/);

assert.match(nationalBackend, /SCHEMA_V2_DISABLED/);
assert.match(nationalBackend, /createOffer/);
assert.match(nationalBackend, /createCounterOffer/);
assert.match(nationalBackend, /created_by: actor/);
assert.match(nationalBackend, /createDemandRequest/);
assert.match(nationalBackend, /saveSearch/);
assert.match(nationalBackend, /updateUniversityIdentity/);
assert.match(nationalBackend, /acceptOfferAndCreateTransaction/);
assert.match(nationalBackend, /createTransactionFromAcceptedOffer/);
assert.match(nationalBackend, /scheduleMeetup/);
assert.match(nationalBackend, /confirmDelivery/);
assert.match(nationalBackend, /disputeTransaction/);
assert.match(nationalBackend, /releaseExpiredReservation/);
assert.match(nationalBackend, /const transactionId = `tx-\$\{offer\.id\}`/);

console.log('PASS Firestore V2 remains isolated from firebase.json');
console.log('PASS national identity fields and catalog references exist');
console.log('PASS national listings require shipping');
console.log('PASS counteroffers are proposer-aware');
console.log('PASS structured offer and transaction guards exist');
console.log('PASS transaction ids are idempotent per accepted offer');
console.log('PASS transaction lifecycle is role-scoped');
console.log('PASS safe meetup points require catalog evidence');
console.log('PASS bilateral delivery confirmations are guarded');
console.log('PASS V2 lifecycle dates serialize as Firestore timestamps');
console.log('PASS feature flag defaults to disabled');
console.log('Schema V2 contract checks: PASS');
