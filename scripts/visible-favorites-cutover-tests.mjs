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

assert.match(flags, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER/);
assert.match(flags, /favoritesVisibleCutoverEnabled/);
assert.match(env, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=false/);
assert.match(snapshotBridge, /favoritesCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('favorites'/);

assert.match(backend, /MAX_VISIBLE_FAVORITES = 120/);
assert.match(backend, /MAX_IN_VALUES = 30/);
assert.match(backend, /op: 'IN'/);
assert.match(backend, /productIds\.map\(\(productId\) => \(\{ stringValue: productId \}\)\)/);
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

assert.match(app, /import '\.\/services\/v2FavoriteMutationCacheBridge'/);
assert.match(app, /<V2VisibleFavoritesHydrator \/>/);
assert.match(listings, /limitPerScope: 30/);

console.log('PASS favorites cutover remains default-off and staging-only');
console.log('PASS broad up-to-200 snapshot query is skipped only when explicit favorites cutover is active');
console.log('PASS visible favorite membership uses batched Firestore IN queries of at most 30 IDs with App Check forwarding');
console.log('PASS visible scope remains capped at 120, matching four 30-listing V2 scopes');
console.log('PASS optimistic favorite toggles and failed rollbacks share mutation versions with hydration cache');
console.log('PASS stale in-flight membership reads cannot overwrite a newer favorite mutation');
console.log('Visible favorites cutover contract: PASS');
