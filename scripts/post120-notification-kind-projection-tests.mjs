import assert from 'node:assert/strict';
import { appNotificationKindFromOutbox } from '../src/lib/notificationProjection.ts';

const cases = {
  new_message: 'message',
  offer_received: 'offer',
  offer_accepted: 'offer',
  counter_offer: 'offer',
  reservation_created: 'reservation',
  reservation_expired: 'reservation',
  reservation_expiring: 'reservation',
  meetup_scheduled: 'delivery',
  meetup_reminder: 'delivery',
  transaction_completed: 'delivery',
  transaction_cancelled: 'delivery',
  transaction_disputed: 'delivery',
  saved_search_match: 'search',
  safety_alert: 'safety',
  verification: 'verification',
  verification_approved: 'verification',
  weekly_bid: 'bid',
};
for (const [raw, expected] of Object.entries(cases)) {
  assert.equal(appNotificationKindFromOutbox(raw), expected, raw);
}
assert.equal(appNotificationKindFromOutbox('future_unknown_kind'), 'system');
assert.equal(appNotificationKindFromOutbox(undefined), 'system');
console.log('PASS trusted notification outbox kinds retain meaningful in-app semantics');
