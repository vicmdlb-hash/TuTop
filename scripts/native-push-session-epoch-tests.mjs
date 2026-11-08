import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchesNativePushSession } from '../src/lib/nativePushSessionGuard.ts';
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

console.log('PASS synthetic native push owner epoch guard, delayed callback and backend CAS pre-write contracts');
