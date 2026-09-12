import assert from 'node:assert/strict';
import fs from 'node:fs';

const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts', 'utf8');
const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
const topi = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const voice = fs.readFileSync('src/lib/topiVoice.ts', 'utf8');
const capabilities = fs.readFileSync('scripts/android-native-capabilities.mjs', 'utf8');
const bootstrap = fs.readFileSync('scripts/android-bootstrap.mjs', 'utf8');
const rulesHardener = fs.readFileSync('scripts/harden-nearby-v2-rules.mjs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(nearby, /NEARBY_RADIUS_OPTIONS = \[5, 10, 25, 50\]/, 'nearby must expose 5/10/25/50 km');
assert.match(nearby, /Math\.round\(value \* 100\) \/ 100/, 'listing coordinates must be coarsened');
assert.match(nearby, /approx_latitude/);
assert.match(nearby, /approx_longitude/);
assert.match(feed, /useState<BrowseScope>\('nearby'\)/, 'nearby must be default browse experience');
assert.match(feed, /withinRadius\(location, product, radiusKm\)/);
assert.match(feed, /Cerca de ti/);
assert.match(feed, /NEARBY_RADIUS_OPTIONS\.map/);

assert.match(publish, /locationAttributes\(location\)/, 'publish must persist only approximate location attributes');
assert.match(publish, /TuTop no hace envíos/);
assert.doesNotMatch(publish, /requiere seleccionar Paquetería|paquetería para Todo México/i);
assert.doesNotMatch(backend, /NATIONAL_SHIPPING_REQUIRED/, 'canonical backend must not require TuTop shipping');

for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO']) {
  assert.match(capabilities, new RegExp(permission));
}
assert.match(capabilities, /ACCESS_BACKGROUND_LOCATION/);
assert.match(capabilities, /READ_EXTERNAL_STORAGE/);
assert.match(capabilities, /WRITE_EXTERNAL_STORAGE/);
assert.match(capabilities, /android:allowBackup=\\"false\\"/);
assert.match(capabilities, /android:usesCleartextTraffic=\\"false\\"/);
assert.match(bootstrap, /android-native-capabilities\.mjs/);

assert.match(pkg.scripts['v2:rules:prepare'], /harden-nearby-v2-rules\.mjs/);
assert.match(rulesHardener, /visibility_scope != 'national'/);
assert.match(rulesHardener, /count !== 2/);

assert.match(topi, /TOPI_PERSONA/);
assert.match(topi, /local-first and zero-cost/i);
assert.match(topi, /VITE_TUTOP_TOPI_ENDPOINT/);
assert.match(topi, /backend proxy/i);
assert.doesNotMatch(topi, /authorization['"]?\s*:/i, 'client Topi provider must not send provider authorization secrets');
assert.match(voice, /recognition\.lang = 'es-MX'/);
assert.match(voice, /No audio bytes are persisted/);

console.log('✅ TuTop 0.9.1 nearby/permissions/Topi contracts PASS');
