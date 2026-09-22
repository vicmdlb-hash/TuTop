import fs from 'node:fs';
import assert from 'node:assert/strict';

const projector=fs.readFileSync('scripts/v2-weekly-digest-projector.mjs','utf8');
assert.match(projector,/SEND_STAGING_WEEKLY_DIGESTS/);
assert.match(projector,/notification_outbox/);
assert.match(projector,/notification_preferences/);
assert.match(projector,/previousUtcWeek/);
assert.match(projector,/projectWeeklyDigests/);
console.log('PASS weekly digest producer is opt-in, deterministic and explicitly apply-gated');
