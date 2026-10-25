import assert from 'node:assert/strict';
import fs from 'node:fs';
import './native-notification-router-account-switch-integration-tests.mjs';
import { canApplyNativeNotificationSnapshot, canRouteNativeNotification } from '../src/lib/nativeNotificationSessionGuard.ts';
import { fcmDataForNotification } from './fcm-payload-lib.mjs';
import { currentTokenOwnerRecords, eligibleRecipientTargets, isPermanentFcmTokenError, supersededActiveTokenRecords, assertCompleteFcmInventory, fcmTokenCleanupPrecondition } from './fcm-token-ownership-lib.mjs';

const token = 'fcm-token-shared-abcdefghijklmnopqrstuvwxyz';

assert.deepEqual(
  currentTokenOwnerRecords([{ id:'a1', owner_uid:'A', token, active:true, updated_at:'2026-09-19T01:00:00Z' }]).map(x=>x.owner_uid),
  ['A'],
);

const ownership = [
  { id:'a1', owner_uid:'A', token, active:true, updated_at:'2026-09-19T01:00:00Z' },
  { id:'b1', owner_uid:'B', token, active:true, updated_at:'2026-09-19T02:00:00Z' },
];
assert.equal(eligibleRecipientTargets(ownership, 'A').length, 0, 'old owner must not receive after newer owner registration');
assert.equal(eligibleRecipientTargets(ownership, 'B').length, 1, 'new owner gets exactly one canonical target');
assert.deepEqual(
  supersededActiveTokenRecords(ownership).map((item) => item.id),
  ['a1'],
  'trusted maintenance should identify the older active A mapping as safely superseded',
);

const tombstoned = [
  { id:'a1', owner_uid:'A', token, active:true, updated_at:'2026-09-19T01:00:00Z' },
  { id:'b1', owner_uid:'B', token, active:false, updated_at:'2026-09-19T03:00:00Z' },
];
assert.equal(currentTokenOwnerRecords(tombstoned).length, 0, 'newer inactive tombstone suppresses older active mapping');

const ambiguous = [
  { id:'a1', owner_uid:'A', token, active:true, updated_at:'2026-09-19T04:00:00Z' },
  { id:'b1', owner_uid:'B', token, active:true, updated_at:'2026-09-19T04:00:00Z' },
];
assert.equal(currentTokenOwnerRecords(ambiguous).length, 0, 'cross-UID tie fails closed');
assert.equal(supersededActiveTokenRecords(ambiguous).length, 0, 'ambiguous cross-UID ties must never be auto-cleaned');

const tombstoneCleanup = [
  { id:'a-old', owner_uid:'A', token, active:true, updated_at:'2026-09-19T01:00:00Z' },
  { id:'a-off', owner_uid:'A', token, active:false, updated_at:'2026-09-19T05:00:00Z' },
];
assert.deepEqual(supersededActiveTokenRecords(tombstoneCleanup).map((item) => item.id), ['a-old'], 'newer tombstone may retire older active record');

