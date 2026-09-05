import assert from 'node:assert/strict';
import { sanitizeMarketplaceEvent, isMarketplaceEventSafe } from '../src/lib/marketplaceObservability.ts';

const raw = {
  name: 'offer_created',
  actor_uid: 'buyer-1',
  listing_id: 'listing-1',
  offer_id: 'offer-1',
  institution_id: 'uatx',
  campus_id: 'uatx-riberena',
  occurred_at: '2026-09-05T19:50:00.000Z',
  telefono: '2460000000',
  institutional_email: 'private@example.edu.mx',
  image_data: 'data:image/jpeg;base64,secret',
  comentario: 'texto privado',
};

assert.equal(isMarketplaceEventSafe(raw), false);
const sanitized = sanitizeMarketplaceEvent(raw);
assert.deepEqual(sanitized, {
  name: 'offer_created',
  actor_uid: 'buyer-1',
  listing_id: 'listing-1',
  offer_id: 'offer-1',
  institution_id: 'uatx',
  campus_id: 'uatx-riberena',
  occurred_at: '2026-09-05T19:50:00.000Z',
});
assert.equal(isMarketplaceEventSafe(sanitized), true);

for (const key of ['telefono','phone','email','institutional_email','image_data','credential','comentario','message','description']) {
  assert.equal(key in sanitized, false);
}

console.log('PASS observability strips contact, credential and free-text fields');
console.log('PASS marketplace event identifiers/context remain available');
console.log('Marketplace observability tests: PASS');
