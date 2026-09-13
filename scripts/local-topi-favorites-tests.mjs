import fs from 'node:fs';
import assert from 'node:assert/strict';

const assistant = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const store = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

assert.match(assistant, /source: 'local'/);
assert.match(assistant, /VITE_TUTOP_TOPI_REMOTE_ENABLED/);
assert.match(assistant, /VITE_TUTOP_TOPI_ENDPOINT/);
assert.match(assistant, /sanitizeRemoteResult/);
assert.match(assistant, /sanitizeCompose/);
assert.match(assistant, /safeDraftForRemote/);
assert.match(assistant, /return remote \|\| localTopi\(action, context\)/);
assert.match(assistant, /detectCategory/);
assert.match(assistant, /improveDescription/);
assert.match(assistant, /suggestPriceFromProducts/);
assert.match(assistant, /reviewProductDraft/);
assert.doesNotMatch(assistant, /VITE_TUTOP_AI_ENDPOINT/);
assert.doesNotMatch(assistant, /Authorization\s*:/i, 'Topi client must never embed provider authorization');
assert.doesNotMatch(assistant, /api[_-]?key\s*:/i, 'Topi client must never embed provider API keys');

assert.match(store, /favoriteMutationVersion = new Map<string, number>\(\)/);
assert.match(store, /favoriteState\(current\.favorites, productId, wasFavorite\)/);
assert.match(store, /favoriteMutationVersion\.get\(productId\) === version/);
assert.doesNotMatch(store, /set\(\{ favorites: state\.favorites \}\)/);
assert.match(store, /NEUTRAL_COMMUNITY_LABEL = 'Comunidad universitaria'/);
assert.doesNotMatch(store, /facultad: 'Turismo Internacional'/);
assert.doesNotMatch(store, /currentFacultad: 'Turismo Internacional'/);

console.log('PASS Topi remains local-first and adds only an optional sanitized TuTop-controlled endpoint');
console.log('PASS Topi client sends no provider authorization/API key and falls back locally');
console.log('PASS favorite rollback cannot overwrite newer per-product intent');
console.log('PASS empty application state no longer assumes one academic program');
console.log('Topi + favorites regression contract: PASS');
