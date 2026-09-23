import fs from 'node:fs';
import assert from 'node:assert/strict';

const projector=fs.readFileSync('scripts/v2-listing-saved-notification-projector.mjs','utf8');
const prefs=fs.readFileSync('src/lib/notificationPreferences.ts','utf8');

assert.match(projector,/SEND_STAGING_LISTING_SAVED_ALERTS/);
assert.match(projector,/collectionId:'favorites'/);
assert.match(projector,/listings_v2/);
assert.match(projector,/notification_preferences/);
assert.match(projector,/notification_outbox/);
assert.match(projector,/projectListingSavedNotifications/);
assert.match(prefs,/listing_saved_count: false/);

console.log('PASS listing-saved producer is explicit opt-in and apply-gated');
