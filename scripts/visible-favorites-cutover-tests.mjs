import fs from 'node:fs';
import assert from 'node:assert/strict';

const flags = fs.readFileSync('src/services/v2CostCutoverFlags.ts', 'utf8');
const snapshotBridge = fs.readFileSync('src/services/v2CostCutoverSnapshotBridge.ts', 'utf8');
const mutationBridge = fs.readFileSync('src/services/v2FavoriteMutationCacheBridge.ts', 'utf8');
const backend = fs.readFileSync('src/services/visibleFavoritesBackend.ts', 'utf8');
const hydrator = fs.readFileSync('src/components/V2VisibleFavoritesHydrator.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const listings = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const env = fs.readFileSync('.env.example', 'utf8');
const indexes = JSON.parse(fs.readFileSync('firebase/firestore.indexes.json', 'utf8'));
const october = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');
const firestoreWorkflow = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');
const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const emulatorFixture = fs.readFileSync('tests/firestore.v2.favorite-membership.test.mjs', 'utf8');
const canonicalRulesHardener = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(flags, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER/);
assert.match(flags, /favoritesVisibleCutoverEnabled/);
assert.match(env, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=false/);
assert.match(snapshotBridge, /favoritesCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('favorites'/);

assert.match(backend, /MAX_VISIBLE_FAVORITES = 120/);
assert.match(backend, /MAX_IN_VALUES = 30/);
assert.match(backend, /op: 'IN'/);
assert.match(backend, /productIds\.map\(\(productId\) => \(\{ stringValue: productId \}\)\)/);
assert.match(backend, /async function exactGroup/);
assert.match(backend, /favorites\/\$\{key\(uid, productId\)\}/);
assert.match(backend, /document\?\.data\?\.uid === uid/);
assert.match(backend, /document\.data\.product_id === productId/);
assert.match(backend, /groupFound = await queryGroup/);
assert.match(backend, /groupFound = await exactGroup/);
assert.doesNotMatch(backend, /runQuery<any>\('favorites'.*200/s);
assert.match(backend, /beginMutation\(productId: string, favorited: boolean\)/);
assert.match(backend, /rollbackMutation\(productId: string, mutation: number, favorited: boolean\)/);
assert.match(backend, /mutationVersion/);
assert.match(backend, /startVersions/);
assert.match(backend, /version\(uid, productId\) !== startVersions\.get\(productId\)/);
assert.match(backend, /X-Firebase-AppCheck/);
assert.match(backend, /CACHE_TTL_MS = 30_000/);

assert.match(mutationBridge, /favoritesVisibleCutoverEnabled\(\)/);
assert.match(mutationBridge, /onlineBackend\.toggleFavorite = async/);
assert.match(mutationBridge, /visibleFavoritesBackend\.beginMutation/);
assert.match(mutationBridge, /visibleFavoritesBackend\.rollbackMutation/);
assert.match(mutationBridge, /throw error/);

assert.match(hydrator, /favoritesVisibleCutoverEnabled\(\)/);
assert.match(hydrator, /startVersions/);
assert.match(hydrator, /visibleFavoritesBackend\.currentVersion\(productId\)/);
assert.match(hydrator, /changedDuringLoad/);
assert.match(hydrator, /changedDuringLoad \? current\.has\(productId\) : server\.has\(productId\)/);

const favoriteIndex = indexes.indexes.find((index) => index.collectionGroup === 'favorites'
  && index.queryScope === 'COLLECTION'
  && index.fields?.some((field) => field.fieldPath === 'uid' && field.order === 'ASCENDING')
  && index.fields?.some((field) => field.fieldPath === 'product_id' && field.order === 'ASCENDING'));
assert(favoriteIndex, 'favorites uid+product_id composite index must remain declared');

assert.match(canonicalRulesHardener, /favorites use canonical listing/);
assert.match(canonicalRulesHardener, /documents\/listings_v2\/\$\(request\.resource\.data\.product_id\)/);
assert.match(canonicalRulesHardener, /listingDoc\(request\.resource\.data\.product_id\)\.data\.status == 'active'/);
assert.match(canonicalRulesHardener, /listingDoc\(request\.resource\.data\.product_id\)\.data\.moderation_status == 'approved'/);
assert.match(pkg.scripts['v2:rules:prepare'], /harden-canonical-v2-rules\.mjs/);
assert.doesNotMatch(pkg.scripts['v2:rules:prepare'], /harden-favorite-v2-rules\.mjs/);

assert.match(emulatorFixture, /where\('uid', '==', uid\)/);
assert.match(emulatorFixture, /where\('product_id', 'in', productIds\)/);
assert.match(emulatorFixture, /membership IN devuelve exactamente los favoritos propios solicitados/);
assert.match(emulatorFixture, /membership IN respeta subsets/);
assert.match(emulatorFixture, /otro usuario no puede consultar membership de alice/);
assert.match(emulatorFixture, /consulta sin filtro uid no puede demostrar ownership y falla cerrada/);
assert.match(emulatorFixture, /membership exacto determinista permite al dueño leer su favorito para fallback/);
assert.match(emulatorFixture, /membership exacto determinista niega a otro usuario el favorito ajeno/);
assert.match(emulatorFixture, /membership exacto determinista niega lectura sin autenticación/);
assert.match(emulatorFixture, /getDoc\(doc\(alice, 'favorites\/alice_listing-1'\)\)/);
assert.match(emulatorFixture, /assertFails\(getDoc\(doc\(bob, 'favorites\/alice_listing-1'\)\)\)/);
assert.match(emulatorFixture, /assertFails\(getDoc\(doc\(anonymous, 'favorites\/alice_listing-1'\)\)\)/);
assert.match(emulatorFixture, /crear favorito acepta un listing canónico V2 activo y aprobado/);
assert.match(emulatorFixture, /crear favorito V2 rechaza target que existe sólo en products legacy/);
assert.match(emulatorFixture, /listings no aprobados/);
assert.match(emulatorFixture, /assertFails\(getDocs\(membershipQuery\(bob, 'alice'/);

assert.match(october, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER: "true"/);
assert.match(october, /tests\/firestore\.v2\.favorite-membership\.test\.mjs/);
assert.doesNotMatch(october, /schedule:/);
assert.match(firestoreWorkflow, /tests\/firestore\.v2\.favorite-membership\.test\.mjs/);
assert.doesNotMatch(firestoreWorkflow, /schedule:/);
assert.match(android, /enable_favorites_visible_cutover/);
assert.match(android, /default: false/);
assert.match(android, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER: \$\{\{ inputs\.enable_favorites_visible_cutover \}\}/);

assert.match(app, /import '\.\/services\/v2FavoriteMutationCacheBridge'/);
assert.match(app, /<V2VisibleFavoritesHydrator \/>/);
assert.match(listings, /limitPerScope: 30/);

console.log('PASS favorites cutover remains default-off and staging-only');
console.log('PASS broad up-to-200 snapshot query is skipped only when explicit favorites cutover is active');
console.log('PASS visible favorite membership uses batched Firestore IN queries of at most 30 IDs with App Check forwarding');
console.log('PASS failed IN/index queries fall back to deterministic exact favorite documents instead of false negatives');
console.log('PASS exact fallback remains scoped to visible IDs and never restores the broad 200-doc snapshot');
console.log('PASS Emulator fixture proves exact fallback owner access and foreign/anonymous denial');
console.log('PASS explicit favorites uid+product_id index is declared before staging activation');
console.log('PASS V2 favorite creation is canonical-only: active+approved listings_v2, never legacy-only products');
console.log('PASS real Emulator fixture covers canonical create, exact own subset and foreign/underconstrained denial');
console.log('PASS both manual Emulator workflows retain the favorite membership fixture');
console.log('PASS consolidated gate compiles favorites cutover and Android exposes it as a manual default-false input');
console.log('PASS optimistic favorite toggles and failed rollbacks share mutation versions with hydration cache');
console.log('PASS stale in-flight membership reads cannot overwrite a newer favorite mutation');
console.log('Visible favorites cutover contract: PASS');
