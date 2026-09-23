import fs from 'node:fs';
import assert from 'node:assert/strict';

const panel=fs.readFileSync('src/components/DeviceHealthPanel.tsx','utf8');
const profile=fs.readFileSync('src/components/Profile.tsx','utf8');

assert.match(profile,/import DeviceHealthPanel from '\.\/DeviceHealthPanel'/);
assert.match(profile,/<DeviceHealthPanel \/>/);
assert.match(panel,/nativePushRegistrationHealth/);
assert.match(panel,/nativeTopiAIStatus/);
assert.match(panel,/readLocalDiagnostics/);
assert.match(panel,/tokenRegistered/);
assert.match(panel,/ownershipReconciliationPending/);
assert.match(panel,/VITE_TUTOP_APP_VERSION/);
assert.doesNotMatch(panel,/\.token\b|getToken\(|idToken|refreshToken|phone|email|uid/i);
assert.match(panel,/no demuestra entrega FCM real/i);
assert.match(panel,/(no|ni) reemplaza la prueba física de Topi/i);

console.log('PASS device-health panel exposes build/Topi/push truth without raw tokens or personal identifiers');
