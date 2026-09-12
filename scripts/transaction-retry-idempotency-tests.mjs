import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isRecoverableTransactionRetryError, transactionMatchesOfferRetry } from '../src/lib/transactionRetry.ts';

const expected = {
  listingId: 'listing-1',
  chatId: 'chat-1',
  buyerId: 'buyer-a',
  sellerId: 'seller-a',
  offerId: 'offer-a',
  amountMxn: 125,
};
const existing = {
  listing_id: 'listing-1',
  chat_id: 'chat-1',
  buyer_id: 'buyer-a',
  seller_id: 'seller-a',
  accepted_offer_id: 'offer-a',
  agreed_amount_mxn: 125,
  status: 'reserved',
};
assert.equal(transactionMatchesOfferRetry(existing, expected), true);
assert.equal(transactionMatchesOfferRetry({ ...existing, accepted_offer_id: 'offer-b' }, expected), false);
assert.equal(transactionMatchesOfferRetry({ ...existing, buyer_id: 'buyer-b' }, expected), false);
assert.equal(transactionMatchesOfferRetry({ ...existing, listing_id: 'listing-2' }, expected), false);
assert.equal(transactionMatchesOfferRetry({ ...existing, agreed_amount_mxn: 126 }, expected), false);
assert.equal(transactionMatchesOfferRetry({ ...existing, status: 'cancelled' }, expected), false);
assert.equal(transactionMatchesOfferRetry({ ...existing, status: 'meetup_scheduled' }, expected), true);
assert.equal(transactionMatchesOfferRetry({ ...existing, status: 'completed' }, expected), true);

assert.equal(isRecoverableTransactionRetryError(new Error('LISTING_ALREADY_RESERVED')), true);
assert.equal(isRecoverableTransactionRetryError(new Error('ALREADY_EXISTS')), true);
assert.equal(isRecoverableTransactionRetryError(new Error('FAILED_PRECONDITION')), true);
assert.equal(isRecoverableTransactionRetryError(new Error('PERMISSION_DENIED')), true);
assert.equal(isRecoverableTransactionRetryError(new Error('409 conflict')), true);
assert.equal(isRecoverableTransactionRetryError(new TypeError('fetch failed')), true);
assert.equal(isRecoverableTransactionRetryError(new Error('UNAVAILABLE')), true);
assert.equal(isRecoverableTransactionRetryError(new Error('INVALID_ARGUMENT')), false);
assert.equal(isRecoverableTransactionRetryError(new Error('TRANSACTION_ACTION_DENIED')), false);

const backend = fs.readFileSync('src/services/canonicalTransactionRetryBackend.ts', 'utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts', 'utf8');
assert.match(backend, /tx-\$\{offer\.id\}/);
assert.match(backend, /transactionMatchesOfferRetry/);
assert.match(backend, /throw originalError/);
assert.match(bridge, /acceptOfferAndCreateTransaction: canonicalTransactionRetryBackend\.acceptOfferAndCreateTransaction/);
assert.match(bridge, /createTransactionFromAcceptedOffer: canonicalTransactionRetryBackend\.createTransactionFromAcceptedOffer/);

console.log('PASS retry recovery accepts only exact deterministic transaction match');
console.log('PASS competing offer/listing/buyer/amount cannot be mistaken for prior commit');
console.log('PASS Firestore conflict/uncertain statuses only enter exact recovery path');
console.log('PASS V2 bridge routes reservation creation through safe recovery wrapper');
console.log('Transaction retry idempotency tests: PASS');
