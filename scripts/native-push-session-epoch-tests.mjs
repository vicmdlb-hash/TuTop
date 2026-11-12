import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { matchesNativePushSession, needsNativePushOwnershipReset, nativePushReconciliationStillPending } from '../src/lib/nativePushSessionGuard.ts';
import { isNativePushOptedOut, setNativePushOptOut, NATIVE_PUSH_OPT_OUT_PREFIX } from '../src/lib/nativePushOptOut.ts';
import { createFirstPushTokenDocument, normalizePushTokenIdentity, normalizePushAppVersion } from '../src/lib/pushTokenCreateFirst.ts';
const A={uid:'synthetic-A',refreshToken:'synthetic-session-A',generation:3,epoch:7};
const same={uid:A.uid,refreshToken:A.refreshToken};
assert.equal(matchesNativePushSession(A,same,3,7,false),true);
for(const [identity,generation,epoch,pending] of [
  [null,3,7,false], [{uid:'synthetic-B',refreshToken:'other'},3,7,false],
  [same,4,7,false], [same,3,8,false], [same,3,7,true],
  [{uid:'synthetic-A',refreshToken:'rotated'},3,7,false],
]) assert.equal(matchesNativePushSession(A,identity,generation,epoch,pending),false);
assert.equal(matchesNativePushSession(null,same,3,7,false),false);
// Native deleteToken is the decisive ownership boundary, regardless of server cleanup.
assert.equal(needsNativePushOwnershipReset(false), true, 'native deletion failure requires reset even when server unregister succeeded');
assert.equal(needsNativePushOwnershipReset(true), false, 'successful native deletion need not quarantine a new account');
for (const [deleted, cleared, pending] of [
  [false, false, true],
  [false, true, true],
  [true, false, true],
  [true, true, false],
]) assert.equal(nativePushReconciliationStillPending(deleted, cleared), pending,
  'native reset state requires BOTH token deletion and persistent quarantine removal');
const native=fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8').replace(/\r\n/g, '\n');
const backend=fs.readFileSync('src/services/pushBackend.ts','utf8').replace(/\r\n/g, '\n');
const callback=native.slice(native.indexOf("await messaging.addListener('tokenReceived'"),native.indexOf("await messaging.addListener('notificationReceived'"));
assert(callback.includes('const witness = currentPushSessionWitness();'));
assert(callback.includes('syncGrantedPushTokenHealth(witness)'));
assert(!callback.includes('registerToken(token)'),'cannot bind stale event token');
const sync=native.slice(native.indexOf('async function syncGrantedPushTokenHealth('),native.indexOf('async function syncGrantedPushToken()'));
assert(sync.includes('await messaging.getToken()'));
assert(sync.includes('if (!isCurrentPushSession(witness)) return denied;'));
assert(sync.includes('await registerToken(token, witness);'));
assert(
  /pushRegistrationEpoch \+= 1;\r?\n\s*initialization = null;/.test(native),
  'sign-out preparation must revoke the push epoch before clearing initialization',
);
const signout = native.slice(native.indexOf('export async function prepareNativePushForAccountSignOut()'));
assert(signout.includes('needsNativePushOwnershipReset(tokenDeleted)'),
  'signout must quarantine native token failures independent of serverDeactivated');
assert(!signout.includes('!serverDeactivated && !tokenDeleted'),
  'server unregister alone must never bypass pending native token reset');
const reconcileReset = native.slice(native.indexOf('async function reconcilePendingPushOwnershipReset()'),
  native.indexOf('export async function initializeNativeFirebaseSecurity()'));
assert(reconcileReset.includes('const resetCleared = tokenDeleted ? setPendingPushOwnershipReset(false) : false;'),
  'native token cleanup must confirm the persistent marker was cleared');
assert(reconcileReset.includes('nativePushReconciliationStillPending(tokenDeleted, resetCleared) || pendingPushOwnershipReset()'),
  'reported pending state must fail closed if persistence or marker readback fails');
