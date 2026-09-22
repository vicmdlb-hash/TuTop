import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  DEFAULT_DISABLED_NOTIFICATION_PREFERENCES,
  NOTIFICATION_KIND_TO_PREFERENCE,
  notificationPreferenceAllows,
  notificationPreferenceKeyForKind,
} from './notification-preference-projection-lib.mjs';

assert.equal(notificationPreferenceKeyForKind('new_message'), 'new_message');
assert.equal(notificationPreferenceKeyForKind('offer_received'), 'offer_received');
assert.equal(notificationPreferenceKeyForKind('offer_accepted'), 'offer_accepted');
assert.equal(notificationPreferenceKeyForKind('counter_offer'), 'counter_offer');
assert.equal(notificationPreferenceKeyForKind('meetup_scheduled'), 'meetup_reminder');
assert.equal(notificationPreferenceKeyForKind('transaction_completed'), null, 'unmapped transactional states remain mandatory/neutral instead of being mislabeled');

assert.equal(notificationPreferenceAllows('new_message', {}), true);
assert.equal(notificationPreferenceAllows('new_message', { new_message: false }), false);
assert.equal(notificationPreferenceAllows('offer_received', { offer_received: false }), false);
assert.equal(notificationPreferenceAllows('offer_received', { offer_received: true }), true);
assert.equal(notificationPreferenceAllows('followed_seller_new_listing', {}), false);
assert.equal(notificationPreferenceAllows('followed_seller_new_listing', { followed_seller_new_listing: true }), true);
assert.equal(notificationPreferenceAllows('transaction_completed', {}), true);

const canonical=fs.readFileSync('src/lib/notificationPreferences.ts','utf8');
const defaultBlock=canonical.slice(canonical.indexOf('export const DEFAULT_NOTIFICATION_PREFERENCES'),canonical.indexOf('export const NOTIFICATION_PRIORITY'));
const canonicalFalse=[...defaultBlock.matchAll(/\b([a-z_]+): false/g)].map((m)=>m[1]).sort();
assert.deepEqual([...DEFAULT_DISABLED_NOTIFICATION_PREFERENCES].sort(),canonicalFalse,'projector default-false mirror drifted from canonical app preferences');

for(const key of Object.values(NOTIFICATION_KIND_TO_PREFERENCE)) {
  assert.match(canonical,new RegExp(`\\b${key}: (?:true|false)`),`projector maps unknown preference key ${key}`);
}

const projector=fs.readFileSync('scripts/v2-marketplace-notification-projector.mjs','utf8');
assert.match(projector,/loadNotificationPreferences\(uid\)/);
assert.match(projector,/notification_preferences\/\$\{encodeURIComponent\(clean\)\}/);
assert.match(projector,/notificationPreferenceAllows/);
assert.match(projector,/suppressed_by_preferences/);

console.log('PASS marketplace projector respects per-user notification preferences before outbox creation');
console.log('PASS missing preferences use canonical defaults, including the three opt-in defaults');
console.log('PASS unmapped transactional notifications are not silently attached to the wrong preference');
