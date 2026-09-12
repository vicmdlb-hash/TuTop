import './native-secure-session-091-contract-tests.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts', 'utf8');
const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx', 'utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
const legacyPublish = fs.readFileSync('src/components/Chatbot.tsx', 'utf8');
const mascot = fs.readFileSync('src/components/TopiMascot.tsx', 'utf8');
const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
const topi = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const voice = fs.readFileSync('src/lib/topiVoice.ts', 'utf8');
const capabilities = fs.readFileSync('scripts/android-native-capabilities.mjs', 'utf8');
const bootstrap = fs.readFileSync('scripts/android-bootstrap.mjs', 'utf8');
const androidAssets = fs.readFileSync('scripts/android-assets.mjs', 'utf8');
const rulesHardener = fs.readFileSync('scripts/harden-nearby-v2-rules.mjs', 'utf8');
const appIcon = fs.readFileSync('assets/branding/tutop-app-icon.svg', 'utf8');
const adaptiveIcon = fs.readFileSync('assets/branding/tutop-adaptive-foreground.svg', 'utf8');
const splash = fs.readFileSync('assets/branding/tutop-splash-091.svg', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(nearby, /NEARBY_RADIUS_OPTIONS = \[5, 10, 25, 50\]/, 'nearby must expose 5/10/25/50 km');
assert.match(nearby, /Math\.round\(value \* 100\) \/ 100/, 'listing coordinates must be coarsened');
assert.match(nearby, /approx_latitude/);
assert.match(nearby, /approx_longitude/);
assert.match(nearby, /geo_cell/);
assert.match(feed, /useState<BrowseScope>\('nearby'\)/, 'nearby must be default browse experience');
assert.match(feed, /withinRadius\(location, product, radiusKm\)/);
assert.match(feed, /Cerca de ti/);
assert.match(feed, /NEARBY_RADIUS_OPTIONS\.map/);
assert.match(card, /productDistanceKm\(viewerLocation, product\)/, 'every card must calculate viewer distance when available');
assert.match(card, /~\$\{distance < 10 \? distance\.toFixed\(1\)/, 'card must expose a visible approximate km label');
assert.match(card, /NEARBY_LOCATION_EVENT/, 'distance must react to updated approximate location');

assert.match(publish, /askTopi\('compose'/, 'V2 publisher must call Topi compose');
assert.match(publish, /result\.source === 'topi-endpoint'/, 'V2 publisher must expose connected-vs-local Topi state');
assert.match(publish, /respuesta remota sanitizada/i);
assert.match(publish, /TopiMascot/);
assert.match(publish, /locationAttributes\(location\)/, 'publish must persist only approximate location attributes');
assert.match(publish, /TuTop no hace envíos/);
assert.doesNotMatch(publish, /requiere seleccionar Paquetería|paquetería para Todo México/i);
assert.doesNotMatch(backend, /NATIONAL_SHIPPING_REQUIRED/, 'canonical backend must not require TuTop shipping');

assert.match(topi, /TOPI_PERSONA/);
assert.match(topi, /local-first and zero-cost/i);
assert.match(topi, /VITE_TUTOP_TOPI_ENDPOINT/);
assert.match(topi, /backend proxy/i);
assert.match(topi, /sanitizeCompose/);
assert.match(topi, /sanitizeRemoteResult/);
assert.match(topi, /safeDraftForRemote/);
assert.match(topi, /method !== 'shipping' \|\| explicitShipping/, 'remote Topi may suggest external shipping only when the user explicitly asks for it');
assert.doesNotMatch(topi, /authorization['"]?\s*:/i, 'client Topi provider must not send provider authorization secrets');

assert.match(legacyPublish, /TuTop no hace envíos/);
assert.match(legacyPublish, /Opcional\. Nunca es un servicio de TuTop/);
assert.doesNotMatch(legacyPublish, /selectedScope === 'national' && !draft\.shipping_available/);
assert.doesNotMatch(legacyPublish, /Necesario para mostrar el artículo en Todo México/i);
assert.match(rulesHardener, /legacyShippingRequirement/);
assert.match(rulesHardener, /legacyCount !== 1/);
assert.match(rulesHardener, /canonicalCount !== 2/);

for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO']) {
  assert.match(capabilities, new RegExp(permission));
}
assert.match(capabilities, /ACCESS_BACKGROUND_LOCATION/);
assert.match(capabilities, /READ_EXTERNAL_STORAGE/);
assert.match(capabilities, /WRITE_EXTERNAL_STORAGE/);
assert.match(capabilities, /android:allowBackup=\\"false\\"/);
assert.match(capabilities, /android:usesCleartextTraffic=\\"false\\"/);
assert.match(bootstrap, /android-native-capabilities\.mjs/);
assert.match(bootstrap, /android-secure-session-plugin\.mjs/);

assert.ok(appIcon.includes('Topi') || appIcon.includes('996643'), 'app icon must contain the new Topi visual identity');
assert.match(adaptiveIcon, /8B5CF6/);
assert.match(splash, /Tu comunidad, más cerca/);
assert.match(androidAssets, /tutop-app-icon\.svg/);
assert.match(androidAssets, /tutop-adaptive-foreground\.svg/);
assert.match(androidAssets, /tutop-splash-091\.svg/);
assert.match(androidAssets, /require\('sharp'\)/);
assert.match(mascot, /aria-label=\{title\}/);

assert.match(pkg.scripts['v2:rules:prepare'], /harden-nearby-v2-rules\.mjs/);
assert.match(voice, /recognition\.lang = 'es-MX'/);
assert.match(voice, /No audio bytes are persisted/);

console.log('✅ TuTop 0.9.1 nearby/permissions/Topi/distance/branding/no-shipping contracts PASS');
