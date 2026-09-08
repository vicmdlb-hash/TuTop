import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend = fs.readFileSync('src/services/reviewStrikeCountBackend.ts', 'utf8');
const hydrator = fs.readFileSync('src/components/V2ReviewStrikeHydrator.tsx', 'utf8');
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

assert.match(hydrator, /if \(!userId \|\| reviewCount > 0\) return/);
assert.match(hydrator, /reviewStrikeCountBackend\.load\(\)/);
assert.match(hydrator, /\{ \.\.\.state\.user, strikes \}/);
assert.match(app, /<V2ReviewStrikeHydrator \/>/);

const parsed = JSON.parse(indexes);
const strikeIndex = parsed.indexes.find((index) => index.collectionGroup === 'reviews'
  && index.queryScope === 'COLLECTION'
  && index.fields?.map((field) => field.fieldPath).join(',') === 'evaluado_id,calificacion,fecha');
assert.ok(strikeIndex, 'reviews strike aggregation composite index missing');

// Deliberate migration guard: current snapshot still owns reviews/strikes. The
// hydration path must add zero duplicate reads until the future cutover removes
// these queries in the same change.
assert.match(online, /runQuery<any>\('reviews', \[\{ field: 'evaluador_id'/);
assert.match(online, /runQuery<any>\('reviews', \[\{ field: 'evaluado_id'/);

console.log('PASS exact 30-day negative-review strike COUNT is prepared');
console.log('PASS required reviews composite index is declared');
console.log('PASS V2 strike hydrator remains dormant while snapshot reviews are present');
console.log('PASS review snapshot cutover is PREPARED, not falsely claimed active');
console.log('Review strike cutover readiness contract: PASS');
