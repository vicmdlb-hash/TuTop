import fs from 'node:fs';
import assert from 'node:assert/strict';

const canonical=fs.readFileSync('src/lib/notificationPreferences.ts','utf8');
const keyBlock=canonical.slice(canonical.indexOf('export type NotificationPreferenceKey'),canonical.indexOf('export type NotificationPriority'));
const keys=[...keyBlock.matchAll(/\| '([a-z_]+)'/g)].map((m)=>m[1]);

const proven=new Set([
  'new_message','offer_received','offer_accepted','counter_offer',
  'reservation_expiring','meetup_reminder','saved_search_match','listing_saved_count',
]);
const intentionallyUnproven={
  favorite_price_drop:'requires a trustworthy historical price baseline, not just current listing price',
  saved_item_available:'requires a trustworthy unavailable->available transition baseline',
  followed_seller_new_listing:'no canonical seller-follow graph exists yet',
  weekly_digest:'requires an explicitly scheduled aggregation worker',
  safety_alert:'requires a defined trusted safety-event source rather than a generic switch',
};

assert.equal(keys.length,13);
for(const key of proven) assert.ok(keys.includes(key),`unknown proven key ${key}`);
for(const key of Object.keys(intentionallyUnproven)) assert.ok(keys.includes(key),`unknown unproven key ${key}`);
assert.equal(proven.size+Object.keys(intentionallyUnproven).length,keys.length);

console.log(JSON.stringify({proven:[...proven],intentionally_unproven:intentionallyUnproven},null,2));
console.log('PASS all 13 preferences are classified; unsupported producers remain explicit instead of fabricated');
