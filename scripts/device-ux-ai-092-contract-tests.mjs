import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const theme = read('src/lib/theme091.ts');
const index = read('index.html');
const device = read('src/services/nativeDeviceCapabilities.ts');
const nativeCaps = read('scripts/android-native-capabilities.mjs');
const mobileDeps = read('scripts/install-mobile-deps.mjs');
const androidBootstrap = read('scripts/android-bootstrap.mjs');
const androidAssets = read('scripts/android-assets.mjs');
const voicePlugin = read('scripts/android-topi-voice-plugin.mjs');
const nativeAIPlugin = read('scripts/android-topi-ai-plugin.mjs');
const nativeAI = read('src/services/nativeTopiAI.ts');
const assistantProvider = read('src/services/assistantProvider.ts');
const publishUi = read('src/components/NationalPublishScreen.tsx');
const authGate = read('src/components/BackendGate.tsx');
const identityBridge = read('src/services/nationalIdentityHydrationBridge.ts');
const onboarding = read('src/services/v2OnboardingRecovery.ts');
const initialAccount = read('src/lib/v2InitialAccount.ts');
const resetBridge = read('src/services/stagingResetBridge.ts');
const main = read('src/main.tsx');
const brand092 = read('src/brand092.css');
const prepareAndroid = read('scripts/prepare-staging-android-app.mjs');
const registrationSmoke = read('scripts/staging-app-registration-smoke.mjs');
const mediaStorage = read('src/services/firebaseMediaStorage.ts');
const storageRules = read('firebase/storage.rules');
const topiMascot = read('src/components/TopiMascot.tsx');
const appIcon = read('assets/branding/tutop-app-icon.svg');
const adaptiveIcon = read('assets/branding/tutop-adaptive-foreground.svg');
const splash092 = read('assets/branding/tutop-splash-092.svg');
const app = read('src/App.tsx');
const explore = read('src/components/ExploreScreen.tsx');
const listings = read('src/services/canonicalListingsBackend.ts');

assert.match(theme, /return value === 'dark'.*'system'.*'light'.*: 'dark'/);
assert.match(index, /tutop\.theme\.v2/);
assert.match(index, /dataset\.theme = resolved/);
assert.match(main, /import '\.\/brand092\.css';/);
assert.match(brand092, /html\[data-theme="light"\]/);
assert.match(brand092, /\[data-theme="light"\] \.app-shell/);
assert.match(brand092, /\[data-theme="light"\] \.auth-input/);
assert.match(brand092, /\[data-theme="light"\] \.bottom-nav/);

assert.match(device, /isPluginAvailable/);
assert.match(device, /camera\.takePhoto/);
assert.match(device, /camera\.chooseFromGallery/);
assert.match(device, /camera\.getPhoto/);
assert.match(device, /plugin\('Filesystem'\)/);
assert.match(device, /filesystem\.readFile/);
assert.match(device, /imageBlobFromFilesystem/);
assert.match(device, /targetWidth: 1600/);
assert.match(device, /targetHeight: 1600/);
assert.match(device, /saveToGallery: false/);
assert.doesNotMatch(device, /mediaType:\s*1/);
assert.match(mobileDeps, /@capacitor\/camera@8\.2\.4/);
assert.match(mobileDeps, /@capacitor\/filesystem@8\.1\.0/);
assert.match(androidBootstrap, /'@capacitor\/filesystem'/);

assert.match(device, /enableHighAccuracy: false/);
assert.match(device, /enableLocationFallback: true/);
assert.doesNotMatch(device, /enableLocationManagerFallback/);
assert.match(device, /watchPosition/);
assert.match(device, /clearWatch/);
assert.match(device, /permissions: \['coarseLocation'\]/);
const permissionBlock = nativeCaps.match(/const permissions = \[([\s\S]*?)\];/)?.[1] || '';
assert.match(permissionBlock, /ACCESS_COARSE_LOCATION/);
assert.match(permissionBlock, /RECORD_AUDIO/);
assert.doesNotMatch(permissionBlock, /ACCESS_FINE_LOCATION/);
assert.doesNotMatch(permissionBlock, /ACCESS_BACKGROUND_LOCATION/);
assert.doesNotMatch(permissionBlock, /android\.permission\.CAMERA/);
assert.doesNotMatch(permissionBlock, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);

