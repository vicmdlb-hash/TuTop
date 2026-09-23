import assert from 'node:assert/strict';
import { projectSafetyModerationNotifications } from './safety-moderation-notification-projection-lib.mjs';

const now=Date.parse('2026-09-22T20:00:00.000Z');
const base={id:'user-1',suspended:true,reason:'Revisión de seguridad',admin_uid:'admin-1',updated_at:'2026-09-22T19:30:00.000Z'};

const active=projectSafetyModerationNotifications({
  moderationStatuses:[base],
  preferencesByUid:new Map([['user-1',{safety_alert:true}]]),
  now,
});
assert.equal(active.length,1);
assert.equal(active[0].recipient_uid,'user-1');
assert.equal(active[0].kind,'safety_alert');
assert.doesNotMatch(active[0].body,/admin-1|Revisión de seguridad/);

const disabled=projectSafetyModerationNotifications({
  moderationStatuses:[base],
  preferencesByUid:new Map([['user-1',{safety_alert:false}]]),
  now,
});
assert.equal(disabled.length,0);

const untrusted=projectSafetyModerationNotifications({
  moderationStatuses:[{...base,admin_uid:''}],
  preferencesByUid:new Map([['user-1',{safety_alert:true}]]),
  now,
});
assert.equal(untrusted.length,0);

const cleared=projectSafetyModerationNotifications({
  moderationStatuses:[{...base,suspended:false,updated_at:'2026-09-22T19:40:00.000Z'}],
  preferencesByUid:new Map([['user-1',{safety_alert:true}]]),
  now,
});
assert.equal(cleared.length,1);
assert.match(cleared[0].title,/estado de seguridad/i);

const rerunA=projectSafetyModerationNotifications({moderationStatuses:[base],preferencesByUid:new Map(),now});
const rerunB=projectSafetyModerationNotifications({moderationStatuses:[base],preferencesByUid:new Map(),now});
assert.deepEqual(rerunA.map((x)=>x.id),rerunB.map((x)=>x.id));

console.log('PASS safety alerts derive only from trusted admin-authored moderationStatus changes');
console.log('PASS safety alert copy avoids exposing admin identity or moderation reason');
console.log('PASS deterministic IDs make repeated scans idempotent');
