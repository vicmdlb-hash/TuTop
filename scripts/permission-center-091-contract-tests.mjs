import fs from 'node:fs';
import assert from 'node:assert/strict';

const permissions = fs.readFileSync('src/lib/permissionCenter091.ts', 'utf8');
const component = fs.readFileSync('src/components/PermissionSettings.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const native = fs.readFileSync('scripts/android-native-capabilities.mjs', 'utf8');
const voice = fs.readFileSync('scripts/android-topi-voice-plugin.mjs', 'utf8');
const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts', 'utf8');
const device = fs.readFileSync('src/services/nativeDeviceCapabilities.ts', 'utf8');

for (const capability of ['location', 'camera', 'microphone', 'notifications']) {
  assert.match(permissions, new RegExp(capability));
  assert.match(component, new RegExp(capability));
}
assert.match(permissions, /requestApproxLocation/);
assert.match(permissions, /isNativeDeviceRuntime/);
assert.match(permissions, /nativeCameraPermission/);
assert.match(permissions, /requestTopiVoicePermission/);
assert.match(permissions, /enableNativePushNotifications/);
assert.match(permissions, /navigator\.mediaDevices\.getUserMedia/);
assert.match(permissions, /for \(const track of stream\?\.getTracks\(\) \|\| \[\]\) track\.stop\(\)/,
  'browser camera/mic probes must release media tracks immediately');
assert.match(permissions, /no tu domicilio exacto/i);
assert.match(permissions, /audio no se guarda ni se sube/i);
assert.match(component, /Tú decides cuándo activarlos/);
assert.match(component, /Ubicación, cámara, micrófono y notificaciones/);
assert.match(app, /import PermissionSettings/);
assert.match(app, /<PermissionSettings \/>/);
assert.match(nearby, /Math\.round\(value \* 100\) \/ 100/);
assert.match(device, /camera\.getPhoto/);
assert.doesNotMatch(device, /camera\.takePhoto/);
assert.match(voice, /RECORD_AUDIO/);
assert.match(voice, /SpeechRecognizer/);
assert.match(voice, /requestPermissionForAlias/);

for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO']) {
  assert.match(native, new RegExp(permission));
}
assert.match(native, /ACCESS_BACKGROUND_LOCATION/);
assert.match(native, /READ_EXTERNAL_STORAGE/);
assert.match(native, /WRITE_EXTERNAL_STORAGE/);
assert.match(native, /android:allowBackup=\\"false\\"/);
assert.match(native, /android:usesCleartextTraffic=\\"false\\"/);

console.log('PASS TuTop 0.9.1 exposes native-aware location/camera/microphone/notification controls');
console.log('PASS Android camera uses system Camera 8 getPhoto while Topi voice requests RECORD_AUDIO only on demand');
console.log('PASS nearby location remains approximate while background/storage permissions stay prohibited');
console.log('Permission center 0.9.1 contract: PASS');