assert.match(voicePlugin, /MAX_RECOGNITION_ATTEMPTS/);
assert.match(voicePlugin, /EXTRA_PARTIAL_RESULTS, true/);
assert.match(voicePlugin, /ERROR_NO_MATCH/);
assert.match(voicePlugin, /ERROR_SPEECH_TIMEOUT/);

assert.match(nativeAI, /AI_REQUEST_TIMEOUT_MS = 20_000/);
assert.match(nativeAI, /gemini-3\.8-flash/);
assert.match(nativeAI, /gemini-3\.5-flash-lite/);
assert.match(nativeAIPlugin, /firebase-ai:17\.17\.0/);
assert.doesNotMatch(nativeAIPlugin, /firebase-ai:17\.16\.0/);
assert.match(nativeAIPlugin, /@PluginMethod[\s\S]*void status\(PluginCall call\)/);
assert.match(assistantProvider, /physicalQaRequiresRealAI/);
assert.match(assistantProvider, /TOPI_REAL_AI_UNAVAILABLE/);
assert.match(publishUi, /Topi IA real \(Firebase AI\)/);
assert.match(publishUi, /La IA real de Topi no respondió/);

// Device A: university/campus must be chosen explicitly and a pending canonical
// identity must be completed before the first hydrated snapshot used by Publish.
assert.match(authGate, /const \[institutionId, setInstitutionId\] = useState\(''\)/);
assert.match(authGate, /const \[campusId, setCampusId\] = useState\(''\)/);
assert.doesNotMatch(authGate, /useState\('uatx'\)|useState\('uatx-riberena'\)/);
assert.match(authGate, /Selecciona institución/);
assert.match(authGate, /nunca se infieren por LADA o ubicación/);
assert.match(authGate, /celular permanece SIN VERIFICAR/);
assert.match(authGate, /no se usa como prueba de identidad/);
assert.match(authGate, /verifiedEmailBetaAuth\.register/);
assert.match(authGate, /Verifica tu correo/);
const pendingBeforeSnapshot = authGate.indexOf('await completePendingUniversityIdentity().catch(() => false)');
const snapshotAfterPending = authGate.indexOf('const snapshot = await onlineBackend.loadSnapshot()');
assert.ok(pendingBeforeSnapshot >= 0 && snapshotAfterPending > pendingBeforeSnapshot, 'canonical university identity must settle before store hydration');

assert.match(initialAccount, /V2_REGISTRATION_IDENTITY_REQUIRED/);
assert.match(initialAccount, /institution_id/);
assert.match(initialAccount, /campus_id/);
const profileIdentityAllowlist = initialAccount.match(/const PROFILE_IDENTITY_KEYS = \[([\s\S]*?)\] as const;/)?.[1] || '';
for (const requiredIdentityKey of ['country_code', 'state_code', 'city_id', 'city_name', 'institution_id', 'institution_name', 'campus_id', 'campus_name']) {
  assert.match(profileIdentityAllowlist, new RegExp(`['\"]${requiredIdentityKey}['\"]`));
}
assert.doesNotMatch(profileIdentityAllowlist, /state_name|community_id|community_name/);
assert.match(onboarding, /buildV2InitialAccountDocuments/);
assert.match(onboarding, /client\.commit/);
assert.match(onboarding, /V2_REGISTRATION_IDENTITY_RECHECK_FAILED/);
assert.match(onboarding, /installV2AtomicRegistrationBridge/);
assert.match(prepareAndroid, /staging-app-registration-smoke\.mjs/);
assert.match(prepareAndroid, /reset-staging-accounts\.mjs/);
assert.match(registrationSmoke, /PlayStation 5 registro smoke/);
assert.match(registrationSmoke, /cuenta recién registrada no pudo publicar/);

assert.match(identityBridge, /validateResolvedIdentityInFirestore/);
assert.match(identityBridge, /CAMPUS_INSTITUTION_MISMATCH/);
assert.match(identityBridge, /PROFILE_IDENTITY_RECHECK_FAILED/);
assert.match(publishUi, /recordDiagnostic\('publication', failureCode\)/);
assert.match(publishUi, /role="status"/);
assert.match(publishUi, /aria-live="polite"/);
assert.doesNotMatch(publishUi, /Firestore rechazó la publicación/);
assert.doesNotMatch(publishUi, /`No pudimos publicar: \$\{raw\}`/);