assert(!reconcileReset.includes('return { pending: !tokenDeleted, tokenDeleted }'),
  'native deleteToken success must no longer imply reconciliation success');
const register=backend.slice(backend.indexOf('async registerDeviceToken('),backend.indexOf('async unregisterDeviceToken('));
assert(register.includes('const assertOwner = () => {'));
assert(register.includes('const tokenHash = await sha256(cleanToken);\n    assertOwner();'));
assert(register.includes('await createFirstPushTokenDocument('), 'push registration must use create-first helper');
assert(!register.includes('getDocument(`device_tokens/${id}`)'),
  'push registration must not pre-GET a missing token doc under strict rules');

const syntheticRecord = {
  owner_uid: 'synthetic-A',
  token: 'synthetic-fcm-token-abcdefghijklmnopqrstuvwxyz',
  platform: 'android',
  app_version: '0.9.2-beta.0',
  active: true,
  created_at: '2026-11-07T00:00:00.000Z',
  updated_at: '2026-11-07T00:00:00.000Z',
};
const createdWrites = [];
const created = await createFirstPushTokenDocument(
  async (payload, options) => { createdWrites.push({ payload, options }); },
  syntheticRecord, () => {},
);
assert.equal(created, 'created');
assert.equal(createdWrites.length, 1, 'registration must not pre-GET or need another write on new document');
assert.deepEqual(createdWrites[0].options, { exists: false });
assert.equal(createdWrites[0].payload.created_at, syntheticRecord.created_at);

const existsError = Object.assign(new Error('document exists'), {
  status: 409, payload: { error: { status: 'ALREADY_EXISTS' } },
});
const existingWrites = [];
const updated = await createFirstPushTokenDocument(
  async (payload, options) => {
    existingWrites.push({ payload, options });
    if (existingWrites.length === 1) throw existsError;
  }, syntheticRecord, () => {},
);
assert.equal(updated, 'updated');
assert.equal(existingWrites.length, 2);
assert.deepEqual(existingWrites[0].options, { exists: false });
assert.deepEqual(existingWrites[1].options, { merge: true, exists: true });
assert.equal('created_at' in existingWrites[1].payload, false, 'rebind must preserve original created_at');
assert.equal(existingWrites[1].payload.owner_uid, syntheticRecord.owner_uid);

for (const rejected of [
  Object.assign(new Error('denied'), { status: 403, payload: { error: { status: 'PERMISSION_DENIED' } } }),
  Object.assign(new Error('conflict'), { status: 409, payload: { error: { status: 'ABORTED' } } }),
  new Error('ALREADY_EXISTS'),
]) {
  let writes = 0;
  await assert.rejects(createFirstPushTokenDocument(async () => { writes += 1; throw rejected; },
    syntheticRecord, () => {}), (error) => error === rejected);
  assert.equal(writes, 1, 'any non-ALREADY_EXISTS failure must never trigger an update');
}
let ownerStillCurrent = true;
let attemptedWrites = 0;
await assert.rejects(createFirstPushTokenDocument(
  async () => { attemptedWrites += 1; ownerStillCurrent = false; throw existsError; },
  syntheticRecord,
  () => { if (!ownerStillCurrent) throw new Error('PUSH_OWNER_SESSION_CHANGED'); },
), /PUSH_OWNER_SESSION_CHANGED/);
assert.equal(attemptedWrites, 1, 'stale A must never update an existing record after B login');


