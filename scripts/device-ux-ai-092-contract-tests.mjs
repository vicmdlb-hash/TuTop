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
const nativeAppCheck = read('src/services/nativeAppCheckToken.ts');
const app = read('src/App.tsx');
const explore = read('src/components/ExploreScreen.tsx');
const listings = read('src/services/canonicalListingsBackend.ts');

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
const permissionBlock = nativeCaps.match(/const permissions = \[([\s\S]*?)\];/)?.[1] || '';
assert.match(permissionBlock, /ACCESS_COARSE_LOCATION/);
assert.match(permissionBlock, /RECORD_AUDIO/);
assert.doesNotMatch(permissionBlock, /ACCESS_FINE_LOCATION/);
assert.doesNotMatch(permissionBlock, /ACCESS_BACKGROUND_LOCATION/);
assert.doesNotMatch(permissionBlock, /android\.permission\.CAMERA/);
assert.doesNotMatch(permissionBlock, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);

assert.match(voicePlugin, /MAX_RECOGNITION_ATTEMPTS/);
assert.match(voicePlugin, /EXTRA_PARTIAL_RESULTS, true/);
assert.match(voicePlugin, /EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L/);
assert.match(voicePlugin, /ERROR_NO_MATCH/);
assert.match(voicePlugin, /ERROR_SPEECH_TIMEOUT/);

assert.match(nativeAI, /appCheckRequired\(\)/);
assert.match(nativeAI, /Promise\.race/);
assert.match(nativeAI, /AI_REQUEST_TIMEOUT_MS/);
assert.match(nativeAI, /if \(required && !appCheckToken\)/);

// 0.9.2 must not depend on a manually registered debug secret. The native
// App Check plugin defaults to Play Integrity on Android when debugToken=false.
assert.match(nativeAppCheck, /\^0\\\.9\\\.1-beta\\\./);
assert.doesNotMatch(nativeAppCheck, /\^0\\\.9\\\.\(\?:1\|2\)-beta/);
assert.match(nativeAppCheck, /play-integrity/);
assert.match(nativeAppCheck, /debugToken: useStagingDebugProvider\(\)/);

// Main navigation now matches the approved consumer IA/marketplace direction:
// Inicio / Explorar / Publicar / Mensajes / Perfil. Wallet remains available
// from Perfil instead of occupying one of the five primary navigation slots.
assert.match(app, /import ExploreScreen from '\.\/components\/ExploreScreen'/);
const nav = app.match(/<nav className="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
for (const label of ['Inicio', 'Explorar', 'Publicar', 'Mensajes', 'Perfil']) assert.match(nav, new RegExp(`label="${label}"`));
assert.doesNotMatch(nav, /label="Wallet"/);
assert.match(app, /Mi Wallet/);
assert.match(explore, /RADII = \[5, 10, 25, 50\]/);
assert.match(explore, /requestApproxLocation/);
assert.match(explore, /nearbyLocationPermission/);
assert.match(explore, /nearbyGeoCells/);
assert.match(explore, /canonicalListingsBackend\.loadNearbyProducts/);
assert.match(explore, /Android bloqueó la ubicación/);
assert.match(explore, /Volver a intentar/);
assert.match(explore, /Ver todo/);
assert.match(explore, /Guardados/);
assert.match(explore, /Consultando publicaciones cercanas/);
assert.match(explore, /ProductCard/);

// Nearby public reads stay approved-only, but the signed-in seller must see
// their own active pending listing immediately. Cache isolation must include uid
// so a session switch cannot leak a seller-only pending result to another user.
assert.match(listings, /const cacheKey = `\$\{uid\}#\$\{cells\.join\('\|'\)\}#\$\{limit\}`/);
assert.match(listings, /const minePromise = this\.loadMine/);
assert.match(listings, /doc\.data\.seller_id === uid/);
assert.match(listings, /doc\.data\.status === 'active'/);
assert.match(listings, /cells\.includes\(cell\)/);
assert.match(listings, /\[\.\.\.sets\.flat\(\), \.\.\.ownNearby\]/);

console.log('✅ TuTop 0.9.2 device UX + navigation + canonical Nearby query/seller visibility + explore recovery + camera/gallery + coarse-location + voice + real-AI/App Check hardening contract PASS');
