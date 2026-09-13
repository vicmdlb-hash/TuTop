import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const theme = read('src/lib/theme091.ts');
const index = read('index.html');
const appearance = read('src/components/AppearanceSettings.tsx');
const device = read('src/services/nativeDeviceCapabilities.ts');
const nativeCaps = read('scripts/android-native-capabilities.mjs');
const mobileDeps = read('scripts/install-mobile-deps.mjs');
const voicePlugin = read('scripts/android-topi-voice-plugin.mjs');
const nativeAI = read('src/services/nativeTopiAI.ts');
const nativeAppCheck = read('src/services/nativeAppCheckToken.ts');
const assistantProvider = read('src/services/assistantProvider.ts');
const consumerSupport = read('src/services/topiConsumerSupport.ts');
const supportUi = read('src/components/TopiSupportAssistant.tsx');
const identityBridge = read('src/services/nationalIdentityHydrationBridge.ts');
const publishUi = read('src/components/NationalPublishScreen.tsx');
const detailUi = read('src/components/ProductDetail.tsx');
const mediaStorage = read('src/services/firebaseMediaStorage.ts');
const listingSchema = read('src/lib/listingSchemaV2.ts');
const rulesHardener = read('scripts/harden-listing-video-rules.mjs');
const packageJson = read('package.json');
const topiMascot = read('src/components/TopiMascot.tsx');
const brandCss = read('src/brand092.css');
const appIcon = read('assets/branding/tutop-app-icon.svg');
const adaptiveIcon = read('assets/branding/tutop-adaptive-foreground.svg');
const storageRules = read('firebase/storage.rules');
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
assert.match(device, /plugin\('Filesystem'\)/);
assert.match(device, /filesystem\.readFile/);
assert.match(device, /imageBlobFromFilesystem/);
assert.match(mobileDeps, /@capacitor\/filesystem@/);
assert.match(device, /watchPosition/);
assert.match(device, /clearWatch/);
assert.match(device, /enableHighAccuracy: false/);
assert.match(device, /enableLocationManagerFallback: true/);
assert.doesNotMatch(device, /enableLocationFallback: true/);
assert.match(device, /OS-PLUG-GLOC-0007/);
assert.match(device, /OS-PLUG-GLOC-0010/);
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
assert.match(nativeAI, /isPrivatePhysicalQaBuild/);
assert.match(nativeAI, /environment === 'staging'/);
assert.match(nativeAI, /\^0\\\.9\\\.2-beta\\\./);
assert.match(nativeAI, /if \(isPrivatePhysicalQaBuild\(\)\) return false/);

// Physical QA must prove real Firebase AI. A model outage cannot be disguised
// by automatically returning the deterministic local assistant.
assert.match(assistantProvider, /physicalQaRequiresRealAI/);
assert.match(assistantProvider, /TOPI_REAL_AI_UNAVAILABLE/);
assert.match(assistantProvider, /nativeTopiAIStatus\(\)\.reason/);
assert.match(consumerSupport, /source: 'unavailable'/);
assert.match(consumerSupport, /physicalQaRequiresRealAI/);
assert.match(supportUi, /IA no disponible/);
assert.match(supportUi, /no sustituye una falla de Firebase AI/);
assert.match(publishUi, /La IA real de Topi no respondió/);
assert.match(publishUi, /no lo disfraza con un asistente local/);

// 0.9.2 must not depend on a manually registered debug secret. The native
// App Check plugin defaults to Play Integrity on Android when debugToken=false.
assert.match(nativeAppCheck, /\^0\\\.9\\\.1-beta\\\./);
assert.doesNotMatch(nativeAppCheck, /\^0\\\.9\\\.\(\?:1\|2\)-beta/);
assert.match(nativeAppCheck, /play-integrity/);
assert.match(nativeAppCheck, /debugToken: useStagingDebugProvider\(\)/);

// Publication has one canonical authority path. It validates real institution
// and campus catalog documents, reconciles the seller profile and re-reads it.
assert.match(identityBridge, /validateResolvedIdentityInFirestore/);
assert.match(identityBridge, /institutions\/\$\{resolved\.institution\.id\}/);
assert.match(identityBridge, /campuses\/\$\{resolved\.campus\.id\}/);
assert.match(identityBridge, /CAMPUS_INSTITUTION_MISMATCH/);
assert.match(identityBridge, /profileMatchesResolved/);
assert.match(identityBridge, /PROFILE_IDENTITY_RECHECK_FAILED/);
assert.match(identityBridge, /const selected = resolveCanonicalIdentity/);
assert.match(identityBridge, /await migrateLegacyIdentity/);
assert.doesNotMatch(identityBridge, /profileCanonical \|\| listingCanonical/);
assert.match(identityBridge, /institution_id: resolved\.institution\.id/);
assert.match(identityBridge, /campus_id: resolved\.campus\.id/);
assert.doesNotMatch(publishUi, /nationalBackend\.updateUniversityIdentity/);
assert.doesNotMatch(publishUi, /identitySyncWarning/);
assert.match(publishUi, /single publication authority/);

