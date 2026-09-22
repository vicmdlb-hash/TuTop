import assert from 'node:assert/strict';
import { projectFavoriteListingTransitions } from './favorite-listing-transition-lib.mjs';

const favorite={id:'buyer_listing-1',uid:'buyer',product_id:'listing-1'};
const listing={id:'listing-1',title:'Calculadora Casio',price_mxn:500,availability_status:'available',status:'active'};
const observedAt='2026-09-21T21:00:00.000Z';

const baseline=projectFavoriteListingTransitions({
  favorites:[favorite],
  listingsById:new Map([['listing-1',listing]]),
  statesByFavoriteId:new Map(),
  preferencesByUid:new Map(),
  observedAt,
});
assert.equal(baseline.notifications.length,0,'first observation must not fabricate history');
assert.equal(baseline.stateWrites.length,1);
assert.equal(baseline.stateWrites[0].reason,'baseline');

const drop=projectFavoriteListingTransitions({
  favorites:[favorite],
  listingsById:new Map([['listing-1',{...listing,price_mxn:420}]]),
  statesByFavoriteId:new Map([['buyer_listing-1',{favorite_id:'buyer_listing-1',owner_uid:'buyer',listing_id:'listing-1',last_price_mxn:500,last_availability_status:'available'}]]),
  preferencesByUid:new Map([['buyer',{favorite_price_drop:true,saved_item_available:true}]]),
  observedAt,
});
assert.equal(drop.notifications.length,1);
assert.equal(drop.notifications[0].kind,'favorite_price_drop');
assert.match(drop.notifications[0].body,/500/);
assert.match(drop.notifications[0].body,/420/);
assert.equal(drop.stateWrites.length,1);

const noDropWhenDisabled=projectFavoriteListingTransitions({
  favorites:[favorite],
  listingsById:new Map([['listing-1',{...listing,price_mxn:420}]]),
  statesByFavoriteId:new Map([['buyer_listing-1',{favorite_id:'buyer_listing-1',owner_uid:'buyer',listing_id:'listing-1',last_price_mxn:500,last_availability_status:'available'}]]),
  preferencesByUid:new Map([['buyer',{favorite_price_drop:false,saved_item_available:true}]]),
  observedAt,
});
assert.equal(noDropWhenDisabled.notifications.length,0);

const availableAgain=projectFavoriteListingTransitions({
  favorites:[favorite],
  listingsById:new Map([['listing-1',listing]]),
  statesByFavoriteId:new Map([['buyer_listing-1',{favorite_id:'buyer_listing-1',owner_uid:'buyer',listing_id:'listing-1',last_price_mxn:500,last_availability_status:'reserved'}]]),
  preferencesByUid:new Map([['buyer',{favorite_price_drop:true,saved_item_available:true}]]),
  observedAt,
});
assert.equal(availableAgain.notifications.length,1);
assert.equal(availableAgain.notifications[0].kind,'saved_item_available');

const reset=projectFavoriteListingTransitions({
  favorites:[favorite],
  listingsById:new Map([['listing-1',listing]]),
  statesByFavoriteId:new Map([['buyer_listing-1',{favorite_id:'buyer_listing-1',owner_uid:'someone-else',listing_id:'listing-1',last_price_mxn:999,last_availability_status:'reserved'}]]),
  preferencesByUid:new Map(),
  observedAt,
});
assert.equal(reset.notifications.length,0);
assert.equal(reset.stateWrites[0].reason,'identity_reset');

console.log('PASS first trusted observation creates baseline without fabricated price/availability history');
console.log('PASS later price drops and availability returns project only when preferences allow them');
console.log('PASS owner/listing mismatch resets the baseline instead of leaking another user history');
