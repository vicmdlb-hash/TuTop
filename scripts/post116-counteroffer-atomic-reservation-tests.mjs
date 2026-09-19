import assert from 'node:assert/strict';
import fs from 'node:fs';

const tx = fs.readFileSync('src/services/canonicalTransactionsBackend.ts','utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts','utf8');
const retry = fs.readFileSync('src/services/canonicalTransactionRetryBackend.ts','utf8');
const chat = fs.readFileSync('src/components/ChatConversation.tsx','utf8');
const rules = fs.readFileSync('firebase/firestore.v2.rules','utf8');
const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');
const locks = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs','utf8');

assert.match(bridge, /acceptOfferAndCreateTransaction: canonicalTransactionRetryBackend\.acceptOfferAndCreateTransaction/);
assert.match(retry, /canonicalTransactionsBackend\.acceptOfferAndCreateTransaction\(storedOffer, reserveMinutes\)/);

assert.doesNotMatch(tx, /if \(actor !== offer\.seller_id\) \{[\s\S]*transaction: null/);
assert.match(tx, /COUNTERPARTY_REQUIRED/);
assert.match(tx, /reservationLockWrite\(client, transaction\)/);
assert.match(tx, /reservationAvailabilityWrite\(client, offer\.listing_id, 'reserved', at\)/);

assert.match(rules, /request\.auth\.uid == request\.resource\.data\.buyer_id[\s\S]*created_by == request\.resource\.data\.seller_id/);
assert.match(prepare, /request\.auth\.uid == getAfter[\s\S]*\.data\.buyer_id[\s\S]*accepted_offer_id[\s\S]*created_by == resource\.data\.seller_id/);
assert.match(locks, /request\.auth\.uid == request\.resource\.data\.buyer_id[\s\S]*accepted_offer_id[\s\S]*created_by == request\.resource\.data\.seller_id/);

assert.match(chat, /if \(!result\.transaction\) throw new Error\('RESERVATION_NOT_CREATED'\)/);
assert.match(chat, /Aceptación anterior sin reserva visible/);
assert.match(chat, /Recuperar reserva/);
assert.match(chat, /!isBuyer && !canonicalTransaction/);
assert.doesNotMatch(chat, /El vendedor debe confirmar la reserva para iniciar la operación/);

console.log('PASS seller-authored counteroffer acceptance creates reservation atomically through canonical runtime authority');