// Video object-storage is implemented end to end but deliberately feature-gated
// until Blaze/Cloud Storage is explicitly authorized.
assert.match(storageRules, /validListingVideo/);
assert.match(storageRules, /50 \* 1024 \* 1024/);
assert.match(storageRules, /video\/\(mp4\|webm\|quicktime\)/);
assert.match(storageRules, /product-videos\/\{uid\}/);
assert.match(storageRules, /owner\(uid\) && validListingVideo\(\)/);
assert.match(mediaStorage, /MAX_LISTING_VIDEO_BYTES = 50 \* 1024 \* 1024/);
assert.match(mediaStorage, /VITE_TUTOP_MEDIA_STORAGE_ENABLED/);
assert.match(mediaStorage, /Authorization: `Firebase \$\{idToken\}`/);
assert.match(mediaStorage, /X-Firebase-AppCheck/);
assert.match(mediaStorage, /X-Goog-Upload-Protocol/);
assert.match(mediaStorage, /multipart/);
assert.match(mediaStorage, /firebase-storage:\/\//);
assert.match(mediaStorage, /product-videos\/\$\{uid\}/);
assert.match(mediaStorage, /MEDIA_STORAGE_BILLING_REQUIRED/);
assert.match(listingSchema, /video_urls\?: string\[\]/);
assert.match(listingSchema, /validCanonicalVideoUri/);
assert.match(rulesHardener, /video_urls/);
assert.match(rulesHardener, /firebase-storage:\/\//);
assert.match(packageJson, /harden-listing-video-rules\.mjs/);
assert.match(publishUi, /firebaseMediaStorage\.uploadListingVideo/);
assert.match(publishUi, /uploadedVideoUri/);
assert.match(publishUi, /firebaseMediaStorage\.delete/);
assert.match(publishUi, /accept="video\/mp4,video\/webm,video\/quicktime"/);
assert.match(detailUi, /firebaseMediaStorage\.loadVideoBlobUrl/);
assert.match(detailUi, /<video/);
assert.match(detailUi, /URL\.revokeObjectURL/);

// Branding is no longer a wordmark squeezed into the launcher icon. The icon is
// a simple TuTop pin/T isotipo; Topi carries visible crochet/yarn stitches.
assert.match(topiMascot, /topi-yarn-brown/);
assert.match(topiMascot, /topi-yarn-purple/);
assert.match(topiMascot, /topi-soft-yarn/);
assert.match(topiMascot, /topi-crochet-stitches/);
assert.match(topiMascot, /strokeDasharray="2 2"/);
assert.match(topiMascot, /import '\.\.\/brand092\.css'/);
assert.match(brandCss, /#211a47/i);
assert.match(brandCss, /#7c4dff/i);
assert.match(appIcon, /<path d="M512 202c-177 0-320 139-320 310/);
assert.match(appIcon, /M390 393h244v78h-78v213h-88V471h-78Z/);
assert.doesNotMatch(appIcon, /font-family="Arial/);
assert.match(adaptiveIcon, /M392 385h240v76h-77v209h-86V461h-77Z/);
assert.doesNotMatch(adaptiveIcon, /font-family="Arial/);

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

assert.match(listings, /const cacheKey = `\$\{uid\}#\$\{cells\.join\('\|'\)\}#\$\{limit\}`/);
assert.match(listings, /const minePromise = this\.loadMine/);
assert.match(listings, /doc\.data\.seller_id === uid/);
assert.match(listings, /doc\.data\.status === 'active'/);
assert.match(listings, /cells\.includes\(cell\)/);
assert.match(listings, /\[\.\.\.sets\.flat\(\), \.\.\.ownNearby\]/);

console.log('✅ TuTop 0.9.2 software hardening: canonical publication preflight + mandatory real-AI QA + native photos + gated video pipeline + coarse location + crochet branding + canonical Nearby PASS');