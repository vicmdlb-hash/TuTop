import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';
import './native-notification-router-account-switch-integration-tests.mjs';
import { canApplyNativeNotificationSnapshot, canRouteNativeNotification } from '../src/lib/nativeNotificationSessionGuard.ts';
import { isCurrentPushSession } from '../src/lib/pushBackendSessionWitness.ts';
import { planNativePushCleanup, validPushCleanupVersion } from '../src/lib/nativePushCleanupLedger.ts';
import * as pushTokenCreateFirst from '../src/lib/pushTokenCreateFirst.ts';
import { fcmDataForNotification } from './fcm-payload-lib.mjs';
import { currentTokenOwnerRecords, eligibleRecipientTargets, isPermanentFcmTokenError, supersededActiveTokenRecords, assertCompleteFcmInventory, fcmTokenCleanupPrecondition } from './fcm-token-ownership-lib.mjs';

// Exercise the real receipt-store bridge with a synthetic Zustand and backend.
// Unknown IDs from stale A events must not trigger a write on active B.
const bridgeFixtureJs = compileTypescriptFixture('src/services/notificationReceiptStoreBridge.ts');
function receiptBridgeFixture(notifications) {
  const events = [];
  const state = {
    notifications,
    markChatRead: (id) => events.push('chat:' + id),
  };
  const store = {
    getState: () => state,
    setState: (updater) => Object.assign(state,
      typeof updater === 'function' ? updater(state) : updater),
  };
  const backend = {
    markNotificationRead: async (id) => { events.push('remote:' + id); },
    markAllNotificationsRead: async (ids) => { events.push('remote-batch:' + ids.join(',')); },
  };
  const imports = {
    '../store/useAppStore': { useAppStore: store },
    './nationalBackend': { nationalSchemaEnabled: () => true },
    './pushBackend': { pushBackend: backend },
  };
  const module = { exports: {} };
  vm.runInNewContext(bridgeFixtureJs, {
    module, exports: module.exports, console: { warn: () => events.push('masked-error') },
    require: (id) => {
      if (!Object.prototype.hasOwnProperty.call(imports, id)) {
        throw new Error('Unexpected receipt bridge fixture dependency: ' + id);
      }
      return imports[id];
    },
  }, { timeout: 1500 });
  return { state, events };
}
{
  const f = receiptBridgeFixture([
    { id: 'B-notice', kind: 'message', chat_id: 'B-chat', read: false },
  ]);
  f.state.markNotificationRead('A-stale-notice');
  assert.deepEqual(f.events, [], 'unknown A notification must not call B backend');
  assert.equal(f.state.notifications[0].read, false, 'unknown id must not alter B state');
  f.state.markNotificationRead('B-notice');
  assert.deepEqual(f.events, ['chat:B-chat', 'remote:B-notice']);
  assert.equal(f.state.notifications[0].read, true);
  f.state.markAllNotificationsRead();
  assert.deepEqual(f.events, ['chat:B-chat', 'remote:B-notice'],
    'already-read batch must not emit any empty remote receipt');
}
{
  const f = receiptBridgeFixture([
    { id: 'n1', kind: 'system', read: false },
    { id: 'n2', kind: 'message', chat_id: 'owner-chat', read: false },
  ]);
  f.state.markAllNotificationsRead();
  assert.deepEqual(f.events, ['chat:owner-chat', 'remote-batch:n1,n2'],
    'known unread batch keeps owner-scoped receipt functionality');
  assert(f.state.notifications.every(item => item.read === true));
}
// Synthetic proof of post-await session isolation, no real credentials.
const witness={uid:'A',refreshToken:'synthetic-token-A1'};
assert.equal(isCurrentPushSession(witness,{...witness},{...witness}),true);
assert.equal(isCurrentPushSession(witness,{...witness},{uid:'B',refreshToken:'synthetic-token-B1'}),false);
assert.equal(isCurrentPushSession(witness,{...witness},{uid:'A',refreshToken:'synthetic-token-A2'}),false);
assert.equal(isCurrentPushSession(witness,{uid:'A',refreshToken:'synthetic-token-A2'},witness),false);
for(const missing of [null,{}, {uid:'A'}, {uid:'A',refreshToken:''}])
  assert.equal(isCurrentPushSession(witness,missing,witness),false);
