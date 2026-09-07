import fs from 'node:fs';
import assert from 'node:assert/strict';

const hydrator = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');

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

console.log('PASS marketplace no longer polls Firestore every 30 seconds');
console.log('PASS Feed no longer duplicates a 250-document metadata query');
console.log('PASS institution/city browsing fails closed when canonical geography is missing');
console.log('Firestore cost + geography contract: PASS');
