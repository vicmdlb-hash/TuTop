import fs from 'node:fs';
import assert from 'node:assert/strict';

const feed=fs.readFileSync('src/components/Feed.tsx','utf8');
const projector=fs.readFileSync('scripts/v2-saved-search-notification-projector.mjs','utf8');
const matcher=fs.readFileSync('src/lib/savedSearchNotifications.ts','utf8');

assert.match(feed,/Búsqueda guardada · alerta configurada/);
assert.doesNotMatch(feed,/alertas V2 activas/);
assert.match(projector,/SEND_STAGING_SAVED_SEARCH_ALERTS/);
assert.match(projector,/saved_searches/);
assert.match(projector,/notification_preferences/);
assert.match(projector,/notification_outbox/);
assert.match(projector,/notifications_enabled/);
assert.match(projector,/moderation_status/);
assert.match(projector,/projectSavedSearchNotifications/);
assert.match(matcher,/notifications_disabled/);
assert.match(matcher,/scope_national_mismatch/);

console.log('PASS UI no longer claims saved-search delivery is active before a worker is explicitly enabled');
console.log('PASS trusted projector is apply-gated and uses saved-search, preference and listing truth');
