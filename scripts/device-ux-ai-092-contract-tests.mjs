import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const theme = read('src/lib/theme091.ts');
const index = read('index.html');
const appearance = read('src/components/AppearanceSettings.tsx');
const device = read('src/services/nativeDeviceCapabilities.ts');
const nativeCaps = read('scripts/android-native-capabilities.mjs');
const voicePlugin = read('scripts/android-topi-voice-plugin.mjs');
const nativeAI = read('src/services/nativeTopiAI.ts');

assert.match(theme, /return value === 'dark' \|\| value === 'system' \|\| value === 'light' \? value : 'dark'/);
assert.match(index, /tutop\.theme\.v2/);
assert.match(index, /dataset\.theme = resolved/);
assert.match(appearance, /Oscuro/);
assert.match(appearance, /Predeterminado/);
assert.match(appearance, /Automático/);

assert.match(device, /camera\.takePhoto/);
assert.match(device, /camera\.chooseFromGallery/);
assert.match(device, /camera\.getPhoto/);
assert.match(device, /watchPosition/);
assert.match(device, /clearWatch/);
assert.match(device, /enableHighAccuracy: false/);
assert.match(device, /photo\.thumbnail/);
assert.match(device, /convertFileSrc/);
assert.match(nativeCaps, /photopicker_activity:0:required/);
assert.doesNotMatch(nativeCaps, /android\.permission\.CAMERA/);
assert.doesNotMatch(nativeCaps, /ACCESS_FINE_LOCATION/);

assert.match(voicePlugin, /MAX_RECOGNITION_ATTEMPTS/);
assert.match(voicePlugin, /EXTRA_PARTIAL_RESULTS, true/);
assert.match(voicePlugin, /EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L/);
assert.match(voicePlugin, /ERROR_NO_MATCH/);
assert.match(voicePlugin, /ERROR_SPEECH_TIMEOUT/);

assert.match(nativeAI, /appCheckRequired\(\)/);
assert.match(nativeAI, /Promise\.race/);
assert.match(nativeAI, /AI_REQUEST_TIMEOUT_MS/);
assert.match(nativeAI, /if \(required && !appCheckToken\)/);

console.log('✅ TuTop 0.9.2 device UX + camera/gallery + coarse-location + voice + real-AI hardening contract PASS');
