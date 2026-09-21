import assert from 'node:assert/strict';
import { deterministicListingSavedNotificationId, projectListingSavedNotifications } from './listing-saved-notification-projection-lib.mjs';

const now=Date.parse('2026-09-21T20:00:00.000Z');
const listing={id:'listing-1',seller_id:'seller',status:'active',moderation_status:'approved',title:'Calculadora Casio'};
const favorites=[{id:'buyer_listing-1',uid:'buyer',product_id:'listing-1',created_at:'2026-09-21T19:55:00.000Z'}];
const map=new Map([['listing-1',listing]]);

assert.equal(projectListingSavedNotifications({favorites,listingsById:map,preferencesByUid:new Map(),now}).length,0,'default false preference must not notify');
const enabled=projectListingSavedNotifications({favorites,listingsById:map,preferencesByUid:new Map([['seller',{listing_saved_count:true}]]),now});
assert.equal(enabled.length,1);
assert.equal(enabled[0].recipient_uid,'seller');
assert.equal(enabled[0].kind,'listing_saved_count');
assert.equal(enabled[0].listing_id,'listing-1');
assert.doesNotMatch(enabled[0].title,/buyer/i);
assert.doesNotMatch(enabled[0].body,/buyer/i);

const own=projectListingSavedNotifications({
  favorites:[{...favorites[0],id:'seller_listing-1',uid:'seller'}],
  listingsById:map,preferencesByUid:new Map([['seller',{listing_saved_count:true}]]),now,
});
assert.equal(own.length,0);

const pending=projectListingSavedNotifications({
  favorites,listingsById:new Map([['listing-1',{...listing,moderation_status:'pending'}]]),
  preferencesByUid:new Map([['seller',{listing_saved_count:true}]]),now,
});
assert.equal(pending.length,0);

const old=projectListingSavedNotifications({
  favorites:[{...favorites[0],created_at:'2026-09-18T19:55:00.000Z'}],
  listingsById:map,preferencesByUid:new Map([['seller',{listing_saved_count:true}]]),now,lookbackMs:3600_000,
});
assert.equal(old.length,0);

assert.equal(
  deterministicListingSavedNotificationId('buyer_listing-1','listing-1','seller'),
  deterministicListingSavedNotificationId('buyer_listing-1','listing-1','seller'),
);
console.log('PASS listing-saved alerts are opt-in, private and seller-targeted');
console.log('PASS own saves, non-approved listings and stale events do not notify');
console.log('PASS deterministic favorite IDs keep projector retries idempotent');
