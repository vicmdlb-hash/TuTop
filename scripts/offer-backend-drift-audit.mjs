import fs from 'node:fs';
import assert from 'node:assert/strict';

const chat = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
const canonical = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');

for (const guard of ['SELF_OFFER_DENIED', 'PARENT_OFFER_MISMATCH', 'OFFER_NOT_PENDING', 'OFFER_EXPIRED', 'assertOfferableListing']) {
  assert.match(canonical, new RegExp(guard));
}
assert.match(canonical, /async listOffersForChat\(chatId: string, force = false\)/);
assert.match(chat, /canonicalOffersBackend\.listOffersForChat\(chatId/);
assert.match(chat, /canonicalOffersBackend\.createOffer\(/);
assert.match(chat, /canonicalOffersBackend\.createCounterOffer\(/);
assert.doesNotMatch(chat, /nationalBackend\.listOffersForChat\(/);
assert.doesNotMatch(chat, /nationalBackend\.createOffer\(/);
assert.doesNotMatch(chat, /nationalBackend\.createCounterOffer\(/);
assert.doesNotMatch(chat, /\[chatId, chat\?\.mensajes\.length\]/);
assert.match(chat, /visibilitychange/);

console.log('PASS chat list/create/counter offer flow uses canonical backend');
console.log('PASS offer refresh is decoupled from message count');
console.log('Offer backend drift audit: PASS');
