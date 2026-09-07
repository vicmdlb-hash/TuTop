import fs from 'node:fs';
import assert from 'node:assert/strict';

const chat = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
const national = fs.readFileSync('src/services/nationalBackend.ts', 'utf8');
const canonical = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');

assert.match(canonical, /SELF_OFFER_DENIED/);
assert.match(canonical, /PARENT_OFFER_MISMATCH/);
assert.match(canonical, /OFFER_NOT_PENDING/);
assert.match(canonical, /OFFER_EXPIRED/);
assert.match(canonical, /assertOfferableListing/);

const chatUsesLegacyOffers = /nationalBackend\.createOffer\(/.test(chat) || /nationalBackend\.createCounterOffer\(/.test(chat);
const legacyMissingCanonicalGuards = !/PARENT_OFFER_MISMATCH/.test(national) || !/SELF_OFFER_DENIED/.test(national);

if (chatUsesLegacyOffers && legacyMissingCanonicalGuards) {
  console.warn('WARN P0_OFFER_BACKEND_DRIFT: ChatConversation still uses nationalBackend offer mutations without all canonical guards.');
  console.warn('WARN Required consolidation: route chat create/counter offer mutations through canonicalOffersBackend or port identical guards before release validation.');
} else {
  console.log('PASS chat offer mutations are aligned with canonical guards');
}

console.log('Offer backend drift audit: COMPLETE');