// Runtime native callbacks can bypass TS annotations: reject invalid token,
// platform and appVersion before building Firestore keys or creating writes.
assert.deepEqual(normalizePushTokenIdentity(
  '  synthetic-fcm-token-abcdefghijklmnopqrstuvwxyz  ', 'android',
), { token: 'synthetic-fcm-token-abcdefghijklmnopqrstuvwxyz', platform: 'android' });
for (const badToken of [null, {}, [], false, 7, '', 'short', 'x'.repeat(4097)]) {
  assert.throws(() => normalizePushTokenIdentity(badToken, 'android'), /INVALID_PUSH_TOKEN/);
}
for (const badPlatform of ['android/../admin', 'Android', 'bluetooth', 1, {}, null, '']) {
  assert.throws(() => normalizePushTokenIdentity(syntheticRecord.token, badPlatform),
    /INVALID_PUSH_PLATFORM/);
}
assert.equal(normalizePushAppVersion('  0.9.2-beta.0  '), '0.9.2-beta.0');
for (const badVersion of [null, undefined, {}, [], 1, '', '   ', '\u0000private', 'x'.repeat(129)]) {
  assert.throws(() => normalizePushAppVersion(badVersion), /INVALID_PUSH_APP_VERSION/);
}
assert(register.includes('normalizePushTokenIdentity(token, platform)'),
  'push register must use runtime validation before hashing/writing');
assert(register.includes('normalizePushAppVersion(appVersion)'),
  'push register must reject malformed app versions');
const unregister=backend.slice(backend.indexOf('async unregisterDeviceToken('),
  backend.indexOf('async loadTrustedNotifications('));
assert(unregister.includes('normalizePushTokenIdentity(token, platform)'),
  'unregister must validate the same token identity before constructing a document ID');

// Synthetic localStorage only, no real tokens/accounts/devices.
const pushMarkers = new Map();
const pushStorage = {
  getItem: (key) => pushMarkers.get(key) ?? null,
  setItem: (key, value) => { pushMarkers.set(key, value); },
  removeItem: (key) => { pushMarkers.delete(key); },
};
assert.equal(isNativePushOptedOut('synthetic-A', pushStorage), false);
assert.equal(setNativePushOptOut('synthetic-A', true, pushStorage), true);
assert.equal(pushMarkers.get(NATIVE_PUSH_OPT_OUT_PREFIX + 'synthetic-A'), '1');
assert.equal(isNativePushOptedOut('synthetic-A', pushStorage), true);
assert.equal(isNativePushOptedOut('synthetic-B', pushStorage), false, 'other UID must not inherit A preference');
pushMarkers.set(NATIVE_PUSH_OPT_OUT_PREFIX + 'synthetic-A', 'corrupted');
assert.equal(isNativePushOptedOut('synthetic-A', pushStorage), true, 'tampered persistent opt-out must fail closed');
assert.equal(setNativePushOptOut('synthetic-A', false, pushStorage), true);
assert.equal(isNativePushOptedOut('synthetic-A', pushStorage), false);
assert.equal(isNativePushOptedOut('invalid uid!', pushStorage), true);
assert.equal(setNativePushOptOut('invalid uid!', true, pushStorage), false);
const inaccessible = {
  getItem() { throw new Error('storage unavailable'); },
  setItem() { throw new Error('storage unavailable'); },
  removeItem() { throw new Error('storage unavailable'); },
};
assert.equal(isNativePushOptedOut('synthetic-A', inaccessible), true);
assert.equal(setNativePushOptOut('synthetic-A', false, inaccessible), false);
assert.equal(setNativePushOptOut('synthetic-A', true, inaccessible), false);


const resetHelpers = native.slice(native.indexOf('function pendingPushOwnershipReset()'),
  native.indexOf('function installPushOwnershipRetryListener()'))
  // The source module is TypeScript; node:vm evaluates JavaScript, not TS annotations.
  .replace('function setPendingPushOwnershipReset(pending: boolean)',
    'function setPendingPushOwnershipReset(pending)');
assert(resetHelpers.includes('function setPendingPushOwnershipReset(pending)'),
  'synthetic VM must execute the actual reset helper after removing its one TS annotation');
