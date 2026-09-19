import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const publish = read('src/components/NationalPublishScreen.tsx');
const permissions = read('src/components/PermissionSettings.tsx');
const permissionCenter = read('src/lib/permissionCenter091.ts');
const nearby = read('src/lib/nearbyMarketplace.ts');
const nativeDevice = read('src/services/nativeDeviceCapabilities.ts');
const voice = read('src/lib/topiVoice.ts');
const nativeSecurity = read('src/services/nativeFirebaseSecurity.ts');

assert.match(publish, /verifiedEmailBetaAuth\.refreshVerificationStatus\(\)/, 'publish must refresh verified-email status before write');
assert.match(publish, /publish_email_not_verified/, 'publish must distinguish unverified identity from generic permission failure');
assert.match(publish, /PUBLISH_DRAFT_PREFIX/, 'publish draft persistence must exist');
assert.match(publish, /sessionStorage\.setItem/, 'publish draft must persist during tab changes');
assert.match(publish, /readPublishDraft\(user\.id\)/, 'publish draft must restore for the same user after screen remount');
assert.match(publish, /clearPublishDraft\(user\.id\)/, 'successful publish must clear the recovered draft');

for (const staleGuard of [
  "!title.trim() && suggestion.title",
  "!price.trim() && suggestion.price",
  "!description.trim() && suggestion.description",
  "!category && suggestion.category",
]) {
  assert.equal(publish.includes(staleGuard), false, `Topi compose must not silently refuse to transfer suggestion because field already had content: ${staleGuard}`);
}
assert.match(publish, /if \(suggestion\.title\) setTitle\(suggestion\.title\)/);
assert.match(publish, /if \(suggestion\.description\) setDescription\(suggestion\.description\)/);
assert.match(publish, /if \(suggestion\.category\)/);

assert.match(permissions, /window\.addEventListener\('focus', update\)/, 'permission center must refresh after returning from Android settings');
assert.match(permissions, /visibilitychange/, 'permission center must refresh when app becomes visible');
assert.match(permissions, /queryCapabilityPermission\(id\)\.catch\(\(\) => requested\)/, 'permission request must be followed by authoritative re-query');

assert.match(permissionCenter, /nativeLocationPermission\(false\)/, 'location status must be freshly queried from native permission state');
assert.match(permissionCenter, /nativeCameraPermission\(\)/, 'camera capability must be queried from the native picker capability');
assert.match(permissionCenter, /queryTopiVoicePermission\(\)/, 'microphone status must use the native voice permission query');
assert.match(permissionCenter, /nativePushPermission\(\)/, 'notification status must use the native Firebase messaging permission query');

assert.match(nativeDevice, /geolocation\.checkPermissions\(\)/, 'native location permission must use checkPermissions');
assert.match(nativeDevice, /geolocation\.requestPermissions\(\{ permissions: \['coarseLocation'\] \}\)/, 'native location request must ask only for coarse location');
assert.match(nativeDevice, /geolocation\.getCurrentPosition\(requestOptions\)/, 'location path must attempt direct current position');
assert.match(nativeDevice, /geolocation\.watchPosition\(/, 'location path must have a bounded watch fallback');
assert.match(nativeDevice, /geolocation\.clearWatch\(\{ id \}\)/, 'location fallback must clear the native watcher');
assert.match(nativeDevice, /if \(settled \|\| cleanupRequested\) clearActiveWatch\(\)/, 'watcher must still be cleared if callback settles before watch id resolves');
assert.match(nativeDevice, /enableHighAccuracy: false/, 'location must remain approximate');
assert.match(nearby, /coarseCoordinate\(position\.latitude\)/, 'nearby location must be reduced to coarse precision before persistence');
assert.match(nearby, /saveApproxLocation\(location\)/, 'successful location acquisition must persist only the approximate location');

assert.match(nativeDevice, /plugin\('Camera'\)/, 'camera/photo picker must require the native Camera plugin');
assert.match(nativeDevice, /camera\.takePhoto/, 'camera path must support native camera capture');
assert.match(nativeDevice, /camera\.chooseFromGallery/, 'gallery path must support the Android system photo picker');
assert.match(nativeDevice, /saveToGallery: false/, 'camera capture must not silently save a copy to the gallery');
assert.match(nativeDevice, /camera\.getPhoto/, 'camera path must retain a compatibility fallback');
assert.match(nativeDevice, /imageBlobFromFilesystem\(photo\)/, 'selected photo must try native filesystem read first');
assert.match(nativeDevice, /imageBlobFromUrl\(photo\.webPath\)/, 'selected photo must support system-picker webPath');
assert.match(nativeDevice, /convertFileSrc\?\.\(photo\.uri\)/, 'selected photo must support Capacitor URI conversion fallback');
assert.match(nativeDevice, /NATIVE_PHOTO_READ_FAILED/, 'unreadable native photos must fail closed instead of publishing empty media');

assert.match(voice, /voice\.checkPermission\(\)/, 'microphone state must query the native plugin');
assert.match(voice, /voice\.requestPermission\(\)/, 'microphone request must use the native plugin');
assert.match(voice, /voice\.listen\(\{ language: 'es-MX' \}\)/, 'voice dictation must invoke the native recognizer explicitly');

assert.match(nativeSecurity, /messaging\.checkPermissions\(\)/, 'notification permission reads must query FirebaseMessaging every time');
assert.match(nativeSecurity, /messaging\.requestPermissions\(\)/, 'notification activation must request through FirebaseMessaging');
assert.match(nativeSecurity, /const permission = await nativePushPermission\(\)/, 'token sync must re-check notification permission before registering');

console.log('✅ build116 Device A feedback + native capability contract PASS');
