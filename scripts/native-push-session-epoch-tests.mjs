import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchesNativePushSession } from '../src/lib/nativePushSessionGuard.ts';
const A={uid:'synthetic-A',refreshToken:'synthetic-session-A',generation:3,epoch:7};
const same={uid:A.uid,refreshToken:A.refreshToken};
assert.equal(matchesNativePushSession(A,same,3,7,false),true);
for(const [identity,generation,epoch,pending] of [
  [null,3,7,false], [{uid:'synthetic-B',refreshToken:'other'},3,7,false],
  [same,4,7,false], [same,3,8,false], [same,3,7,true],
  [{uid:'synthetic-A',refreshToken:'rotated'},3,7,false],
]) assert.equal(matchesNativePushSession(A,identity,generation,epoch,pending),false);
assert.equal(matchesNativePushSession(null,same,3,7,false),false);
const native=fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8');
const backend=fs.readFileSync('src/services/pushBackend.ts','utf8');
const callback=native.slice(native.indexOf("await messaging.addListener('tokenReceived'"),native.indexOf("await messaging.addListener('notificationReceived'"));
assert(callback.includes('const witness = currentPushSessionWitness();'));
assert(callback.includes('syncGrantedPushTokenHealth(witness)'));
assert(!callback.includes('registerToken(token)'),'cannot bind stale event token');
const sync=native.slice(native.indexOf('async function syncGrantedPushTokenHealth('),native.indexOf('async function syncGrantedPushToken()'));
assert(sync.includes('await messaging.getToken()'));
assert(sync.includes('if (!isCurrentPushSession(witness)) return denied;'));
assert(sync.includes('await registerToken(token, witness);'));
assert(native.includes('pushRegistrationEpoch += 1;\n  initialization = null;'));
const register=backend.slice(backend.indexOf('async registerDeviceToken('),backend.indexOf('async unregisterDeviceToken('));
assert(register.includes('const assertOwner = () => {'));
assert(register.includes('const tokenHash = await sha256(cleanToken);\n    assertOwner();'));
assert(register.includes('const existing = await client.getDocument(`device_tokens/${id}`);\n    assertOwner();'));
console.log('PASS synthetic native push owner epoch guard, delayed callback and backend CAS pre-write contracts');
