import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OfferIdempotencyWindow,
  isAlreadyCommittedOfferError,
  isUncertainOfferWriteError,
} from '../src/lib/offerIdempotency.ts';
import { assertFreshOfferExpiry, parseStrictIsoTimestamp } from '../src/lib/transactionRetry.ts';

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
assert.equal(isAlreadyCommittedOfferError(new Error('FAILED_PRECONDITION')), true);
assert.equal(isAlreadyCommittedOfferError(new Error('PERMISSION_DENIED')), true);
assert.equal(isAlreadyCommittedOfferError(new Error('INVALID_ARGUMENT')), false);
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
assert.match(backend, /assertCurrentPendingParent/);
assert.match(backend, /PARENT_OFFER_NOT_FOUND/);
assert.match(backend, /PARENT_OFFER_MISMATCH/);
assert.match(backend, /assertFreshOfferExpiry\(offer\.expires_at\)/);
const createOfferSource = backend.slice(backend.indexOf('  async createOffer('), backend.indexOf('  async createCounterOffer('));
const createCounterSource = backend.slice(backend.indexOf('  async createCounterOffer('));
assert.match(createOfferSource, /assertFreshOfferExpiry\(input\.expiresAt\)/,
  'a caller-supplied invalid expiry must be rejected before creating the offer');
assert.match(createCounterSource, /assertFreshOfferExpiry\(expiresAt\)/,
  'a caller-supplied invalid counteroffer expiry must be rejected');

const fixedNow = Date.parse('2026-09-05T18:00:00Z');
assert.equal(parseStrictIsoTimestamp('2026-09-05T20:00:00+02:00'), fixedNow);
assert.equal(parseStrictIsoTimestamp('2026-09-05T18:00:00.123456Z'), fixedNow + 123);
for (const malformed of ['2026-02-31T18:00:00Z', '2026-04-31T18:00:00Z',
  '2026-09-05T24:00:00Z', '2026-09-05T18:61:00Z', '', null, 123]) {
  assert.equal(parseStrictIsoTimestamp(malformed), null);
  assert.throws(() => assertFreshOfferExpiry(malformed, fixedNow), /OFFER_EXPIRY_INVALID/);
}
assert.doesNotThrow(() => assertFreshOfferExpiry(undefined, fixedNow));
assert.doesNotThrow(() => assertFreshOfferExpiry('2026-09-05T18:01:00Z', fixedNow));
assert.throws(() => assertFreshOfferExpiry('2026-09-05T17:59:00Z', fixedNow), /OFFER_EXPIRED/);
assert.match(backend, /const currentParent = await assertCurrentPendingParent\(client, parent, actor\)/);
assert.match(backend, /parent_offer_id: currentParent\.id/);
assert.match(bridge, /createOffer: canonicalOffersBackend\.createOffer/);
assert.match(bridge, /createCounterOffer: canonicalOffersBackend\.createCounterOffer/);

// Exercise the actual canonical listing guard with synthetic Firestore reads, never a real backend.
const { stripTypeScriptTypes } = await import('node:module');
const listingGuardStart = backend.indexOf('async function assertOfferableListing(');
const listingGuardEnd = backend.indexOf('\nfunction assertOfferNotExpired(', listingGuardStart);
assert(listingGuardStart >= 0 && listingGuardEnd > listingGuardStart, 'canonical listing guard must exist');
const assertOfferableListing = new Function(
  `${stripTypeScriptTypes(backend.slice(listingGuardStart, listingGuardEnd))}\nreturn assertOfferableListing;`,
)();
const makeListingClient = (availability_status) => ({
  getDocument: async (path) => {
    assert.equal(path, 'listings_v2/listing-1');
    return { data: { seller_id: 'seller-a', status: 'active', moderation_status: 'approved', availability_status } };
  },
});
await assert.rejects(
  assertOfferableListing(makeListingClient('reserved'), 'listing-1', 'seller-a'),
  /LISTING_ALREADY_RESERVED/,
  'a reservation must block a new offer or counteroffer before any write',
);
await assert.doesNotReject(assertOfferableListing(makeListingClient('available'), 'listing-1', 'seller-a'));
await assert.doesNotReject(assertOfferableListing(makeListingClient(undefined), 'listing-1', 'seller-a'));
assert.match(createOfferSource, /await assertOfferableListing\(client, input\.listingId, input\.sellerId\)/);
assert.match(createCounterSource, /await assertOfferableListing\(client, currentParent\.listing_id, currentParent\.seller_id\)/);

