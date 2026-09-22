import assert from 'node:assert/strict';
import { deterministicSavedSearchNotificationId, projectSavedSearchNotifications, savedSearchMatchesCanonicalListing } from './saved-search-notification-projection-lib.mjs';

const listing={
  id:'listing-1',seller_id:'seller-1',status:'active',moderation_status:'approved',
  institution_id:'uatx',campus_id:'uatx-riberena',visibility_scope:'campus',
  category_id:'electronica',title:'Calculadora Casio científica FX-991',description:'Buen estado para ingeniería',
  attributes:{brand:'Casio',model:'FX-991'},price_mxn:450,created_at:'2026-09-21T12:00:00.000Z'
};
const search={
  id:'search-1',owner_uid:'buyer-1',query:'calculadora casio',category:'Electrónica',max_price_mxn:500,
  institution_id:'uatx',campus_id:'uatx-riberena',visibility_scope:'campus',notifications_enabled:true
};
assert.deepEqual(savedSearchMatchesCanonicalListing(search,listing),{eligible:true,reason:'matched'});
assert.equal(savedSearchMatchesCanonicalListing({...search,notifications_enabled:false},listing).reason,'notifications_disabled');
assert.equal(savedSearchMatchesCanonicalListing({...search,owner_uid:'seller-1'},listing).reason,'own_listing');
assert.equal(savedSearchMatchesCanonicalListing({...search,query:'iphone'},listing).reason,'query_mismatch');
assert.equal(savedSearchMatchesCanonicalListing({...search,max_price_mxn:400},listing).reason,'price_above_limit');
assert.equal(savedSearchMatchesCanonicalListing({...search,campus_id:'otro'},listing).reason,'campus_mismatch');
assert.equal(savedSearchMatchesCanonicalListing(search,{...listing,moderation_status:'pending'}).reason,'listing_not_active_or_approved');

const now=Date.parse('2026-09-21T12:10:00.000Z');
const on=projectSavedSearchNotifications({searches:[search],listings:[listing],preferencesByUid:new Map([['buyer-1',{saved_search_match:true}]]),now,lookbackMs:3600_000});
assert.equal(on.length,1);
assert.equal(on[0].kind,'saved_search_match');
assert.equal(on[0].listing_id,'listing-1');
assert.equal(on[0].saved_search_id,'search-1');
assert.equal(on[0].recipient_uid,'buyer-1');
assert.match(on[0].body,/450/);

const off=projectSavedSearchNotifications({searches:[search],listings:[listing],preferencesByUid:new Map([['buyer-1',{saved_search_match:false}]]),now,lookbackMs:3600_000});
assert.equal(off.length,0,'account-level preference must suppress saved-search alert');

const deterministicA=deterministicSavedSearchNotificationId('search-1','listing-1','buyer-1');
const deterministicB=deterministicSavedSearchNotificationId('search-1','listing-1','buyer-1');
assert.equal(deterministicA,deterministicB);

const dupes=projectSavedSearchNotifications({searches:[search,search],listings:[listing,listing],preferencesByUid:new Map(),now,lookbackMs:3600_000});
assert.equal(dupes.length,1,'reruns/duplicate scans must collapse to deterministic ID');

console.log('PASS saved-search alerts project only approved active matching listings');
console.log('PASS own listings and disabled search/account preferences do not notify');
console.log('PASS deterministic IDs prevent duplicate outbox notifications');
