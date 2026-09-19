import assert from 'node:assert/strict';
import fs from 'node:fs';

const native = fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx','utf8');

assert.match(native, /export async function prepareNativePushForAccountSignOut\(\)/);
assert.match(native, /pushBackend\.unregisterDeviceToken\(token, 'android'\)/);
assert.match(native, /messaging\.deleteToken\(\)/);
assert.match(native, /initialization = null/);
assert.match(native, /bounded\(/);

assert.match(gate, /prepareNativePushForAccountSignOut/);
const cleanup = gate.indexOf('await prepareNativePushForAccountSignOut');
const onlineSignOut = gate.indexOf('onlineBackend.signOut()', cleanup);
const authSignOut = gate.indexOf('verifiedEmailBetaAuth.signOut()', cleanup);
assert(cleanup >= 0 && onlineSignOut > cleanup && authSignOut > cleanup, 'push ownership cleanup must run before auth/session clear');
assert.match(gate, /await signOutAll\(\)/);

console.log('PASS post-build116 push ownership: old-account token cleanup is attempted before auth clear and logout remains bounded');
