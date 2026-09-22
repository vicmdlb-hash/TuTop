import assert from 'node:assert/strict';
import { projectFollowedSellerNotifications } from './followed-seller-notification-projection-lib.mjs';

const now=Date.parse('2026-09-22T00:00:00.000Z');
const follow={id:'buyer_seller',follower_uid:'buyer',seller_id:'seller',created_at:'2026-09-21T20:00:00.000Z'};
const listing={id:'listing-2',seller_id:'seller',title:'Libro nuevo',status:'active',moderation_status:'approved',created_at:'2026-09-21T23:00:00.000Z'};
const enabled=projectFollowedSellerNotifications({
  follows:[follow],listings:[listing],preferencesByUid:new Map([['buyer',{followed_seller_new_listing:true}]]),now,
});
assert.equal(enabled.length,1);
assert.equal(enabled[0].recipient_uid,'buyer');
assert.equal(enabled[0].kind,'followed_seller_new_listing');
assert.equal(enabled[0].listing_id,'listing-2');

assert.equal(projectFollowedSellerNotifications({
  follows:[follow],listings:[listing],preferencesByUid:new Map(),now,
}).length,0,'follow alerts are opt-in by default');

assert.equal(projectFollowedSellerNotifications({
  follows:[{...follow,created_at:'2026-09-21T23:30:00.000Z'}],listings:[listing],preferencesByUid:new Map([['buyer',{followed_seller_new_listing:true}]]),now,
}).length,0,'must not notify for listing published before follow began');

assert.equal(projectFollowedSellerNotifications({
  follows:[follow],listings:[{...listing,moderation_status:'pending'}],preferencesByUid:new Map([['buyer',{followed_seller_new_listing:true}]]),now,
}).length,0);

console.log('PASS followed-seller notifications are opt-in, post-follow and approved-listing only');