const makeResetGuard = (localStorage) => vm.runInNewContext(
  `let pendingPushOwnershipResetVolatile = false;
const PENDING_PUSH_OWNERSHIP_RESET_KEY = 'tutop.synthetic-push-reset';
${resetHelpers}
({ pendingPushOwnershipReset, setPendingPushOwnershipReset });`,
  { localStorage },
);
const storedReset = new Map();
const normalResetStore = {
  getItem: key => storedReset.get(key) ?? null,
  setItem: (key, value) => { storedReset.set(key, value); },
  removeItem: key => { storedReset.delete(key); },
};
const normalGuard = makeResetGuard(normalResetStore);
assert.equal(normalGuard.pendingPushOwnershipReset(), false);
assert.equal(normalGuard.setPendingPushOwnershipReset(true), true);
assert.equal(normalGuard.pendingPushOwnershipReset(), true);
assert.equal(normalGuard.setPendingPushOwnershipReset(false), true);
assert.equal(normalGuard.pendingPushOwnershipReset(), false);
// A native deleteToken success cannot clear the gate when localStorage removal fails.
const unclearedMarker = new Map([['tutop.synthetic-push-reset', '1']]);
const failingRemoval = makeResetGuard({
  getItem: key => unclearedMarker.get(key) ?? null,
  setItem: (key, value) => { unclearedMarker.set(key, value); },
  removeItem: () => { throw new Error('storage blocked'); },
});
assert.equal(failingRemoval.pendingPushOwnershipReset(), true);
assert.equal(failingRemoval.setPendingPushOwnershipReset(false), false);
assert.equal(failingRemoval.pendingPushOwnershipReset(), true);
assert.equal(nativePushReconciliationStillPending(true, false), true);
let writeAllowed = false;
const failingWriteStore = {
  getItem: () => null,
  setItem: () => { if (!writeAllowed) throw new Error('quota exceeded'); },
  removeItem: () => {},
};
const quotaGuard = makeResetGuard(failingWriteStore);
assert.equal(quotaGuard.setPendingPushOwnershipReset(true), false);
assert.equal(quotaGuard.pendingPushOwnershipReset(), true,
  'push ownership reset persistence failure must quarantine within this process');
writeAllowed = true;
assert.equal(quotaGuard.pendingPushOwnershipReset(), true,
  'later storage availability alone must not silently clear quarantine');
assert.equal(quotaGuard.setPendingPushOwnershipReset(false), true);
assert.equal(quotaGuard.pendingPushOwnershipReset(), false);
const readFailureGuard = makeResetGuard({
  getItem: () => { throw new Error('blocked'); },
  setItem: () => {},
  removeItem: () => {},
});
assert.equal(readFailureGuard.pendingPushOwnershipReset(), true,
  'failed storage read must never authorize reusing a token under another owner');

const emit = native.slice(native.indexOf('function emitNotificationIntent('), native.indexOf('function currentPushSessionWitness()'));
const init = native.slice(native.indexOf('export async function initializeNativeFirebaseSecurity()'), native.indexOf('export async function nativePushRegistrationHealth()'));
const health = native.slice(native.indexOf('export async function nativePushRegistrationHealth()'), native.indexOf('export async function enableNativePushNotifications()'));
const enable = native.slice(native.indexOf('export async function enableNativePushNotifications()'), native.indexOf('export async function disableNativePushNotifications()'));
const disable = native.slice(native.indexOf('export async function disableNativePushNotifications()'), native.indexOf('function bounded<'));
assert(emit.includes('pendingPushOwnershipReset() || nativePushOptedOut()'), 'opted-out owners must not route stale token events');
assert(native.includes('if (pendingPushOwnershipReset() || nativePushOptedOut()) return null;'));
assert(sync.includes("if (nativePushOptedOut()) return { registered: false, reason: 'user-opted-out' };"));
assert(init.includes('await syncGrantedPushToken().catch(() => false)'), 'automatic registration must preserve opt-out check inside sync');
assert(health.includes('if (nativePushOptedOut())'), 'health checks must never re-enable opt-out');
assert(health.includes("reason: 'user-opted-out'"));
assert(enable.includes('setNativePushOptOut(uid, false)'), 'only direct explicit enable action may clear opt-out');
assert(enable.includes('pushRegistrationEpoch += 1;'));
assert(disable.includes('setNativePushOptOut(owner.uid, true)'), 'disable must persist opt-out before touching native token');
assert(disable.indexOf('setNativePushOptOut(owner.uid, true)') < disable.indexOf('pushRegistrationEpoch += 1;'));
assert(disable.includes('if (!isSameOwner()) return false;'), 'late token cleanup must reject new owner');
const permissionUI = fs.readFileSync('src/components/PermissionSettings.tsx','utf8');
const deviceHealthUI = fs.readFileSync('src/components/DeviceHealthPanel.tsx','utf8');
assert(permissionUI.includes("reason === 'user-opted-out'"));
assert(permissionUI.includes("return 'Ver estado'"), 'opt-out must not be presented as retryable token failure');
assert(deviceHealthUI.includes("reason === 'user-opted-out'"));
console.log('PASS synthetic native push per-owner opt-out persistence, fail-closed storage, no automatic re-register or stale routing');

