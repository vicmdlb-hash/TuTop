import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OfferIdempotencyWindow,
  isAlreadyCommittedOfferError,
  isUncertainOfferWriteError,
} from '../src/lib/offerIdempotency.ts';

let seq = 0;
const window = new OfferIdempotencyWindow(1500, 30000, () => `offer-test-${++seq}`);
const base = {
  actorId: 'buyer-a',
  listingId: 'listing-1',
  chatId: 'chat-1',
  sellerId: 'seller-a',
  amountMxn: 125,
};

const first = window.begin(base, 1000);
const concurrent = window.begin(base, 1001);
assert.equal(concurrent.offerId, first.offerId);
assert.equal(concurrent.reused, true);

window.markUncertain(first.key, 2000);
const uncertainRetry = window.begin(base, 25000);
assert.equal(uncertainRetry.offerId, first.offerId, 'uncertain retry generated a duplicate offer id');

window.markSuccess(first.key, 26000);
const accidentalDoubleTap = window.begin(base, 27000);
assert.equal(accidentalDoubleTap.offerId, first.offerId, 'success grace did not absorb accidental double tap');
const intentionalLaterRepeat = window.begin(base, 28000);
assert.notEqual(intentionalLaterRepeat.offerId, first.offerId, 'intentional later repeat did not receive a new offer id');

const differentAmount = window.begin({ ...base, amountMxn: 126 }, 28000);
assert.notEqual(differentAmount.offerId, intentionalLaterRepeat.offerId);
const counter = window.begin({ ...base, parentOfferId: 'parent-1' }, 28000);
assert.notEqual(counter.offerId, intentionalLaterRepeat.offerId);

window.forget(counter.key);
const afterForget = window.begin({ ...base, parentOfferId: 'parent-1' }, 28001);
assert.notEqual(afterForget.offerId, counter.offerId);

assert.equal(isAlreadyCommittedOfferError(new Error('ALREADY_EXISTS')), true);
assert.equal(isAlreadyCommittedOfferError(Object.assign(new Error('conflict'), { payload: { error: { status: 'ALREADY_EXISTS' } } })), true);
assert.equal(isAlreadyCommittedOfferError(new Error('PERMISSION_DENIED')), false);
assert.equal(isUncertainOfferWriteError(new TypeError('fetch failed')), true);
assert.equal(isUncertainOfferWriteError(new Error('UNAVAILABLE')), true);
assert.equal(isUncertainOfferWriteError(new Error('PERMISSION_DENIED')), false);

const backend = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts', 'utf8');
assert.match(backend, /OfferIdempotencyWindow/);
assert.match(backend, /SELF_OFFER_DENIED/);
assert.match(backend, /LISTING_NOT_ACTIVE/);
assert.match(backend, /LISTING_NOT_APPROVED/);
assert.match(backend, /currentDocument: \{ exists: false \}/);
assert.match(backend, /recoverCommittedOffer/);
assert.match(backend, /OFFER_IDEMPOTENCY_COLLISION/);
assert.match(bridge, /createOffer: canonicalOffersBackend\.createOffer/);
assert.match(bridge, /createCounterOffer: canonicalOffersBackend\.createCounterOffer/);

console.log('PASS concurrent identical offers reuse one operation id');
console.log('PASS uncertain retry and accidental double tap cannot duplicate an offer');
console.log('PASS intentional later repeat and distinct counteroffer inputs receive new ids');
console.log('PASS already-committed vs uncertain error classification is fail-closed');
console.log('PASS V2 bridge routes offers through canonical retry-idempotent backend');
console.log('Offer idempotency tests: PASS');
