import fs from 'node:fs';
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

const trustedWorkflow = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const validationWorkflow = fs.readFileSync('.github/workflows/post106-security-fcm-validation.yml', 'utf8');
const guard = fs.readFileSync('scripts/staging-freeze-guard.mjs', 'utf8');
const gatedSender = fs.readFileSync('scripts/gated-post110-fcm-send.mjs', 'utf8');
const sender = fs.readFileSync('scripts/post110-fcm-sender.mjs', 'utf8');

assert.match(trustedWorkflow, /fix\/tutop-post110-fcm-delivery/);
assert.match(trustedWorkflow, /post106-security-fcm-validation\.yml\/runs/);
assert.match(trustedWorkflow, /head_sha="\$GITHUB_SHA"/);
assert.match(trustedWorkflow, /select\(\.head_branch ==/);
assert.match(trustedWorkflow, /node scripts\/gated-post110-fcm-send\.mjs/);
assert.match(validationWorkflow, /fix\/tutop-post110-fcm-delivery/);
assert.match(validationWorkflow, /node scripts\/post110-fcm-sender\.mjs/);
assert.match(guard, /TUTOP_POST110_FCM_BRANCH = 'fix\/tutop-post110-fcm-delivery'/);
assert.match(gatedSender, /POST110_FCM_VALIDATION_SHA_MUST_EQUAL_GITHUB_SHA/);
assert.match(gatedSender, /post110-fcm-sender\.mjs', '--apply'/);
assert.match(sender, /fcmDataForNotification\(item\)/);
assert.match(sender, /if \(!apply\)/);
assert.match(sender, /real_fcm_sent: apply && delivered > 0/);

console.log('✅ FCM sender payload + same-SHA gate contract PASS');
