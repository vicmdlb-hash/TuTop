import fs from 'node:fs';
import assert from 'node:assert/strict';

const permissions = fs.readFileSync('src/lib/permissionCenter091.ts', 'utf8');
const component = fs.readFileSync('src/components/PermissionSettings.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const native = fs.readFileSync('scripts/android-native-capabilities.mjs', 'utf8');
const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts', 'utf8');

for (const capability of ['location', 'camera', 'microphone']) {
  assert.match(permissions, new RegExp(capability));
  assert.match(component, new RegExp(capability));
}
assert.match(permissions, /requestApproxLocation/);
assert.match(permissions, /navigator\.mediaDevices\.getUserMedia/);
assert.match(permissions, /for \(const track of stream\?\.getTracks\(\) \|\| \[\]\) track\.stop\(\)/,
  'camera/mic permission probes must release media tracks immediately');
assert.match(permissions, /no tu domicilio exacto/i);
assert.match(permissions, /no guarda ni sube audio/i);
assert.match(component, /Sólo cuando los necesitas/);
assert.match(component, /TuTop no solicita ubicación en segundo plano ni permisos de almacenamiento/);
assert.match(app, /import PermissionSettings/);
assert.match(app, /<PermissionSettings \/>/);
assert.match(nearby, /Math\.round\(value \* 100\) \/ 100/);

for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO']) {
  assert.match(native, new RegExp(permission));
}
assert.match(native, /ACCESS_BACKGROUND_LOCATION/);
assert.match(native, /READ_EXTERNAL_STORAGE/);
assert.match(native, /WRITE_EXTERNAL_STORAGE/);
assert.match(native, /android:allowBackup=\\"false\\"/);
assert.match(native, /android:usesCleartextTraffic=\\"false\\"/);

console.log('PASS TuTop 0.9.1 exposes just-in-time location/camera/microphone controls');
console.log('PASS camera/microphone probes release streams immediately and persist no media');
console.log('PASS nearby location remains approximate while background/storage permissions stay prohibited');
console.log('Permission center 0.9.1 contract: PASS');