const chatSource = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
// A missing reservation acknowledgement cannot mark an offer accepted in UI.
const respondStart = chatSource.indexOf("  const respondToOffer = async (kind: 'accept' | 'reject') => {");
const respondEnd = chatSource.indexOf('  const finalizeAcceptedCounter = async () => {', respondStart);
assert(respondStart >= 0 && respondEnd > respondStart, 'canonical accept UI handler must exist');
const acceptUI = chatSource.slice(respondStart, respondEnd);
const callPosition = acceptUI.indexOf('await nationalBackend.acceptOfferAndCreateTransaction(');
const truthPosition = acceptUI.indexOf("if (!result.transaction) throw new Error('RESERVATION_NOT_CREATED');");
const optimisticPosition = acceptUI.indexOf("setStructuredOffers((current) => current.map((item) => item.id === visibleOffer.structured!.id ? { ...item, status: 'accepted'");
assert(callPosition >= 0 && truthPosition > callPosition && optimisticPosition > truthPosition,
  'accepted UI must wait for the authoritative reservation response');

const pendingStart = chatSource.indexOf('function isActionablePendingOffer(');
const pendingEnd = chatSource.indexOf('\nexport default function ChatConversation(', pendingStart);
assert(pendingStart >= 0 && pendingEnd > pendingStart, 'V2 pending offer visibility helper is missing');
const isActionablePendingOffer = new Function('parseStrictIsoTimestamp',
  `${stripTypeScriptTypes(chatSource.slice(pendingStart, pendingEnd))}\nreturn isActionablePendingOffer;`,
)(parseStrictIsoTimestamp);
const offerNow = Date.parse('2026-09-05T18:00:00Z');
assert.equal(isActionablePendingOffer({ status: 'pending', expires_at: '2026-09-05T18:00:01Z' }, offerNow), true);
assert.equal(isActionablePendingOffer({ status: 'pending', expires_at: '2026-09-05T18:00:00Z' }, offerNow), false);
assert.equal(isActionablePendingOffer({ status: 'pending', expires_at: '2026-09-05T17:59:59Z' }, offerNow), false);
assert.equal(isActionablePendingOffer({ status: 'pending', expires_at: '2026-02-31T18:00:00Z' }, offerNow), false);
assert.equal(isActionablePendingOffer({ status: 'pending', expires_at: 'not-a-date' }, offerNow), false);
assert.equal(isActionablePendingOffer({ status: 'pending' }, offerNow), true, 'legacy undefined expiry remains supported');
assert.equal(isActionablePendingOffer({ status: 'accepted', expires_at: '2026-09-05T18:00:01Z' }, offerNow), false);
assert(chatSource.includes("if (v2 || !chat || structuredPending) return null;"), 'V2 must not revive stale text offers');
assert(chatSource.includes("(!v2 && !isBuyer && legacyLatestOffer"), 'only legacy chats may show text-only offers');
assert(chatSource.includes("window.setTimeout(() => setOfferClock(Date.now())"), 'V2 UI needs an expiry timer');
assert(chatSource.includes("window.clearTimeout(timer)"), 'expiry timer needs proper cleanup');
console.log('PASS V2 pending offers reject expired and impossible expiries without reviving legacy text actions');

console.log('PASS reserved listings fail closed in canonical offer and counteroffer paths');

console.log('PASS concurrent identical offers reuse one operation id');
console.log('PASS uncertain retry and accidental double tap cannot duplicate an offer');
console.log('PASS intentional later repeat and distinct counteroffer inputs receive new ids');
console.log('PASS Firestore conflict statuses only authorize exact committed-offer recovery attempts');
console.log('PASS counteroffers re-read the parent and reject stale/mismatched/expired state');
console.log('PASS V2 bridge routes offers through canonical retry-idempotent backend');
console.log('Offer idempotency tests: PASS');