// Exercise the actual (TypeScript-free) sign-out function in a synthetic VM.
// The marker must be durable before getToken awaits, including when the native
// plugin is temporarily missing. Never access Firebase or a physical device.
const signOutCode = native.slice(native.indexOf('export async function prepareNativePushForAccountSignOut()'))
  .replace(/^export /, '').replace('null as any', 'null');
assert(signOutCode.startsWith('async function prepareNativePushForAccountSignOut()'));
const makeSyntheticResetStorage = (failRemoval = false) => {
  const entries = new Map();
  return { entries, storage: {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: key => { if (failRemoval) throw new Error('synthetic-blocked-remove'); entries.delete(key); },
  } };
};
const syntheticSignOut = (plugin, resetGuard) => {
  const context = {
    pushRegistrationEpoch: 0, initialization: null,
    isNativeFirebaseRuntime: () => true,
    capacitorPlugin: () => plugin,
    setPendingPushOwnershipReset: resetGuard.setPendingPushOwnershipReset,
    needsNativePushOwnershipReset,
    pushBackend: { unregisterDeviceToken: async () => undefined },
    bounded: (promise, _ms, fallback) => Promise.resolve(promise).catch(() => fallback),
  };
  return vm.runInNewContext(signOutCode + '\nprepareNativePushForAccountSignOut', context)();
};
const offlinePluginStorage = makeSyntheticResetStorage();
const offlinePluginReset = makeResetGuard(offlinePluginStorage.storage);
const pluginMissing = await syntheticSignOut(null, offlinePluginReset);
assert.equal(pluginMissing.tokenDeleted, false);
assert.equal(pluginMissing.ownershipResetQueued, true);
assert.equal(offlinePluginReset.pendingPushOwnershipReset(), true,
  'missing native plugin during logout must quarantine previous owner');
assert.equal(offlinePluginStorage.entries.get('tutop.synthetic-push-reset'), '1');

const interruptedStorage = makeSyntheticResetStorage();
const interruptedReset = makeResetGuard(interruptedStorage.storage);
let resolveNativeToken;
const delayedToken = new Promise(resolve => { resolveNativeToken = resolve; });
const pendingLogout = syntheticSignOut({
  getToken: () => delayedToken, deleteToken: async () => undefined,
}, interruptedReset);
assert.equal(interruptedStorage.entries.get('tutop.synthetic-push-reset'), '1',
  'owner reset marker MUST persist synchronously before getToken resolves');
resolveNativeToken({ token: 'synthetic-token-abcdefghijklmnopqrstuvwxyz' });
const completedLogout = await pendingLogout;
assert.equal(completedLogout.tokenDeleted, true);
assert.equal(completedLogout.ownershipResetQueued, false);
assert.equal(interruptedReset.pendingPushOwnershipReset(), false,
  'clear marker only after native token deletion and successful readback');

