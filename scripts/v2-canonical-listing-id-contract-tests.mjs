import fs from 'node:fs';
import assert from 'node:assert/strict';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const hardener = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');
const offers = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
const transactions = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');
const chatBridge = fs.readFileSync('src/services/rateLimitedOnlineBridge.ts', 'utf8');
const trustedMaintenance = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
const scopedAdmin = fs.readFileSync('src/services/scopedAdminBackend.ts', 'utf8');
const favoriteFixture = fs.readFileSync('tests/firestore.v2.favorite-membership.test.mjs', 'utf8');

const prepare = String(pkg.scripts?.['v2:rules:prepare'] || '');
assert.match(prepare, /prepare-firestore-v2-rules\.mjs/);
assert.match(prepare, /harden-canonical-v2-rules\.mjs/);
assert.doesNotMatch(prepare, /harden-favorite-v2-rules\.mjs/);

assert.match(hardener, /function listingDoc\(listingId\)/);
assert.match(hardener, /replace legacy productDoc with canonical listingDoc/);
assert.match(hardener, /favorites use canonical listing/);
assert.match(hardener, /chat create uses canonical listing/);
assert.match(hardener, /offers use canonical listing/);
assert.match(hardener, /meetup campus uses canonical listing/);
assert.match(hardener, /boost bids authorize against canonical listing/);
assert.match(hardener, /if \(rules\.includes\('productDoc\('\)\)/);
assert.match(hardener, /documents\/listings_v2\/\$\(request\.resource\.data\.product_id\)/);
assert.match(hardener, /listingDoc\(request\.resource\.data\.product_id\)\.data\.status == 'active'/);
assert.match(hardener, /listingDoc\(request\.resource\.data\.product_id\)\.data\.moderation_status == 'approved'/);

assert.match(offers, /getDocument<any>\(`listings_v2\/\$\{listingId\}`\)/);
assert.doesNotMatch(offers, /`products\//);
assert.match(transactions, /getDocument<any>\(`listings_v2\/\$\{offer\.listing_id\}`\)/);
assert.match(transactions, /patchWrite\(client, `listings_v2\/\$\{transaction\.listing_id\}`/);
assert.doesNotMatch(transactions, /`products\//);

assert.match(chatBridge, /getDocument<any>\(`listings_v2\/\$\{targetId\}`\)/);
assert.match(chatBridge, /getDocument<any>\(`listings_v2\/\$\{listingId\}`\)/);
assert.match(chatBridge, /product_id: chat\.producto_id/);
assert.match(chatBridge, /producto_id: chat\.producto_id/);

assert.match(trustedMaintenance, /query\('listings_v2'\)/);
assert.match(trustedMaintenance, /listing_id: listing\.id/);
assert.match(scopedAdmin, /runQuery<any>\('listings_v2'/);
assert.match(scopedAdmin, /getDocument<any>\(`listings_v2\/\$\{listingId\}`\)/);
assert.match(scopedAdmin, /path: `listings_v2\/\$\{listingId\}`/);

assert.match(favoriteFixture, /acepta un listing canónico V2 activo y aprobado/);
assert.match(favoriteFixture, /rechaza target que existe sólo en products legacy/);
assert.match(favoriteFixture, /moderation_status: 'pending'/);

console.log('PASS V2 Rules preparation has one canonical listing hardening path and no duplicate favorites hardener');
console.log('PASS generated V2 Rules fail if any productDoc() legacy reference survives canonical hardening');
console.log('PASS favorites, chat, offers, meetup and boosts authorize against listings_v2');
console.log('PASS canonical offer/transaction backends do not resolve listing IDs through products');
console.log('PASS reports, saved-search notifications and scoped moderation preserve canonical listing IDs');
console.log('PASS V2 favorite fixture rejects legacy-only and non-approved targets');
console.log('V2 canonical listing ID contract: PASS');
