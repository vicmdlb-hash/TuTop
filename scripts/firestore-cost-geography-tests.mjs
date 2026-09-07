import fs from 'node:fs';
import assert from 'node:assert/strict';

const hydrator = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const store = fs.readFileSync('src/store/useAppStore.ts', 'utf8');
const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');

assert.doesNotMatch(hydrator, /setInterval\s*\(/);
assert.match(hydrator, /FOREGROUND_REFRESH_COOLDOWN_MS = 60_000/);
assert.match(hydrator, /visibilitychange/);
assert.match(hydrator, /window\.addEventListener\('online'/);
assert.match(hydrator, /limitPerScope: 30/);

assert.doesNotMatch(feed, /loadListingMetadata\s*\(/);
assert.doesNotMatch(feed, /listingMetadata/);
assert.match(feed, /return Boolean\(product\.institution_id && product\.institution_id === institution\)/);
assert.match(feed, /return Boolean\(product\.city_id && product\.city_id === city\)/);
assert.match(feed, /Legacy migration fallback stays limited/);

assert.match(store, /if \(!before \|\| \(before\.sin_leer \|\| 0\) === 0\) return/);
assert.match(store, /onlineBackend\.markChatRead\(chatId\)/);
assert.doesNotMatch(online, /Turismo Internacional/);
assert.equal((online.match(/Comunidad universitaria/g) || []).length >= 2, true);

console.log('PASS marketplace no longer polls Firestore every 30 seconds');
console.log('PASS Feed no longer duplicates a 250-document metadata query');
console.log('PASS institution/city browsing fails closed when canonical geography is missing');
console.log('PASS read markers are skipped when a chat already has zero unread messages');
console.log('PASS legacy runtime defaults are neutral instead of one university program');
console.log('Firestore cost + geography contract: PASS');
