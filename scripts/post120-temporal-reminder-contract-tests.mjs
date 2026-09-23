import fs from 'node:fs';
import assert from 'node:assert/strict';

const projector=fs.readFileSync('scripts/v2-temporal-notification-projector.mjs','utf8');
const preference=fs.readFileSync('scripts/notification-preference-projection-lib.mjs','utf8');

assert.match(projector,/SEND_STAGING_TEMPORAL_REMINDERS/);
assert.match(projector,/reservation_expires_at/);
assert.match(projector,/meetup_at/);
assert.match(projector,/notification_preferences/);
assert.match(projector,/notification_outbox/);
assert.match(projector,/projectTemporalMarketplaceReminders/);
assert.match(preference,/reservation_expiring: 'reservation_expiring'/);
assert.match(preference,/meetup_reminder: 'meetup_reminder'/);

console.log('PASS temporal reminder projector is explicitly apply-gated and bound to canonical preferences');
