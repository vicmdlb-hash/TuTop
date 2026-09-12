import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend = fs.readFileSync('src/services/reviewStrikeCountBackend.ts', 'utf8');
const hydrator = fs.readFileSync('src/components/V2ReviewStrikeHydrator.tsx', 'utf8');
const flags = fs.readFileSync('src/services/v2CostCutoverFlags.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const indexes = fs.readFileSync('firebase/firestore.indexes.json', 'utf8');
const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');

assert.match(backend, /STRIKE_WINDOW_MS = 30 \* 24 \* 60 \* 60_000/);
assert.match(backend, /collectionId: 'reviews'/);
assert.match(backend, /fieldPath: 'evaluado_id'/);
assert.match(backend, /stringValue: uid/);
assert.match(backend, /fieldPath: 'calificacion'/);
assert.match(backend, /stringValue: 'negative'/);
assert.match(backend, /fieldPath: 'fecha'/);
assert.match(backend, /GREATER_THAN_OR_EQUAL/);
assert.match(backend, /runAggregationQuery/);
assert.match(backend, /X-Firebase-AppCheck/);
assert.match(backend, /INVALID_STRIKE_COUNT/);

assert.match(flags, /reviewsLazyCutoverEnabled/);
assert.match(hydrator, /const cutoverEnabled = reviewsLazyCutoverEnabled\(\)/);
assert.match(hydrator, /if \(!userId \|\| !cutoverEnabled\) return/);
assert.match(hydrator, /reviewStrikeCountBackend\.load\(\)/);
assert.match(hydrator, /\{ \.\.\.state\.user, strikes \}/);
assert.doesNotMatch(hydrator, /reviewCount > 0/);
assert.match(app, /<V2ReviewStrikeHydrator \/>/);

const parsed = JSON.parse(indexes);
const strikeIndex = parsed.indexes.find((index) => index.collectionGroup === 'reviews'
  && index.queryScope === 'COLLECTION'
  && index.fields?.map((field) => field.fieldPath).join(',') === 'calificacion,evaluado_id,fecha');
assert.ok(strikeIndex, 'reviews strike aggregation composite index missing or non-canonical');

// Legacy snapshot remains the source until the explicit staging-only flag is
// enabled. Point reviews loaded later cannot turn COUNT off accidentally.
assert.match(online, /runQuery<any>\('reviews', \[\{ field: 'evaluador_id'/);
assert.match(online, /runQuery<any>\('reviews', \[\{ field: 'evaluado_id'/);

console.log('PASS exact 30-day negative-review strike COUNT is prepared');
console.log('PASS required reviews composite index is declared in Firestore canonical field order');
console.log('PASS strike hydration is tied to the explicit staging-only cutover flag');
console.log('PASS point review hydration cannot disable strike COUNT after cutover');
console.log('Review strike cutover readiness contract: PASS');
