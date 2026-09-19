import assert from 'node:assert/strict';
import fs from 'node:fs';

const native = fs.readFileSync('src/services/nativeFirebaseSecurity.ts', 'utf8');
const permissions = fs.readFileSync('src/components/PermissionSettings.tsx', 'utf8');

assert.match(native, /export async function nativePushRegistrationHealth\(\)/);
assert.match(native, /const tokenRegistered = await syncGrantedPushToken\(\)\.catch\(\(\) => false\)/);
assert.match(native, /return \{ permission, tokenRegistered, ownershipReconciliationPending: false \}/);

assert.match(permissions, /nativePushRegistrationHealth/);
assert.match(permissions, /window\.addEventListener\('online', update\)/);
assert.match(permissions, /window\.removeEventListener\('online', update\)/);
assert.match(permissions, /Permiso \+ token/);
assert.match(permissions, /Permiso activo/);
assert.match(permissions, /Token FCM:/);
assert.match(permissions, /entrega\/tap todavía requiere prueba E2E real/);
assert.match(permissions, /La entrega real se confirma sólo cuando llegue y se abra una notificación de prueba/);
assert.doesNotMatch(permissions, /permiso.*entrega.*confirmada/i);

console.log('PASS post-build116 push truth: OS permission, FCM token registration and real delivery remain distinct');
