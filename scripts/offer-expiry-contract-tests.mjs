import fs from 'node:fs';
import assert from 'node:assert/strict';

const offers = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
assert.match(offers, /DEFAULT_OFFER_TTL_MS = 24 \* 60 \* 60_000/);
assert.match(offers, /function defaultOfferExpiry\(\)/);
const uses = offers.match(/expires_at: .*defaultOfferExpiry\(\)/g) || [];
assert.equal(uses.length, 2, 'initial offers and counteroffers must share the same default expiry policy');
assert.doesNotMatch(offers, /expires_at: input\.expiresAt,\n/);
console.log('PASS initial offers and counteroffers expire after the same 24-hour default window');
console.log('Offer expiry contract: PASS');