const failedNativeStorage = makeSyntheticResetStorage();
const failedNativeReset = makeResetGuard(failedNativeStorage.storage);
const failedNativeLogout = await syntheticSignOut({
  getToken: async () => ({ token: 'synthetic-token-abcdefghijklmnopqrstuvwxyz' }),
  deleteToken: async () => { throw new Error('synthetic-native-delete-failure'); },
}, failedNativeReset);
assert.equal(failedNativeLogout.ownershipResetQueued, true);
assert.equal(failedNativeReset.pendingPushOwnershipReset(), true,
  'native deletion failure must preserve quarantine');

const failedRemovalStorage = makeSyntheticResetStorage(true);
const failedRemovalReset = makeResetGuard(failedRemovalStorage.storage);
const failedRemovalLogout = await syntheticSignOut({
  getToken: async () => ({ token: 'synthetic-token-abcdefghijklmnopqrstuvwxyz' }),
  deleteToken: async () => undefined,
}, failedRemovalReset);
assert.equal(failedRemovalLogout.ownershipResetQueued, true,
  'successful native delete is insufficient without durable marker removal');
assert.equal(failedRemovalReset.pendingPushOwnershipReset(), true);
// Two asynchronous logouts share the module epoch: older cleanup must not
// erase a newer logout's marker even if its native token deletion resolves.
const overlappingStorage = makeSyntheticResetStorage();
const overlappingReset = makeResetGuard(overlappingStorage.storage);
let activeSyntheticPlugin;
const sharedContext = {
  pushRegistrationEpoch: 0, initialization: null,
  isNativeFirebaseRuntime: () => true,
  capacitorPlugin: () => activeSyntheticPlugin,
  setPendingPushOwnershipReset: overlappingReset.setPendingPushOwnershipReset,
  needsNativePushOwnershipReset,
  pushBackend: { unregisterDeviceToken: async () => undefined },
  bounded: (promise, _ms, fallback) => Promise.resolve(promise).catch(() => fallback),
};
const sharedSignOut = vm.runInNewContext(
  signOutCode + '\nprepareNativePushForAccountSignOut', sharedContext,
);
let resolveFirstDelete;
activeSyntheticPlugin = {
  getToken: async () => ({ token: 'synthetic-token-first-abcdefghijklmnopqrstuvwxyz' }),
  deleteToken: () => new Promise(resolve => { resolveFirstDelete = resolve; }),
};
const oldLogout = sharedSignOut();
for (let i = 0; i < 32 && !resolveFirstDelete; i++) await Promise.resolve();
assert.equal(typeof resolveFirstDelete, 'function', 'first logout must reach pending native deletion');
let resolveSecondDelete;
activeSyntheticPlugin = {
  getToken: async () => ({ token: 'synthetic-token-second-abcdefghijklmnopqrstuvwxyz' }),
  deleteToken: () => new Promise(resolve => { resolveSecondDelete = resolve; }),
};
const newLogout = sharedSignOut();
for (let i = 0; i < 32 && !resolveSecondDelete; i++) await Promise.resolve();
assert.equal(typeof resolveSecondDelete, 'function', 'new logout must start before stale completion');
assert.equal(sharedContext.pushRegistrationEpoch, 2);
resolveFirstDelete();
const staleCleanup = await oldLogout;
assert.equal(staleCleanup.tokenDeleted, true);
assert.equal(staleCleanup.ownershipResetQueued, true,
  'stale successful deletion cannot clear the newer ownership reset');
assert.equal(overlappingReset.pendingPushOwnershipReset(), true);
assert.equal(overlappingStorage.entries.get('tutop.synthetic-push-reset'), '1');
resolveSecondDelete();
const currentCleanup = await newLogout;
assert.equal(currentCleanup.ownershipResetQueued, false);
assert.equal(overlappingReset.pendingPushOwnershipReset(), false);
console.log('PASS overlapping native push signouts: stale cleanup cannot release new owner quarantine');

console.log('PASS synthetic native logout: pre-await quarantine, absent plugin, deletion failure, marker readback failure');

console.log('PASS synthetic native push owner epoch guard, delayed callback and backend CAS pre-write contracts');
