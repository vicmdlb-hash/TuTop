import assert from 'node:assert/strict';
import { projectTemporalMarketplaceReminders } from './temporal-marketplace-reminder-lib.mjs';

const now=Date.parse('2026-09-21T20:00:00.000Z');
const base={id:'tx-1',listing_id:'listing-1',chat_id:'chat-1',buyer_id:'buyer',seller_id:'seller'};
const prefs=new Map([
  ['buyer',{reservation_expiring:true,meetup_reminder:true}],
  ['seller',{reservation_expiring:true,meetup_reminder:true}],
]);

const reservation=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'reserved',reservation_expires_at:'2026-09-21T20:45:00.000Z'}],
  preferencesByUid:prefs,now,
});
assert.equal(reservation.length,2);
assert.ok(reservation.every((n)=>n.kind==='reservation_expiring'));
assert.ok(reservation.every((n)=>n.transaction_id==='tx-1'));

const disabled=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'reserved',reservation_expires_at:'2026-09-21T20:45:00.000Z'}],
  preferencesByUid:new Map([['buyer',{reservation_expiring:false}],['seller',{reservation_expiring:true}]]),now,
});
assert.deepEqual(disabled.map((n)=>n.recipient_uid),['seller']);

const meetup=projectTemporalMarketplaceReminders({
  transactions:[{...base,id:'tx-2',status:'meetup_scheduled',meetup_at:'2026-09-21T20:30:00.000Z'}],
  preferencesByUid:prefs,now,
});
assert.equal(meetup.length,2);
assert.ok(meetup.every((n)=>n.kind==='meetup_reminder'));

const far=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'reserved',reservation_expires_at:'2026-09-21T22:30:00.000Z'}],
  preferencesByUid:prefs,now,
});
assert.equal(far.length,0);

const expired=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'reserved',reservation_expires_at:'2026-09-21T19:59:00.000Z'}],
  preferencesByUid:prefs,now,
});
assert.equal(expired.length,0);

const wrongState=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'completed',reservation_expires_at:'2026-09-21T20:20:00.000Z',meetup_at:'2026-09-21T20:20:00.000Z'}],
  preferencesByUid:prefs,now,
});
assert.equal(wrongState.length,0);

const rerunA=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'reserved',reservation_expires_at:'2026-09-21T20:45:00.000Z'}],
  preferencesByUid:prefs,now,
});
const rerunB=projectTemporalMarketplaceReminders({
  transactions:[{...base,status:'reserved',reservation_expires_at:'2026-09-21T20:45:00.000Z'}],
  preferencesByUid:prefs,now,
});
assert.deepEqual(rerunA.map((n)=>n.id),rerunB.map((n)=>n.id));

console.log('PASS reservation-expiring reminders respect status, horizon and preferences');
console.log('PASS meetup reminders respect status, horizon and preferences');
console.log('PASS deterministic IDs make projector reruns idempotent');
