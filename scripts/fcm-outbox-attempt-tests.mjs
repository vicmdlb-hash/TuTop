import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trustedFcmQueryRecord, trustedFcmDirectRecord } from './fcm-staging-document-identity-lib.mjs';
import { planFcmOutboxClaim, attachCommittedFcmClaim, planFcmOutboxCompletion, canSendAfterStaleOwnerCleanup, isFreshFcmTargetStillEligible } from './fcm-outbox-attempt-lib.mjs';

const oldTime = '2026-10-28T20:00:00.000Z';
const startTime = '2026-10-28T20:00:01.000Z';
const newTime = '2026-10-28T20:00:02.000Z';
const sentTime = '2026-10-28T20:00:03.000Z';
const pending = { id:'synthetic-notice',status:'pending',attempts:0,_document_update_time:oldTime };
const planned = planFcmOutboxClaim(pending,startTime);
assert.deepEqual(planned.precondition,{updateTime:oldTime});
assert.deepEqual(planned.fields,{status:'dispatching',attempts:1,dispatch_started_at:startTime,updated_at:startTime});
const claimed = attachCommittedFcmClaim(pending,planned,{writeResults:[{updateTime:newTime}]});
assert.equal(claimed.status,'dispatching');
assert.equal(claimed._document_update_time,newTime);
assert.equal([claimed].filter(x=>x.status==='pending').length,0,'ambiguous delivery cannot auto-requeue');
assert.throws(()=>planFcmOutboxClaim(claimed,sentTime),/FCM_OUTBOX_NOT_PENDING/);
const sent = planFcmOutboxCompletion(claimed,sentTime);
assert.deepEqual(sent.precondition,{updateTime:newTime});
assert.equal(sent.fields.status,'sent');
assert(!Object.hasOwn(sent.fields,'attempts'),'do not double count the claim attempt');
for(const bad of [{...pending,status:'sent'},{...pending,status:'dispatching'},
 {...pending,attempts:-1},{...pending,attempts:'bad'},
 {...pending,_document_update_time:'bad'}])
  assert.throws(()=>planFcmOutboxClaim(bad,startTime));
for(const bad of [null,{}, {writeResults:[]},{writeResults:[{}]},
 {writeResults:[{updateTime:'bad'}]},
 {writeResults:[{updateTime:newTime},{updateTime:newTime}]}])
  assert.throws(()=>attachCommittedFcmClaim(pending,planned,bad));
assert.throws(()=>planFcmOutboxCompletion(pending,sentTime),/FCM_OUTBOX_NOT_DISPATCHING/);
assert.throws(()=>planFcmOutboxCompletion(claimed,'bad'),/FCM_OUTBOX_SENT_TIME_INVALID/);

assert.equal(canSendAfterStaleOwnerCleanup(0, 0), true);
assert.equal(canSendAfterStaleOwnerCleanup(2, 2), true);
assert.equal(canSendAfterStaleOwnerCleanup(2, 1), false, 'partial stale owner cleanup must quarantine send');
assert.equal(canSendAfterStaleOwnerCleanup(1, 0), false, 'failed deactivation must quarantine send');
for (const [required, verified] of [[-1,0],[1,-1],[1,2],[1,NaN],[NaN,0],[1.5,1]]) {
  assert.throws(()=>canSendAfterStaleOwnerCleanup(required,verified), /FCM_STALE_OWNER_CLEANUP_COUNT_INVALID/);
}
// Synthetic proof: a token chosen before cleanup cannot be sent using a stale
// Firestore snapshot after another account, logout or revocation takes over.
const selected = {
  id: 'device-record-a',
  token: 'synthetic-token-not-a-real-fcm-secret',
  owner_uid: 'synthetic-a',
  active: true,
  created_at: oldTime,
  updated_at: startTime,
  _document_update_time: newTime,
};
assert.equal(isFreshFcmTargetStillEligible(selected, [{ ...selected }], 'synthetic-a'), true);
assert.equal(isFreshFcmTargetStillEligible(selected, [], 'synthetic-a'), false,
  'empty/incomplete inventory cannot authorize the send');
assert.equal(isFreshFcmTargetStillEligible(selected, [{ ...selected }], 'synthetic-b'), false,
  'recipient UID must remain unchanged');
assert.equal(isFreshFcmTargetStillEligible(selected, [
  { ...selected, active: false, _document_update_time: sentTime },
], 'synthetic-a'), false, 'revoked token must not receive');
assert.equal(isFreshFcmTargetStillEligible(selected, [
  { ...selected, _document_update_time: sentTime },
], 'synthetic-a'), false, 'concurrently updated token cannot be reused');
assert.equal(isFreshFcmTargetStillEligible(selected, [
  { ...selected },
  { id: 'device-record-b', token: selected.token, owner_uid: 'synthetic-b',
    active: true, created_at: oldTime, updated_at: sentTime, _document_update_time: sentTime },
], 'synthetic-a'), false, 'active competing account must quarantine the send');
assert.equal(isFreshFcmTargetStillEligible(selected, [
  { ...selected }, { ...selected },
], 'synthetic-a'), false, 'duplicate inventory IDs are not trustworthy');

