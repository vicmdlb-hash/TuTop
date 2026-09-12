import fs from 'node:fs';
import assert from 'node:assert/strict';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs', 'utf8');
const canonical = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');
const runtime = fs.readFileSync('scripts/harden-runtime-v2-rules.mjs', 'utf8');
const optimize = fs.readFileSync('scripts/optimize-listing-rate-limit-rules.mjs', 'utf8');
const account = fs.readFileSync('scripts/harden-account-operations-rules.mjs', 'utf8');
const receipts = fs.readFileSync('scripts/harden-notification-receipts-rules.mjs', 'utf8');
const locks = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs', 'utf8');
const nearby = fs.readFileSync('scripts/harden-nearby-v2-rules.mjs', 'utf8');

const expected = [
  'node scripts/prepare-firestore-v2-rules.mjs',
  'node scripts/harden-canonical-v2-rules.mjs',
  'node scripts/harden-runtime-v2-rules.mjs',
  'node scripts/optimize-listing-rate-limit-rules.mjs',
  'node scripts/harden-account-operations-rules.mjs',
  'node scripts/harden-notification-receipts-rules.mjs',
  'node scripts/harden-transaction-lock-rules.mjs',
  'node scripts/harden-nearby-v2-rules.mjs',
].join(' && ');
assert.equal(pkg.scripts['v2:rules:prepare'], expected, 'V2 Rules composition order changed');
assert.doesNotMatch(pkg.scripts['v2:rules:prepare'], /harden-favorite-v2-rules/);

// Stage 1: base generator must create the canonical sections consumed downstream.
assert.match(prepare, /firebase\/firestore\.v2\.generated\.rules/);
assert.match(prepare, /match \/listings_v2\/\{listingId\}/);
assert.match(prepare, /match \/account_deletion_requests\/\{uid\}/);
assert.match(prepare, /match \/audit_log\/\{entryId\}/);

// Stage 2: canonical conversion must happen before any runtime hardener relies on listingDoc().
assert.match(canonical, /function listingDoc\(listingId\)/);
assert.match(canonical, /if \(rules\.includes\('productDoc\('\)\)/);
assert.match(canonical, /favorites use canonical listing/);
assert.match(canonical, /chat create uses canonical listing/);
assert.match(canonical, /offers use canonical listing/);
assert.match(canonical, /meetup campus uses canonical listing/);
assert.match(canonical, /boost bids authorize against canonical listing/);
assert.match(runtime, /listingDoc\(get\(\/databases\/\$\(database\)\/documents\/transactions_v2/);

// Stage 3: runtime creates markers consumed by later transforms.
assert.match(runtime, /rateLimitConsumed\('listing_create'\)/);
assert.match(optimize, /replaceOnce\("rateLimitConsumed\('listing_create'\)", 'listingRateLimitConsumed\(\)'/);
assert.match(runtime, /match \/notification_outbox\/\{notificationId\}/);
assert.match(receipts, /match \/notification_outbox\/\{notificationId\}/);
assert.match(runtime, /Immediate unilateral cancellation with explicit responsibility/);
assert.match(runtime, /affectedKeys\(\)\.hasOnly\(\['status','outcome_code','outcome_actor_id','outcome_recorded_at','updated_at'\]\)/);
assert.match(locks, /cancellation releases reservation lock/);

// Independent post-runtime hardeners must remain narrowly scoped and fail closed.
for (const [name, source] of [
  ['canonical', canonical], ['runtime', runtime], ['optimize', optimize], ['account', account], ['receipts', receipts], ['locks', locks],
]) {
  assert.match(source, /const path = 'firebase\/firestore\.v2\.generated\.rules'/, `${name} must target generated rules only`);
  assert.match(source, /encontró \$\{count\}|encontró \$\{occurrences\}|esperaba 1 coincidencia/, `${name} must fail closed on marker drift`);
}
assert.match(nearby, /const path = 'firebase\/firestore\.v2\.generated\.rules'/);
assert.match(nearby, /canonicalCount !== 2/);
assert.match(nearby, /legacyCount !== 1/);
assert.match(nearby, /legacyShippingRequirement/);

assert.match(account, /account deletion transition/);
assert.match(account, /support deletion audit read scope/);
assert.match(receipts, /notification receipt hardener esperaba 1 coincidencia/);
assert.match(locks, /transaction create requires unique reservation lock/);
assert.match(locks, /expiry releases reservation lock/);
assert.match(locks, /reservation lock collection/);

console.log('PASS V2 Rules pipeline order is explicit and frozen, including 0.9.1 nearby semantics');
console.log('PASS canonical listing conversion precedes runtime rules that depend on listingDoc');
console.log('PASS runtime markers precede listing optimization, notification receipts and reservation-lock hardeners');
console.log('PASS nearby hardener removes canonical and legacy shipping mandates fail-closed');
console.log('PASS duplicate favorites hardener is absent; canonical conversion owns V2 listing identity');
console.log('V2 Rules composition contract: PASS');
