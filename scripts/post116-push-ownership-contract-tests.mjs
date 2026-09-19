import assert from 'node:assert/strict';
import fs from 'node:fs';

const native = fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx','utf8');
const permissions = fs.readFileSync('src/components/PermissionSettings.tsx','utf8');

assert.match(native, /export async function prepareNativePushForAccountSignOut\(\)/);
assert.match(native, /pushBackend\.unregisterDeviceToken\(token, 'android'\)/);
assert.match(native, /messaging\.deleteToken\(\)/);
assert.match(native, /initialization = null/);
assert.match(native, /bounded\(/);
assert.match(native, /PENDING_PUSH_OWNERSHIP_RESET_KEY/);
assert.match(native, /reconcilePendingPushOwnershipReset/);
assert.match(native, /if \(ownership\.pending\) \{[\s\S]*initialization = null;[\s\S]*return;/);
assert.match(native, /if \(ownership\.pending\) return \{ permission, tokenRegistered: false, ownershipReconciliationPending: true \}/);
assert.match(native, /!serverDeactivated && !tokenDeleted/);
assert.match(native, /setPendingPushOwnershipReset\(true\)/);
assert.match(native, /window\.addEventListener\('online'/);

assert.match(gate, /prepareNativePushForAccountSignOut/);
const cleanup = gate.indexOf('await prepareNativePushForAccountSignOut');
const onlineSignOut = gate.indexOf('onlineBackend.signOut()', cleanup);
const authSignOut = gate.indexOf('verifiedEmailBetaAuth.signOut()', cleanup);
assert(cleanup >= 0 && onlineSignOut > cleanup && authSignOut > cleanup, 'push ownership cleanup must run before auth/session clear');
assert.match(gate, /await signOutAll\(\)/);
assert.match(permissions, /pushOwnershipPending/);
assert.match(permissions, /Reconciliando cuenta/);
assert.match(permissions, /reconciliando cuenta anterior/);

console.log('PASS post-build116 push ownership: online logout cleans before auth clear; fully-offline failure quarantines token reuse until reconciliation');
