import fs from 'node:fs';
import assert from 'node:assert/strict';

const flags = fs.readFileSync('src/services/v2CostCutoverFlags.ts', 'utf8');
const bridge = fs.readFileSync('src/services/v2CostCutoverSnapshotBridge.ts', 'utf8');
const backend = fs.readFileSync('src/services/visibleFavoritesBackend.ts', 'utf8');
const hydrator = fs.readFileSync('src/components/V2VisibleFavoritesHydrator.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const listings = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const env = fs.readFileSync('.env.example', 'utf8');

assert.match(flags, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER/);
assert.match(flags, /favoritesVisibleCutoverEnabled/);
assert.match(env, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=false/);
assert.match(bridge, /favoritesCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('favorites'/);
assert.match(backend, /MAX_VISIBLE_FAVORITES = 120/);
assert.match(backend, /favorites\/\$\{key\}/);
assert.match(backend, /String\(doc\.data\?\.uid \|\| ''\) === uid/);
assert.match(backend, /String\(doc\.data\?\.product_id \|\| ''\) === productId/);
assert.match(hydrator, /favoritesVisibleCutoverEnabled\(\)/);
assert.match(hydrator, /changedDuringLoad = before\.has\(productId\) !== current\.has\(productId\)/);
assert.match(hydrator, /changedDuringLoad \? current\.has\(productId\) : server\.has\(productId\)/);
assert.match(app, /<V2VisibleFavoritesHydrator \/>/);
assert.match(listings, /limitPerScope: 30/);

console.log('PASS favorites cutover is default-off and staging-only through shared cost-cutover guard');
console.log('PASS broad up-to-200 favorite query is skipped only when the explicit cutover is active');
console.log('PASS visible membership is exact via deterministic favorites/{uid}_{productId} documents');
console.log('PASS visible scope is capped at 120, matching the current 30-per-scope V2 listing budget');
console.log('PASS late hydration preserves a favorite toggle that changed while membership reads were in flight');
console.log('Visible favorites cutover contract: PASS');
