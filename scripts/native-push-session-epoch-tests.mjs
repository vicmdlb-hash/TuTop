import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { matchesNativePushSession, needsNativePushOwnershipReset } from '../src/lib/nativePushSessionGuard.ts';
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

console.log('PASS synthetic native push owner epoch guard, delayed callback and backend CAS pre-write contracts');