const backendSource=fs.readFileSync('src/services/pushBackend.ts','utf8').replace(/\r\n/g,'\n');

// Execute the real pushBackend batch code against a synthetic session.
// A->B or same-UID refresh-token rotation after the first receipt must
// prevent ALL subsequent receipts, even though each per-item call would
// otherwise create a fresh Firebase client under the new account.
{
  const code = compileTypescriptFixture('src/services/pushBackend.ts');
  const fakeModule = { exports: {} };
  let canonical = { uid:'A', refreshToken:'a-r1' };
  let switchDuringWrite = false;
  let failReceiptQuery = false;
  let switchOnReceiptFailure = false;
  const actualReceiptWrites = [];
  const deviceWrites = [];
  const version = '2026-11-26T23:00:00.123456Z';
  let deviceVersion = version;
  let deviceEvents = [];
  let missingDeviceVersion = false;
  class FakeFirebaseClient {
    get currentSession() { return canonical; }
    readStoredSession() { return canonical; }
    async getDocument(path) {
      return path.startsWith('notification_outbox/')
        ? { data:{recipient_uid:'A'} } : null;
    }
    async runQuery(collection) {
      if (collection === 'notification_outbox') return [{
        id: 'trusted-notice', data: { kind:'new_message', recipient_uid:'A', title:'TuTop',
          body:'synthetic', created_at:'2026-11-17T08:00:00Z' },
      }];
      if (collection === 'notification_receipts') {
        if (switchOnReceiptFailure) {
          canonical = { uid:'B', refreshToken:'b-r2' };
          throw new Error('synthetic-stale-session-remote-body');
        }
        if (failReceiptQuery) throw new Error('synthetic-secret-remote-error');
        return [{ id:'receipt1', data:{notification_id:'trusted-notice',read_at:'2026-11-17T08:01:00Z'} }];
      }
      return [];
    }
    async setDocument(path, payload, options) {
      if (path.startsWith('device_tokens/')) {
        deviceEvents.push('write');
        deviceWrites.push({ path, payload, options });
        if (options?.updateTime && options.updateTime !== deviceVersion) throw Error('FAILED_PRECONDITION');
        return missingDeviceVersion ? {} : { updateTime: deviceVersion };
      }
      if (path.startsWith('notification_receipts/')) actualReceiptWrites.push({ path, payload });
      if (switchDuringWrite) canonical = { uid:'B', refreshToken:'b-r2' };
    }
  }
  const imports = {
    '../lib/notificationProjection': { appNotificationKindFromOutbox: () => 'system' },
    '../lib/pushBackendSessionWitness': { isCurrentPushSession },
    '../lib/nativePushCleanupLedger': { planNativePushCleanup, validPushCleanupVersion },
    '../lib/pushTokenCreateFirst': pushTokenCreateFirst,
    './firebaseRest': { FirebaseRestClient: FakeFirebaseClient },
    './nationalBackend': { nationalSchemaEnabled: () => true },
    './runtimeConfig': { getFirebaseConfig: () => ({}) },
  };
  vm.runInNewContext(code, {
    module: fakeModule, exports: fakeModule.exports,
    require: (key) => {
      if (!Object.hasOwn(imports,key)) throw Error('unexpected push module import');
      return imports[key];
    },
    Date, Set, Map, Promise, Number, String, console,
  }, { timeout: 2500 });
  const backend = fakeModule.exports.pushBackend;
  assert.equal(typeof backend.markAllNotificationsRead,'function');

  const sent = [];
  backend.markNotificationRead = async (id) => { sent.push(id); };
  await backend.markAllNotificationsRead(['one','one','two']);
  assert.deepEqual(sent,['one','two'],'same-session batch remains usable with deduplication');

  for (const changed of [
    { uid:'B',refreshToken:'b-r2' },
    { uid:'A',refreshToken:'a-r2' },
  ]) {
    canonical = { uid:'A',refreshToken:'a-r1' };
    const calls = [];
    backend.markNotificationRead = async (id) => {
      calls.push(id);
      if (id==='first') canonical=changed;
    };
    await assert.rejects(backend.markAllNotificationsRead(['first','second']),
      /PUSH_OWNER_SESSION_CHANGED/);
    assert.deepEqual(calls,['first'],
      'batch must not invoke next receipt after account or token rotation');
  }

  canonical = { uid:'A',refreshToken:'a-r1' };
  switchDuringWrite = true;
  // Use the production per-item method, not the instrumented batch stub.
  const newModule = { exports: {} };
  vm.runInNewContext(code, {
    module: newModule, exports: newModule.exports,
    require: (key) => imports[key],
    Date, Set, Map, Promise, Number, String, TextEncoder, console, crypto: webcrypto,
  }, { timeout: 2500 });
  await assert.rejects(newModule.exports.pushBackend.markNotificationRead('A-notice'),
    /PUSH_OWNER_SESSION_CHANGED/,
    'successful remote write must not claim completion after logout');
  switchDuringWrite = false;

  canonical = { uid:'A',refreshToken:'a-r1' };
  actualReceiptWrites.length = 0;
  await newModule.exports.pushBackend.markNotificationRead('short');
  assert.equal(actualReceiptWrites[0].path, 'notification_receipts/A-short',
    'short receipt IDs must retain their historical document IDs');

  actualReceiptWrites.length = 0;
  const sharedPrefix = 'same-' + 'x'.repeat(270);
  const longFirst = sharedPrefix + '-first';
  const longSecond = sharedPrefix + '-second';
  await newModule.exports.pushBackend.markNotificationRead(longFirst);
  await newModule.exports.pushBackend.markNotificationRead(longSecond);
  assert.equal(actualReceiptWrites.length, 2);
  assert.notEqual(actualReceiptWrites[0].path, actualReceiptWrites[1].path,
    'two notification IDs with the same initial 240 characters must never share a receipt');
  for (const [index, expected] of [longFirst, longSecond].entries()) {
    assert(actualReceiptWrites[index].path.startsWith('notification_receipts/A-sha256-'));
    assert(actualReceiptWrites[index].path.length < 240);
    assert.equal(actualReceiptWrites[index].payload.notification_id, expected,
      'receipt retains exact original notification ID for read-state reconciliation');
  }

  // A receipts fetch failure must not fabricate an all-unread snapshot.
  // Exercise the actual production function using synthetic Firestore results.
  let notices = await newModule.exports.pushBackend.loadTrustedNotifications();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, 'trusted-notice');
  assert.equal(notices[0].read, true, 'successfully fetched receipts preserve read state');
  failReceiptQuery = true;
  await assert.rejects(newModule.exports.pushBackend.loadTrustedNotifications(),
    /NOTIFICATION_RECEIPTS_UNAVAILABLE/,
    'remote receipts failure must reject rather than invent unread state');
  failReceiptQuery = false;
  switchOnReceiptFailure = true;
  await assert.rejects(newModule.exports.pushBackend.loadTrustedNotifications(),
    /PUSH_OWNER_SESSION_CHANGED/,
    'a receipt query that outlives account A must still fail as changed owner');
  switchOnReceiptFailure = false;
  canonical = { uid:'synthetic-A',refreshToken:'synthetic-session' };
  const deviceBackend = newModule.exports.pushBackend;
  const token = 'synthetic-fcm-token-abcdefghijklmnopqrstuvwxyz';
  const hooks = {
    beforeWrite: () => deviceEvents.push('intent'),
    confirmed: (_id, receipt) => { assert.equal(receipt, version); deviceEvents.push('receipt'); },
  };
  const id = await deviceBackend.registerDeviceToken(token, 'android', '0.9.2-beta.0', () => true, hooks);
  assert.deepEqual(deviceEvents,['intent','write','receipt']);
  const receipt = { id, attempt:'attempt_01', updateTime:version };
  await deviceBackend.deactivateConfirmedNativeRecord(receipt, () => true);
  assert.equal(deviceWrites.at(-1).options.updateTime,version);
  assert.equal(deviceWrites.at(-1).options.exists,undefined);
  assert.equal(deviceWrites.at(-1).payload.active,false);
  deviceVersion='2026-11-26T23:01:00Z';
  await assert.rejects(deviceBackend.deactivateConfirmedNativeRecord(receipt, () => true),/FAILED_PRECONDITION/);
  const writesAfterConflict=deviceWrites.length;
  await assert.rejects(deviceBackend.deactivateConfirmedNativeRecord(receipt, () => false),/PUSH_OWNER_SESSION_CHANGED/);
  await assert.rejects(deviceBackend.deactivateConfirmedNativeRecord({...receipt,updateTime:null}, () => true),/RECEIPT_INVALID/);
  canonical={uid:'synthetic-B',refreshToken:'synthetic-session-B'};
  await assert.rejects(deviceBackend.deactivateConfirmedNativeRecord(receipt, () => true),/RECEIPT_INVALID/);
  assert.equal(deviceWrites.length,writesAfterConflict,'stale owner, action, or receipt cannot write');
  canonical={uid:'synthetic-A',refreshToken:'synthetic-session'};
  missingDeviceVersion=true;
  deviceEvents=[];
  await deviceBackend.registerDeviceToken(token,'android','0.9.2-beta.0',()=>true,hooks);
  assert.deepEqual(deviceEvents,['intent','write'],'unknown response must not synthesize a receipt');
  console.log('PASS actual pushBackend synthetic exact-version cleanup and receipt ordering');
}