assert.match(resetBridge, /RESET_GENERATION/);
assert.match(resetBridge, /key\.startsWith\('tutop\.'\)/);
assert.match(main, /applyStagingResetIfNeeded\(\);[\s\S]*initializeTheme091\(\);[\s\S]*restoreNativeSessionForProject/);

assert.match(storageRules, /product-videos\/\{uid\}/);
assert.match(storageRules, /50 \* 1024 \* 1024/);
assert.match(mediaStorage, /VITE_TUTOP_MEDIA_STORAGE_ENABLED/);
assert.match(mediaStorage, /MEDIA_STORAGE_INFRASTRUCTURE_DISABLED/);

assert.match(appIcon, /data-brand="tutop-reference-icon"/);
assert.match(appIcon, /data:image\/webp;base64/);
assert.match(adaptiveIcon, /data-brand="tutop-reference-wordmark"/);
assert.match(adaptiveIcon, />TuTop<\/text>/);
assert.doesNotMatch(adaptiveIcon, /tutop-dd-pin|Double-D|aria-label="DD"/);
assert.match(splash092, /data-brand="tutop-reference-splash"/);
assert.match(splash092, /Descubre, conecta y encuentra cerca de ti/);
assert.match(splash092, /data:image\/webp;base64/);
assert.doesNotMatch(splash092, /tutop-dd-pin-splash|aria-label="DD"/);

// Build114 isolates the largest connected visual component from normalized raster bytes.
// Build111 lost embedded pixels; build112 carried caption/palette residue; build113 masks cut through Topi.
assert.match(androidAssets, /tutop-app-icon-reference\.webp/);
assert.match(androidAssets, /topi-reference\.webp/);
assert.match(androidAssets, /isolateLargestVisualComponent/);
assert.match(androidAssets, /normalized bytes/);
assert.match(androidAssets, /components\.sort/);
assert.match(androidAssets, /branding_component/);
assert.doesNotMatch(androidAssets, /captionMask|leftMaskWidth|rightMaskWidth|bottomMaskHeight/);
assert.match(androidAssets, /splashBackgroundColor', '#FFFFFF'/);
assert.match(androidAssets, /splashBackgroundColorDark', '#FFFFFF'/);
assert.match(androidAssets, /--iconBackgroundColor', '#7C4DFF'/);
assert.match(androidAssets, /--iconBackgroundColorDark', '#7C4DFF'/);
assert.match(androidAssets, /componente visual principal aislado/);
assert.match(topiMascot, /TOPI_REFERENCE/);
assert.match(topiMascot, /data:image\/webp;base64/);
assert.doesNotMatch(topiMascot, /topi-crochet-stitches|topi-yarn-purple/);

const nav = app.match(/<nav className="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
for (const label of ['Inicio', 'Explorar', 'Publicar', 'Mensajes', 'Perfil']) assert.match(nav, new RegExp(`label="${label}"`));
assert.match(explore, /RADII = \[5, 10, 25, 50\]/);
assert.match(explore, /requestApproxLocation/);
assert.match(listings, /loadNearbyProducts/);

const nearbyRetryBlock = explore.match(/const refreshNearby = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.match(explore, /const \[nearbyRefreshKey, setNearbyRefreshKey\] = useState\(0\)/);
assert.match(explore, /location\?\.captured_at, nearbyRefreshKey/);
assert.match(nearbyRetryBlock, /setNearbyError\(null\)/);
assert.match(nearbyRetryBlock, /setNearbyRefreshKey\(\(current\) => current \+ 1\)/);
assert.doesNotMatch(nearbyRetryBlock, /setLocation\(null\)|activateNearby/);

console.log('✅ TuTop 0.9.2 device contract: Device A identity-before-hydration + explicit university selection + verified-email beta identity + Camera 8 photos + coarse-location fallback + Firebase AI 17.17 + light-theme layer + approved raster TuTop/Topi branding + reliable Nearby retry PASS');