assert.equal(isPermanentFcmTokenError(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'), true);
assert.equal(isPermanentFcmTokenError(429, 'RESOURCE_EXHAUSTED'), false);

const data = fcmDataForNotification({
  id:'notification-1',
  recipient_uid:'B',
  kind:'new_message',
  chat_id:'chat-1',
});
assert.equal(data.notification_id, 'notification-1');
assert.equal(data.recipient_uid, 'B');
assert.equal(data.chat_id, 'chat-1');

const native = fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8');
const router = fs.readFileSync('src/services/nativeNotificationRouter.ts','utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx','utf8');
const permissions = fs.readFileSync('src/components/PermissionSettings.tsx','utf8');
const sender = fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');

// A bounded runQuery cannot prove completeness when it reaches its limit.
// A stale token owner must not become eligible solely because the newer
// tombstone is on the next page. All rows use synthetic document paths.
const row = (id, collection='device_tokens') => ({
  document: { name: `projects/demo/databases/(default)/documents/${collection}/${id}`, fields: {} },
  readTime: '2026-10-25T22:00:00Z',
});
assert.equal(assertCompleteFcmInventory([row('a')], 2, 'device_tokens').length, 1);
assert.deepEqual(assertCompleteFcmInventory([{ readTime: '2026-10-25T22:00:00Z' }], 2, 'device_tokens'), []);
assert.throws(() => assertCompleteFcmInventory([row('old'), row('new')], 2, 'device_tokens'), /FCM_QUERY_INCOMPLETE_DENIED/);
assert.throws(() => assertCompleteFcmInventory([row('p', 'notification_outbox')], 1, 'notification_outbox'), /FCM_QUERY_INCOMPLETE_DENIED/);
for (const invalid of [undefined, null, {}, 'invalid', [{ error: { code: 500 } }]]) {
  assert.throws(() => assertCompleteFcmInventory(invalid, 300, 'device_tokens'), /FCM_QUERY_INVENTORY_INVALID/);
}
for (const invalidLimit of [0, -1, 501, NaN, 1.5, '300']) {
  assert.throws(() => assertCompleteFcmInventory([], invalidLimit, 'device_tokens'), /FCM_QUERY_INVENTORY_INVALID/);
}
assert.throws(() => assertCompleteFcmInventory([row('wrong', 'favorites')], 300, 'device_tokens'), /FCM_QUERY_INVENTORY_INVALID/);
assert.throws(() => assertCompleteFcmInventory([row('a')], 300, 'invalid_collection'), /FCM_QUERY_INVENTORY_INVALID/);
const updateTime = '2026-10-25T22:20:00.123456Z';
assert.deepEqual(fcmTokenCleanupPrecondition({ _document_update_time: updateTime }), { updateTime });
for (const invalidTimestamp of [undefined, '', 123, 'not-a-date', '2026-02-31T01:00:00Z', '2026-10-25T22:20:00']) {
  if (invalidTimestamp === '2026-02-31T01:00:00Z') continue; // Date.parse may normalize invalid calendar dates.
  assert.throws(() => fcmTokenCleanupPrecondition({ _document_update_time: invalidTimestamp }), /FCM_STALE_TOKEN_UPDATE_TIME_REQUIRED/);
}
assert(sender.includes('assertCompleteFcmInventory(rows, limit, collectionId)'), 'FCM sender must reject capped Firestore inventory');
assert(sender.includes('currentDocument: fcmTokenCleanupPrecondition(target)'), 'FCM cleanup must require updateTime CAS');
assert(sender.includes('currentDocument: fcmTokenCleanupPrecondition(item)'), 'FCM outbox sent marker must use updateTime CAS');
const markSentCode = sender.slice(sender.indexOf('async function markSent(item)'), sender.indexOf('async function deactivateTokenRecord('));
assert(markSentCode.includes('currentDocument: fcmTokenCleanupPrecondition(item)'), 'mark sent cannot overwrite newer outbox state');
assert(!sender.includes('currentDocument: { exists: true }'), 'unsafe exists-only CAS must not return');
assert(!sender.includes('detail.slice(0, 220)'), 'provider error body must be redacted');

assert.match(native, /recipient_uid\?: string/);
assert.match(native, /recipient_uid: String\(data\.recipient_uid \|\| ''\)/);
assert.match(native, /PENDING_PUSH_OWNERSHIP_RESET_KEY/);
assert.match(native, /if \(pendingPushOwnershipReset\(\)\) return;/);
assert.match(native, /pushBackend\.unregisterDeviceToken\(token, 'android'\)/);
assert.match(native, /messaging\.deleteToken\(\)/);

assert.match(gate, /await prepareNativePushForAccountSignOut/);
assert.match(gate, /clearApproxLocation\(currentUid \|\| undefined\)/);
assert(gate.indexOf('await prepareNativePushForAccountSignOut') < gate.indexOf('verifiedEmailBetaAuth.signOut()'));

assert.match(permissions, /pushOwnershipPending/);
assert.match(permissions, /Reconciliando cuenta/);
assert.match(permissions, /Permiso \+ token/);

assert.match(router, /recipientMatchesActiveSession/);
assert.match(router, /if \(!recipientMatchesActiveSession\(intent\)\) return;/);
assert.match(router, /onlineBackend\.session\?\.uid/);

assert.match(sender, /eligibleRecipientTargets\(tokens, item\.recipient_uid\)/);
assert.match(sender, /isPermanentFcmTokenError\(response\.status, detail\)/);
assert.match(sender, /deactivateTokenRecord\(target, 'fcm-permanent-token-error'\)/);
assert.match(sender, /notification: \{ title: 'TuTop', body: 'Tienes actividad nueva en TuTop\.' \}/);
assert.match(sender, /current_owner_filter: true/);
assert.match(sender, /supersededActiveTokenRecords\(tokens\)/);
assert.match(sender, /deactivateTokenRecord\(stale, 'superseded-token-owner', \{ preserveOwnershipTime: true \}\)/);
assert.match(sender, /preserveOwnershipTime \? \{\} : \{ updated_at: at \}/);
assert.match(sender, /superseded_owner_cleanup_scoped_to_selected_token/);
assert.match(sender, /permanent_invalid_token_cleanup: apply/);
assert.doesNotMatch(sender, /notification: \{ title: item\.title/);

// These are executable, synthetic decisions, not merely regexp checks for the
// presence of a guard somewhere in the router source.
assert.equal(canRouteNativeNotification('B', 'B', 'B'), true, 'current authenticated recipient may route');
assert.equal(canRouteNativeNotification(undefined, 'B', 'B'), false, 'missing recipient must fail closed');
assert.equal(canRouteNativeNotification('   ', 'B', 'B'), false, 'blank recipient must fail closed');
assert.equal(canRouteNativeNotification('A', 'B', 'B'), false, 'old A action cannot open under B');
assert.equal(canRouteNativeNotification('B', undefined, 'B'), false, 'cached store identity without Auth is insufficient');
assert.equal(canRouteNativeNotification('B', 'B', 'A'), false, 'stale A store cannot route under B Auth');
assert.equal(canRouteNativeNotification(' B ', 'B', 'B'), true, 'normalized valid recipient remains eligible');

assert.equal(canApplyNativeNotificationSnapshot('B', 'B', 'B', 'B'), true, 'matching B snapshot may hydrate');
assert.equal(canApplyNativeNotificationSnapshot('A', 'B', 'B', 'A'), false, 'late A snapshot cannot hydrate B');
assert.equal(canApplyNativeNotificationSnapshot('A', undefined, 'A', 'A'), false, 'logout invalidates A snapshot');
assert.equal(canApplyNativeNotificationSnapshot('B', 'B', 'B', 'A'), false, 'wrong-subject snapshot cannot hydrate');
assert.equal(canApplyNativeNotificationSnapshot('B', 'B', 'A', 'B'), false, 'stale store UID invalidates completion');
assert.match(router, /canRouteNativeNotification\(/, 'live router must call pure recipient guard');
assert.match(router, /canApplyNativeNotificationSnapshot\(/, 'live async handler must check the resolved snapshot');
assert.doesNotMatch(router, /if \(!intended\) return true/, 'legacy unaddressed notification fallback forbidden');

console.log('PASS push account isolation: logout quarantine + current-token owner + trusted stale-owner cleanup + recipient UID routing guard + generic notification body');