const notificationRead=backendSource.slice(backendSource.indexOf('async loadTrustedNotifications('),backendSource.indexOf('async markNotificationRead('));
assert(notificationRead.includes('assertOwner(); // Reject A'));
assert(notificationRead.indexOf('assertOwner(); // Reject A') > notificationRead.indexOf('await Promise.all(['));
const receiptWrite=backendSource.slice(backendSource.indexOf('async markNotificationRead('),backendSource.indexOf('async markAllNotificationsRead('));
assert(receiptWrite.includes('assertOwner();\n    const payload'));
const unregister=backendSource.slice(backendSource.indexOf('async unregisterDeviceToken('),backendSource.indexOf('async loadTrustedNotifications('));
assert(!unregister.includes('getDocument(`device_tokens/${id}`)'),
  'logout must not pre-GET a missing token under strict owner-only Rules');
assert(unregister.includes('{ merge: true, exists: true }'),
  'logout must use an exists-only update so it cannot create a token document');
assert(unregister.includes('await client.setDocument('),
  'logout requires an acknowledged server write before reporting success');
assert(unregister.includes('    assertOwner();\n  },'),
  'logout must recheck owner after the server write');
assert(!unregister.includes('catch'),
  'logout must not silently treat denied or missing writes as server deactivation');
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

 
// A missing/malformed owner in any record of a token's history must not be
// silently filtered out. Otherwise a tied legitimate owner could win without
// proof and earlier active mappings could be accidentally deactivated.
for (const badOwner of [undefined, null, '', ' ', ' B ', 17, { uid: 'B' }]) {
  const conflicted = [
    { id:'a1', owner_uid:'A', token, active:true, updated_at:'2026-09-19T04:00:00Z' },
    { id:'broken-owner', owner_uid:badOwner, token, active:true, updated_at:'2026-09-19T04:00:00Z' },
  ];
  assert.deepEqual(eligibleRecipientTargets(conflicted, 'A'), [],
    'malformed tied owner must not select a recipient');
  assert.deepEqual(supersededActiveTokenRecords(conflicted), [],
    'malformed owner must not enable destructive token cleanup');
}
for (const badId of [undefined, '', null, 23]) {
  const conflicted = [
    { id:'a1', owner_uid:'A', token, active:true, updated_at:'2026-09-19T03:00:00Z' },
    { id:badId, owner_uid:'B', token, active:true, updated_at:'2026-09-19T04:00:00Z' },
  ];
  assert.deepEqual(eligibleRecipientTargets(conflicted, 'B'), [],
    'target with unknown record id must not receive');
  assert.deepEqual(supersededActiveTokenRecords(conflicted), [],
    'unknown record id must not drive cleanup');
}


