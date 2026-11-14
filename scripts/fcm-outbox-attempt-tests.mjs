import assert from 'node:assert/strict';
import { fcmDataForNotification } from './fcm-payload-lib.mjs';
import { isCanonicalFcmTimestamp, fcmTokenCleanupPrecondition, assertCompleteFcmInventory } from './fcm-token-ownership-lib.mjs';
import fs from 'node:fs';
import { trustedFcmQueryRecord, trustedFcmDirectRecord, fcmRecipientErasureAllows } from './fcm-staging-document-identity-lib.mjs';
import { planFcmOutboxClaim, attachCommittedFcmClaim, planFcmOutboxCompletion, canSendAfterStaleOwnerCleanup, isFreshFcmTargetStillEligible } from './fcm-outbox-attempt-lib.mjs';

assert.deepEqual(fcmDataForNotification({ id: 'synthetic-notice', recipient_uid: 'synthetic_user', kind: 'new_message' }), { notification_id: 'synthetic-notice', recipient_uid: 'synthetic_user', kind: 'new_message' });
assert.throws(() => fcmDataForNotification({ id: 123, recipient_uid: 'synthetic_user' }), /FCM_NOTIFICATION_ID_INVALID/);
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
for (const invalidAttempt of ['2', '', null, true, false]) {
  assert.throws(() => planFcmOutboxClaim(
    { ...pending, attempts: invalidAttempt }, startTime),
    /FCM_OUTBOX_ATTEMPTS_INVALID/);
}
assert.throws(()=>planFcmOutboxCompletion(pending,sentTime),/FCM_OUTBOX_NOT_DISPATCHING/);
assert.throws(()=>planFcmOutboxCompletion(claimed,'bad'),/FCM_OUTBOX_SENT_TIME_INVALID/);

// Firestore compare-and-swap versions and audit times must be real, canonical
// UTC instants: Date.parse may otherwise normalize impossible calendar dates.
for (const badStamp of [
  '2026-02-31T20:00:00Z',
  '2026-10-28T20:00:00+00:00',
  '2026-10-28T20:00:00',
  '2026-13-28T20:00:00Z',
  '2026-10-28T25:00:00Z',
]) {
  assert.equal(isCanonicalFcmTimestamp(badStamp), false);
  assert.throws(() => fcmTokenCleanupPrecondition({
    _document_update_time: badStamp,
  }), /FCM_STALE_TOKEN_UPDATE_TIME_REQUIRED/);
  assert.throws(() => planFcmOutboxClaim(pending, badStamp), /FCM_OUTBOX_CLAIM_TIME_INVALID/);
  assert.throws(() => attachCommittedFcmClaim(pending, planned, {
    writeResults: [{ updateTime: badStamp }],
  }), /FCM_STALE_TOKEN_UPDATE_TIME_REQUIRED/);
  assert.throws(() => planFcmOutboxCompletion(claimed, badStamp), /FCM_OUTBOX_SENT_TIME_INVALID/);
}
assert.equal(isCanonicalFcmTimestamp(newTime), true);
// A Firestore runQuery response with skipped records is NOT a complete FCM
// ownership inventory, even if the returned document count is below LIMIT.
// All cases are synthetic: no FCM tokens, users, or Firestore requests.
const inventoryRoot = 'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents';
const inventoryRow = { document: { name: inventoryRoot + '/device_tokens/synthetic-row' }, readTime: newTime };
assert.equal(assertCompleteFcmInventory([inventoryRow, { readTime: newTime, skippedResults: 0 }],
  500, 'device_tokens').length, 1);
for (const collectionId of ['device_tokens', 'notification_outbox']) {
  for (const skipped of [1, 3, 499]) {
    assert.throws(() => assertCompleteFcmInventory([
      { document: { name: inventoryRoot + '/' + collectionId + '/synthetic-row' } },
      { readTime: newTime, skippedResults: skipped },
    ], 500, collectionId), /FCM_QUERY_INCOMPLETE_DENIED/);
  }
}
for (const malformed of [
  [{ skippedResults: -1 }], [{ skippedResults: '1' }], [{ skippedResults: 1.5 }],
  [{ document: null }], [{}], [{ unexpected: 'not-a-Firestore-response' }],
]) {
  assert.throws(() => assertCompleteFcmInventory(malformed, 500, 'device_tokens'),
    /FCM_QUERY_INVENTORY_INVALID/);
}
assert.throws(() => assertCompleteFcmInventory([inventoryRow], 1, 'device_tokens'),
  /FCM_QUERY_INCOMPLETE_DENIED/);
console.log('PASS bounded FCM inventory rejects skipped query rows and malformed envelopes');
console.log('PASS FCM outbox requires canonical UTC stamps and rejects rolled-over dates');


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

// After a device moves accounts, malformed event order or timestamp fields
// must never authorize a send even if its cached updateTime is unchanged.
const oldOwner = { ...selected, owner_uid: 'synthetic-old',
  updated_at: '2026-10-28T20:00:01.000Z' };
const malformedNewest = { ...selected, id: 'device-record-new',
  owner_uid: 'synthetic-a', updated_at: '2026-02-31T20:00:02Z' };
