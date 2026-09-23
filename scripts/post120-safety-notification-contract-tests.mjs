import fs from 'node:fs';
import assert from 'node:assert/strict';

const projector=fs.readFileSync('scripts/v2-safety-notification-projector.mjs','utf8');
const rules=fs.readFileSync('firebase/firestore.v2.rules','utf8');

assert.match(projector,/SEND_STAGING_SAFETY_ALERTS/);
assert.match(projector,/collectionId:'moderationStatus'/);
assert.match(projector,/notification_preferences/);
assert.match(projector,/notification_outbox/);
assert.match(projector,/projectSafetyModerationNotifications/);
assert.match(rules,/match \/moderationStatus\/\{uid\}/);
assert.match(rules,/allow create, update: if isAdmin\(\)/);
assert.match(rules,/request\.resource\.data\.admin_uid == request\.auth\.uid/);

console.log('PASS safety producer is bound to an admin-only trusted source and explicit apply ACK');
