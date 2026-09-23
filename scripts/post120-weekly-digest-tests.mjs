import assert from 'node:assert/strict';
import { previousUtcWeek, projectWeeklyDigests } from './weekly-digest-projection-lib.mjs';

const now=Date.parse('2026-09-23T12:00:00.000Z');
const period=previousUtcWeek(now);
assert.equal(period.startIso,'2026-09-14T00:00:00.000Z');
assert.equal(period.endIso,'2026-09-21T00:00:00.000Z');

const events=[
  {id:'e1',recipient_uid:'u1',kind:'new_message',source_event_at:'2026-09-15T10:00:00.000Z'},
  {id:'e2',recipient_uid:'u1',kind:'new_message',source_event_at:'2026-09-16T10:00:00.000Z'},
  {id:'e3',recipient_uid:'u1',kind:'saved_search_match',source_event_at:'2026-09-17T10:00:00.000Z'},
  {id:'e4',recipient_uid:'u1',kind:'weekly_digest',source_event_at:'2026-09-18T10:00:00.000Z'},
  {id:'e5',recipient_uid:'u2',kind:'offer_received',source_event_at:'2026-09-17T10:00:00.000Z'},
  {id:'old',recipient_uid:'u1',kind:'new_message',source_event_at:'2026-09-10T10:00:00.000Z'},
];
const projected=projectWeeklyDigests({
  events,
  preferencesByUid:new Map([['u1',{weekly_digest:true}],['u2',{weekly_digest:false}]]),
  now,
});
assert.equal(projected.length,1);
assert.equal(projected[0].recipient_uid,'u1');
assert.equal(projected[0].kind,'weekly_digest');
assert.match(projected[0].body,/3 actividades/);
assert.match(projected[0].body,/2 mensajes/);
assert.match(projected[0].body,/1 coincidencias de búsqueda/);

const again=projectWeeklyDigests({events,preferencesByUid:new Map([['u1',{weekly_digest:true}]]),now});
assert.equal(projected[0].id,again[0].id,'same closed week must have deterministic digest ID');

console.log('PASS weekly digest uses the previous complete UTC week, excludes digest recursion and remains opt-in');
console.log('PASS deterministic recipient/week ID prevents duplicate weekly digests');
