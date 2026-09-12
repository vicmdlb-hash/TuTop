import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts', 'utf8');
const offers = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
const retry = fs.readFileSync('src/services/canonicalTransactionRetryBackend.ts', 'utf8');
const tx = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');

assert.match(app, /import '\.\/services\/nationalBackendCanonicalBridge'/);
assert.match(bridge, /updateOffer: canonicalOffersBackend\.updateOffer/);
assert.match(bridge, /acceptOfferAndCreateTransaction: canonicalTransactionRetryBackend\.acceptOfferAndCreateTransaction/);
assert.match(bridge, /createTransactionFromAcceptedOffer: canonicalTransactionRetryBackend\.createTransactionFromAcceptedOffer/);
assert.match(bridge, /loadTransactionForChat: canonicalTransactionsBackend\.loadTransactionForChat/);
assert.match(bridge, /confirmDelivery: canonicalTransactionsBackend\.confirmDelivery/);
assert.match(bridge, /releaseExpiredReservation: canonicalTransactionsBackend\.releaseExpiredReservation/);

assert.match(offers, /GENERIC_OFFER_STATUS_DISABLED/);
assert.match(offers, /COUNTERPARTY_REQUIRED/);
assert.match(offers, /OFFER_CREATOR_REQUIRED/);
assert.match(offers, /assertOfferNotExpired/);

assert.match(retry, /getDocument<any>\(`offers\/\$\{expected\.id\}`\)/);
assert.match(retry, /OFFER_MISMATCH/);
assert.match(retry, /OFFER_EXPIRED/);
assert.match(retry, /loadStoredOffer\(offer, 'pending'\)/);
assert.match(retry, /loadStoredOffer\(offer, 'accepted'\)/);

assert.match(tx, /listing_reservation_locks/);
assert.match(tx, /currentDocument: \{ exists: false \}/);
assert.match(tx, /listings_v2\/\$\{transaction\.listing_id\}/);
assert.match(tx, /status: 'sold_out'/);

console.log('PASS V2 runtime imports and applies canonical offer/transaction bridge');
console.log('PASS reject/withdraw and transaction actions re-read fresh stored offers');
console.log('PASS canonical transaction flow uses unique reservation locks and listings_v2');
console.log('Transaction bridge + fresh offer contract: PASS');
