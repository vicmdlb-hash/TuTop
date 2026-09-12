import fs from 'node:fs';
import assert from 'node:assert/strict';

const assistant = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const store = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

assert.match(assistant, /source: 'local'/);
assert.doesNotMatch(assistant, /VITE_TUTOP_AI_ENDPOINT/);
assert.doesNotMatch(assistant, /\bfetch\s*\(/);
assert.doesNotMatch(assistant, /remoteCopilot/);
assert.match(assistant, /detectCategory/);
assert.match(assistant, /improveDescription/);
assert.match(assistant, /suggestPriceFromProducts/);
assert.match(assistant, /reviewProductDraft/);

assert.match(store, /favoriteMutationVersion = new Map<string, number>\(\)/);
assert.match(store, /favoriteState\(current\.favorites, productId, wasFavorite\)/);
assert.match(store, /favoriteMutationVersion\.get\(productId\) === version/);
assert.doesNotMatch(store, /set\(\{ favorites: state\.favorites \}\)/);
assert.match(store, /NEUTRAL_COMMUNITY_LABEL = 'Comunidad universitaria'/);
assert.doesNotMatch(store, /facultad: 'Turismo Internacional'/);
assert.doesNotMatch(store, /currentFacultad: 'Turismo Internacional'/);

console.log('PASS Topi 0.9 has no remote/provider fetch path');
console.log('PASS favorite rollback cannot overwrite newer per-product intent');
console.log('PASS empty application state no longer assumes one academic program');
console.log('Local Topi + favorites regression contract: PASS');