assert.equal(isFreshFcmTargetStillEligible(oldOwner, [oldOwner, malformedNewest],
  'synthetic-old'), false, 'malformed newer owner record must quarantine delivery');

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
// The query-backed token/outbox version is used as a Firestore CAS witness.
// Date.parse can normalize 31 February or accept noncanonical offsets.
for (const invalidFirestoreVersion of [
  '2026-02-31T20:00:02Z',
  '2026-10-28T20:00:02+00:00',
  '2026-10-28T20:00:02',
  '2026-10-28T25:00:02Z',
  'not-a-timestamp',
  1234, null,
]) {
  assert.throws(() => trustedFcmQueryRecord(
    record('device_tokens/token-a', {}, invalidFirestoreVersion),
    'device_tokens', identityDecode,
  ), /FCM_DOCUMENT_UPDATE_TIME_REQUIRED/);
  assert.throws(() => trustedFcmQueryRecord(
    record('notification_outbox/notice-a', {}, invalidFirestoreVersion),
    'notification_outbox', identityDecode,
  ), /FCM_DOCUMENT_UPDATE_TIME_REQUIRED/);
}
const nineDigitVersion = '2026-10-28T20:00:02.123456789Z';
assert.equal(trustedFcmQueryRecord(record('device_tokens/token-a', {}, nineDigitVersion),
  'device_tokens', identityDecode)._document_update_time, nineDigitVersion);

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


// FCM_ERASURE_RECIPIENT_TEST: an account deletion must suppress all physical
// notifications, even if its token remained active. Pure synthetic records;
// no Firebase credentials, deletion, push request, or real users involved.
const erasurePath = 'account_deletion_requests/synthetic-a';
const erasureRecord = (status, uid = 'synthetic-a') => trustedFcmDirectRecord(
  record(erasurePath, { uid, status }), erasurePath, identityDecode,
);
assert.equal(fcmRecipientErasureAllows('synthetic-a', null), true,
  'confirmed absent erasure request should preserve legitimate delivery');
assert.equal(fcmRecipientErasureAllows('synthetic-a', erasureRecord('rejected')), true,
  'explicitly rejected request may resume delivery');
for (const status of ['pending', 'processing', 'completed', 'unexpected', '', null, undefined]) {
  assert.equal(fcmRecipientErasureAllows('synthetic-a', erasureRecord(status)), false,
    'unsafe or unknown account deletion status must quarantine FCM: ' + status);
}
assert.equal(fcmRecipientErasureAllows('synthetic-a', erasureRecord('rejected', 'synthetic-b')), false,
  'forged UID in a rejected request cannot authorize the target account');
assert.equal(fcmRecipientErasureAllows('synthetic-b', erasureRecord('rejected')), false,
  'a rejected request from another UID cannot authorize cross-account delivery');
for (const bad of [undefined, {}, [], { status: 'rejected' },
  { id: 'synthetic-a', status: 'rejected' },
  { uid: 'synthetic-a', status: 'rejected' }]) {
  assert.equal(fcmRecipientErasureAllows('synthetic-a', bad), false,
    'ambiguous deletion record must never become an allow witness');
}
for (const badUid of ['', '../synthetic-a', 'synthetic/a', null, 123, ' '.repeat(2)]) {
  assert.equal(fcmRecipientErasureAllows(badUid, null), false,
    'invalid recipient identity must block even if deletion request is absent');
}
assert.throws(() => trustedFcmDirectRecord(
  record('account_deletion_requests/synthetic-b', { uid: 'synthetic-a', status: 'rejected' }),
  erasurePath, identityDecode,
), /FCM_DOCUMENT_NAME_MISMATCH/, 'a forged Firestore path cannot substitute recipient evidence');
assert.throws(() => trustedFcmDirectRecord(
  record('users/synthetic-a', { uid: 'synthetic-a', status: 'rejected' }),
  'users/synthetic-a', identityDecode,
), /FCM_DIRECT_DOCUMENT_PATH_INVALID/);

// An in-flight erasure may appear between the initial recipient check and
// HTTP send: source MUST re-read after CAS claim and all fresh owner/block
// checks, without caching this account-deletion decision across sends.
const preClaimErasureGate = source.indexOf('if (apply && !(await recipientErasureAllows(item)))');
const postClaimErasureGate = source.indexOf('if (!(await recipientErasureAllows(item)))');
const erasureReader = source.indexOf('account_deletion_requests/${uid}');
assert(erasureReader > 0, 'must read exact account deletion request by UID');
assert(preClaimErasureGate > 0 && preClaimErasureGate < claimIndex,
  'pending erasure must block before claiming a notification');
assert(postClaimErasureGate > freshGateIndex && postClaimErasureGate < sendStart,
  'pending erasure must block again after claim and before FCM HTTP');
assert.equal((source.match(/await recipientErasureAllows\(item\)/g) || []).length, 2,
  'physical send should always have preclaim and pre-send erasure gates');
assert.match(source, /FCM_PHYSICAL_FRESH_ERASURE_DENIED/);
console.log('PASS FCM deletion-request freeze: missing or rejected allows, active or ambiguous blocks, two pre-send checks');
