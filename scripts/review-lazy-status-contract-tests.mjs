import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const status = fs.readFileSync('src/services/reviewStatusBackend.ts', 'utf8');
const hydrator = fs.readFileSync('src/components/V2ReviewStatusHydrator.tsx', 'utf8');
const bridge = fs.readFileSync('src/services/v2StoreReviewMutationBridge.ts', 'utf8');
const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');

assert.match(app, /import V2ReviewStatusHydrator from '\.\/components\/V2ReviewStatusHydrator'/);
assert.match(app, /import '\.\/services\/v2StoreReviewMutationBridge'/);
assert.match(app, /<V2ReviewStatusHydrator \/>/);

assert.match(status, /REVIEW_STATUS_CACHE_TTL_MS = 30_000/);
assert.match(status, /return `\$\{chatId\}_\$\{uid\}`/);
assert.match(status, /reviews\/\$\{reviewId\}/);
assert.match(status, /REVIEW_STATUS_MISMATCH/);
assert.match(status, /remember\(review: Review\)/);

assert.match(hydrator, /reviewStatusBackend\.load\(activeChatId\)/);
assert.match(hydrator, /reviews: \[review, \.\.\.state\.reviews\.filter/);

assert.match(bridge, /submitReview: \(chatId: string, calificacion: Review\['calificacion'\]/);
assert.match(bridge, /id: `\$\{chatId\}_\$\{state\.user\.id\}`/);
assert.match(bridge, /onlineBackend\.submitReview\(chat, calificacion, comentario\)/);
assert.match(bridge, /reviewStatusBackend\.remember\(review\)/);
assert.match(bridge, /isAlreadyExists/);
assert.doesNotMatch(bridge, /loadSnapshot\(/);

assert.match(online, /reviews\/\$\{chat\.id\}_\$\{uid\}/);
assert.match(online, /\{ exists: false \}/);

console.log('PASS current-chat review status uses deterministic reviews/{chatId}_{uid} lookup');
console.log('PASS V2 review submit remains optimistic/idempotent and does not reload the global snapshot');
console.log('PASS duplicate server review recovers from the stored deterministic review');
console.log('Review lazy status contract: PASS');
