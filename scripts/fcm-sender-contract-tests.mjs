import assert from 'node:assert/strict';
import { fcmDataForNotification } from './fcm-payload-lib.mjs';

const data = fcmDataForNotification({
  id: 'outbox-123',
  kind: 'new_message',
  listing_id: 'listing-1',
  chat_id: 'chat-1',
  transaction_id: 'tx-1',
});

assert.deepEqual(data, {
  notification_id: 'outbox-123',
  kind: 'new_message',
  listing_id: 'listing-1',
  transaction_id: 'tx-1',
  chat_id: 'chat-1',
});
assert.throws(() => fcmDataForNotification({ kind: 'new_message' }), /FCM_NOTIFICATION_ID_REQUIRED/);
assert.equal(typeof data.notification_id, 'string');
assert.equal(typeof data.chat_id, 'string');

console.log('✅ FCM sender payload contract PASS');