const tombstoneCleanup = [
  { id:'a-old', owner_uid:'A', token, active:true, updated_at:'2026-09-19T01:00:00Z' },
  { id:'a-off', owner_uid:'A', token, active:false, updated_at:'2026-09-19T05:00:00Z' },
];
assert.deepEqual(supersededActiveTokenRecords(tombstoneCleanup).map((item) => item.id), ['a-old'], 'newer tombstone may retire older active record');

assert.equal(isPermanentFcmTokenError(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'), true);
assert.equal(isPermanentFcmTokenError(429, 'RESOURCE_EXHAUSTED'), false);

for (const [code, body] of [
  [404, 'NOT_FOUND'],
  [404, '{"error":{"status":"NOT_FOUND","message":"Requested project was not found"}}'],
  [404, 'registration token lookup service unavailable'],
  [400, '{"error":{"status":"INVALID_ARGUMENT","message":"project identifier invalid"}}'],
  [400, 'INVALID_ARGUMENT registration service'],
  [404, 'UNREGISTERED in unrelated response text'],
  [403, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}'],
]) {
  assert.equal(isPermanentFcmTokenError(code, body), false,
    'ambiguous HTTP errors cannot retire FCM owner records');
}
assert.equal(isPermanentFcmTokenError(404,
  '{"error":{"status":"NOT_FOUND","details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"UNREGISTERED"}]}}'), true);


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
assert(sender.includes('const claimed = await claimPending(item);'), 'FCM must CAS-claim the pending outbox before external send');
assert(sender.includes('currentDocument: planned.precondition'), 'FCM outbox claim/completion require updateTime CAS');
const claimCode = sender.slice(sender.indexOf('async function claimPending(item)'), sender.indexOf('async function markSent(claimed)'));
const markSentCode = sender.slice(sender.indexOf('async function markSent(claimed)'), sender.indexOf('async function deactivateTokenRecord('));
assert(claimCode.includes('planFcmOutboxClaim(item, new Date().toISOString())'), 'claim must verify pending state');
assert(claimCode.includes('attachCommittedFcmClaim(item, planned, committed)'), 'send must require Firestore claim commit receipt');
assert(markSentCode.includes('planFcmOutboxCompletion(claimed, new Date().toISOString())'), 'mark sent must use claimed version');
assert(markSentCode.includes('currentDocument: planned.precondition'), 'mark sent cannot overwrite newer outbox state');
assert(sender.indexOf('const claimed = await claimPending(item);') < sender.indexOf('messages:send'), 'claim must precede FCM send');
assert(!sender.includes('currentDocument: { exists: true }'), 'unsafe exists-only CAS must not return');
assert(!sender.includes('detail.slice(0, 220)'), 'provider error body must be redacted');

assert.match(native, /recipient_uid\?: string/);
assert.match(native, /recipient_uid: String\(data\.recipient_uid \|\| ''\)/);
assert.match(native, /PENDING_PUSH_OWNERSHIP_RESET_KEY/);
assert.match(native, /if \(pendingPushOwnershipReset\(\) \|\| nativePushOptedOut\(\)\) return;/,
  'stale FCM events must be blocked by pending owner reset OR user opt-out');
assert.match(native, /pushBackend\.deactivateConfirmedNativeRecord\(entry, isCurrent\)/);
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


// R278/R279: execute the actual opt-in body with the real session matcher
// and synthetic native prerequisites; no Android plugin or Firebase access.
const { matchesNativePushSession } = await import('../src/lib/nativePushSessionGuard.ts');
const enableSource = native.slice(native.indexOf('export async function enableNativePushNotifications()'),
  native.indexOf('export async function disableNativePushNotifications()'))
  .replace('export async','async').replaceAll(' as PushPermission','').replaceAll(' as PushRegistrationReason','');
assert(!enableSource.includes('await initializeNativeFirebaseSecurity()'));
for (const scenario of ['normal','quarantine-recovered','quarantine-persisted','app-check','listeners','permission','prompt','reconcile','sync','same-uid-relogin','prompt-rejection-switch','epoch-change','denied','already-granted']) {
  let owner='A', generation=1, refreshToken='synthetic-A', pending=scenario.startsWith('quarantine');
  let bumpEpoch, calls=[], prompts=0;
  const change=point=>{
    if(scenario===point){owner='B';generation++;refreshToken='synthetic-B';}
    if(scenario==='same-uid-relogin'&&point==='prompt'){generation++;refreshToken='synthetic-A2';}
    if(scenario==='epoch-change'&&point==='prompt')bumpEpoch();
  };
  const deps={
    isNativeFirebaseRuntime:()=>true,
    capacitorPlugin:()=>({getToken:()=>assert.fail('direct token access forbidden'),requestPermissions:async()=>{
      prompts++;change('prompt');
      if(scenario==='prompt-rejection-switch'){owner='B';generation++;refreshToken='synthetic-B';throw Error('synthetic');}
      return {receive:scenario==='denied'?'denied':'granted'};
    }}),
    verifiedEmailBetaAuth:{readSessionIdentity:()=>({uid:owner,refreshToken}),sessionGeneration:()=>generation},
    setNativePushOptOut:()=>true,
    initializeNativeAppCheck:async()=>{change('app-check');},
    installMessagingListeners:async()=>{change('listeners');},
    installPushOwnershipRetryListener:()=>{},
    nativePushPermission:async()=>{change('permission');return scenario==='already-granted'?'granted':'prompt';},
    reconcilePendingPushOwnershipReset:async()=>{change('reconcile');if(scenario==='quarantine-recovered')pending=false;return {pending};},
    syncGrantedPushTokenHealth:async witness=>{assert.equal(witness.uid,'A');assert(!pending);calls.push(owner);change('sync');return {registered:true,reason:'registered'};},
    matchesNativePushSession, classifyPushFailure:()=> 'token-registration-failed',
    pendingPushOwnershipReset:()=>pending, bindEpoch:fn=>{bumpEpoch=fn;},
  };
  const result=await new Function(...Object.keys(deps),
    'let pushRegistrationEpoch=0;bindEpoch(()=>pushRegistrationEpoch++);'+
    'const isCurrentPushSession=w=>matchesNativePushSession(w,verifiedEmailBetaAuth.readSessionIdentity(),verifiedEmailBetaAuth.sessionGeneration(),pushRegistrationEpoch,pendingPushOwnershipReset());\n'+
    enableSource+'\nreturn enableNativePushNotifications();')(...Object.values(deps));
  const success=['normal','quarantine-recovered','already-granted'].includes(scenario);
  assert.equal(result.enabled,success,scenario);
  assert(!calls.includes('B'),scenario);
  assert.equal(calls.length,success||scenario==='sync'?1:0,scenario);
  if(scenario==='already-granted')assert.equal(prompts,0);
}
console.log('PASS synthetic explicit FCM opt-in original session and quarantine fences (14 cases)');


// R254/R282: exercise the real process-local serialization primitive.
const { createNativePushOperationQueue } = await import('../src/lib/nativePushSessionGuard.ts');
{
  const queue=createNativePushOperationQueue(), order=[];
  let release, started;
  const startedPromise=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const first=queue(()=>true,async()=>{order.push('delete-A-start');started();await gate;order.push('delete-A-end');});
  await startedPromise;
  const observed=await Promise.race([first.then(()=>true),Promise.resolve(false)]);
  assert.equal(observed,false,'observer timeout must not release actual native lock');
  const stale=queue(()=>false,async()=>{assert.fail('stale queued operation executed');});
  const staleRejected=assert.rejects(stale,/PUSH_OWNER_SESSION_CHANGED/);
  const second=queue(()=>true,async()=>{order.push('get-B');return 'B';});
  await Promise.resolve();assert.deepEqual(order,['delete-A-start']);
  release();await first;await staleRejected;assert.equal(await second,'B');
  assert.deepEqual(order,['delete-A-start','delete-A-end','get-B']);
  await assert.rejects(queue(()=>true,async()=>{throw Error('synthetic failure');}),/synthetic failure/);
  assert.equal(await queue(()=>true,async()=>42),42,'failed operation does not poison queue');
}
const signoutSource=native.slice(native.indexOf('export async function prepareNativePushForAccountSignOut()'))
  .replace('export async','async').replace('null as any','null');
for(const scenario of ['normal','switch-before-retire','switch-during-retire','same-uid-relogin','no-receipt','delete-failure','no-owner']){
  let owner=scenario==='no-owner'?null:'A',generation=1,refreshToken='synthetic-A',pending=false;
  const calls=[];
  const change=()=>{owner='B';generation++;refreshToken='synthetic-B';};
  const deps={
    isNativeFirebaseRuntime:()=>true,
    setPendingPushOwnershipReset:value=>{pending=value;return true;},
    pendingPushOwnershipReset:()=>pending,
    capacitorPlugin:()=>({getToken:()=>assert.fail('sign-out must not obtain a token'),
      deleteToken:async()=>{calls.push('delete:'+owner);if(scenario==='delete-failure')throw Error('synthetic');}}),
    retireNativePushReceipts:async(uid,guard)=>{
      if(scenario==='switch-before-retire')change();
      if(scenario==='same-uid-relogin'){generation++;refreshToken='synthetic-A2';}
      if(!guard())return false;
      calls.push('retire:'+owner);
      if(scenario==='switch-during-retire')change();
      return scenario!=='no-receipt' && guard();
    },
    bounded:async(p,_ms,fallback)=>{try{return await p;}catch{return fallback;}},
    needsNativePushOwnershipReset:tokenDeleted=>!tokenDeleted,
    verifiedEmailBetaAuth:{readSessionIdentity:()=>owner?{uid:owner,refreshToken}:null,sessionGeneration:()=>generation},
    matchesNativePushSession,queueNativePushOperation:createNativePushOperationQueue(),
  };
  const result=await new Function(...Object.keys(deps),
    'let pushRegistrationEpoch=0,initialization=null;\n'+signoutSource+'\nreturn prepareNativePushForAccountSignOut();')(...Object.values(deps));
  assert(!calls.some(x=>/^(delete|retire):(B|null)$/.test(x)),scenario);
  if(scenario==='same-uid-relogin')assert.deepEqual(calls,[]);
  const queued=!['normal','no-receipt'].includes(scenario);
  assert.equal(result.ownershipResetQueued,queued,scenario);
  assert.equal(pending,queued,scenario);
}
assert.equal((native.match(/queueNativePushOperation\(/g)||[]).length,4,'all four remaining native get/delete operations must use shared queue');
assert(!signoutSource.includes('messaging.getToken('),'signout must not mint or obtain a native token');
console.log('PASS synthetic native FCM queue and sign-out owner fences (7 sign-out cases)');
