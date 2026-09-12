import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs', 'utf8');
const canonical = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');
const runtime = fs.readFileSync('scripts/harden-runtime-v2-rules.mjs', 'utf8');
const locks = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs', 'utf8');

// Global posture must remain authenticated + fail closed.
assert.match(base, /function signedIn\(\) \{ return request\.auth != null; \}/);
assert.match(base, /match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
assert.doesNotMatch(base, /allow\s+(read|write|create|update|delete)(?:,\s*(?:read|write|create|update|delete))*:\s*if\s+true\s*;/);

// High-value collections must never acquire an unauthenticated broad write.
for (const collection of ['users', 'user_private', 'wallets', 'products', 'chats', 'offers', 'transactions_v2', 'reports']) {
  assert.match(base, new RegExp(`match \\/${collection}\\/`), `falta contrato para ${collection}`);
}
assert.match(base, /match \/admins\/\{uid\} \{ allow read: if owner\(uid\) \|\| isAdmin\(\); allow write: if false; \}/);
assert.match(base, /match \/audit_log\/\{entryId\}/);
assert.match(base, /allow update, delete: if false;/);

// Marketplace isolation and safety invariants remain represented in Rules.
assert.match(base, /validVisibilityScope/);
assert.match(base, /validUniversityMetadata/);
assert.match(base, /productMatchesSellerIdentity/);
assert.match(base, /request\.resource\.data\.buyer_id != request\.resource\.data\.seller_id/);
assert.match(base, /data\.visibility_scope != 'national'.*shipping_available/s);

// Generated-rule pipeline must preserve rate limits, canonical listings and
// reservation locking instead of deploying the base template alone.
assert.match(prepare, /firestore\.v2\.generated\.rules/);
assert.match(canonical, /listings_v2/);
assert.match(runtime, /rateLimitConsumed\('offer_create'\)/);
assert.match(runtime, /rateLimitConsumed\('message_create'\)/);
assert.match(runtime, /rateLimitConsumed\('listing_create'\)/);
assert.match(locks, /reservation_locks|listing_reservation_locks/);

console.log('PASS Firestore V2 retains a global deny catch-all');
console.log('PASS no unconditional allow:true rule exists');
console.log('PASS sensitive collections keep explicit scoped contracts');
console.log('PASS national visibility, self-dealing and shipping invariants remain present');
console.log('PASS generated Rules pipeline retains rate limits, canonical listings and reservation locks');
console.log('Firestore static contract: PASS');