const source=fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');
const claimIndex=source.indexOf('const claimed = await claimPending(item);');
const sendIndex=source.indexOf('messages:send');
assert(claimIndex>0 && sendIndex>claimIndex,'Firestore claim must precede HTTP FCM send');
assert(source.includes("const pending = outbox.filter((item) => item.status === 'pending');"));
assert(source.includes("if (deliveredForItem > 0) await markSent(claimed);"));
assert(source.includes('currentDocument: planned.precondition'));
const cleanupStart=source.indexOf('const staleForTarget = supersededActiveTokens.filter');
const sendStart=source.indexOf('const response = await fetch(`https://fcm.googleapis.com');
assert(cleanupStart > 0 && sendStart > cleanupStart);
assert(source.slice(cleanupStart,sendStart).includes('if (!canSendAfterStaleOwnerCleanup('), 'physical FCM send requires verified cleanup');
assert(source.includes('FCM_STALE_OWNER_CLEANUP_COMMIT_UNVERIFIED'), 'Firestore receipt must be validated');
const refreshIndex = source.indexOf("const freshTokens = await query('device_tokens');", cleanupStart);
const freshGateIndex = source.indexOf('if (!isFreshFcmTargetStillEligible(target, freshTokens, item.recipient_uid))', refreshIndex);
assert(refreshIndex > cleanupStart && refreshIndex < sendStart, 'post-cleanup Firestore inventory required before FCM POST');
assert(freshGateIndex > refreshIndex && freshGateIndex < sendStart, 'fresh exact owner/version gate must precede FCM POST');
assert(source.includes('FCM_PHYSICAL_FRESH_TARGET_DENIED'), 'unsafe target must be quarantined without sending');
// The trusted Firestore path is the only permitted source for a record's ID.
// A forged field.id must never redirect token cleanup, chat auth or outbox CAS.
const projectRoot = 'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents';
const record = (path, fields = {}, updateTime = newTime) => ({
  name: `${projectRoot}/${path}`, updateTime, fields,
});
const identityDecode = fields => fields;
assert.deepEqual(trustedFcmQueryRecord(record('device_tokens/token-a', {
  owner_uid: 'synthetic-a', active: true,
}), 'device_tokens', identityDecode), {
  owner_uid: 'synthetic-a', active: true, id: 'token-a', _document_update_time: newTime,
});
assert.deepEqual(trustedFcmDirectRecord(record('chats/chat-a', {
  buyer_id: 'synthetic-a',
}), 'chats/chat-a', identityDecode), { buyer_id: 'synthetic-a', id: 'chat-a' });
assert.throws(() => trustedFcmQueryRecord(record('device_tokens/token-a', {
  id: 'another-token',
}), 'device_tokens', identityDecode), /FCM_DOCUMENT_FIELD_ID_CONFLICT/);
assert.throws(() => trustedFcmQueryRecord(record('notification_outbox/notice-a', {
  id: 'notice-b',
}), 'notification_outbox', identityDecode), /FCM_DOCUMENT_FIELD_ID_CONFLICT/);
assert.throws(() => trustedFcmDirectRecord(record('chats/chat-a', {
  id: 'chat-b',
}), 'chats/chat-a', identityDecode), /FCM_DOCUMENT_FIELD_ID_CONFLICT/);
assert.throws(() => trustedFcmQueryRecord(record('device_tokens/parent/subchild'),
  'device_tokens', identityDecode), /FCM_QUERY_DOCUMENT_PATH_INVALID/);
assert.throws(() => trustedFcmQueryRecord(record('other_collection/token-a'),
  'device_tokens', identityDecode), /FCM_QUERY_DOCUMENT_PATH_INVALID/);
assert.throws(() => trustedFcmQueryRecord({
  ...record('device_tokens/token-a'),
  name: 'projects/other-project/databases/(default)/documents/device_tokens/token-a',
}, 'device_tokens', identityDecode), /FCM_QUERY_DOCUMENT_PATH_INVALID/);
assert.throws(() => trustedFcmQueryRecord(record('device_tokens/token-a', {}, 'invalid-date'),
  'device_tokens', identityDecode), /FCM_DOCUMENT_UPDATE_TIME_REQUIRED/);
assert.throws(() => trustedFcmDirectRecord(record('user_blocks/a/targets/b'),
  'user_blocks/a/targets/c', identityDecode), /FCM_DOCUMENT_NAME_MISMATCH/);
assert.throws(() => trustedFcmDirectRecord(record('users/a'),
  'users/a', identityDecode), /FCM_DIRECT_DOCUMENT_PATH_INVALID/);
assert(source.includes('trustedFcmQueryRecord(row.document, collectionId, decodeFields)'));
assert(source.includes('trustedFcmDirectRecord(result, path, decodeFields)'));
assert(!source.includes("id: row.document.name.split('/').pop(),"),
  'a Firestore field must never override the trusted document ID');
console.log('PASS synthetic FCM outbox CAS claim-before-send and uncertain-delivery quarantine');
