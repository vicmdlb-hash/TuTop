import fs from 'node:fs';
import assert from 'node:assert/strict';

const hydrator = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const nearbyHydrator = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx', 'utf8');
const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts', 'utf8');
const canonical = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const store = fs.readFileSync('src/store/useAppStore.ts', 'utf8');
const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');

assert.doesNotMatch(hydrator, /setInterval\s*\(/);
assert.match(hydrator, /FOREGROUND_REFRESH_COOLDOWN_MS = 60_000/);
assert.match(hydrator, /visibilitychange/);
assert.match(hydrator, /window\.addEventListener\('online'/);
assert.match(hydrator, /limitPerScope: 30/);
assert.match(hydrator, /V2_LISTINGS_BASE_HYDRATED_EVENT/);

assert.match(nearby, /nearbyGeoCells/);
assert.match(nearby, /for \(let latOffset = -1; latOffset <= 1/);
assert.match(nearby, /for \(let lonOffset = -1; lonOffset <= 1/);
assert.match(canonical, /slice\(0, 9\)\.sort\(\)/, 'nearby must cap geo fanout to 9 cells');
assert.match(canonical, /Math\.max\(4, Math\.min\(15, input\.limitPerCell \|\| 10\)\)/, 'per-cell reads must stay bounded');
assert.match(canonical, /NEARBY_CACHE_TTL_MS/);
assert.match(canonical, /attributes\.geo_cell/);
assert.doesNotMatch(nearbyHydrator, /nearbyRadius/, 'changing 5/10/25/50 km must not create new Firestore queries');
assert.match(nearbyHydrator, /V2_LISTINGS_BASE_HYDRATED_EVENT/, 'nearby candidates must be reapplied after base snapshot replacement');

assert.doesNotMatch(feed, /loadListingMetadata\s*\(/);
assert.doesNotMatch(feed, /listingMetadata/);
assert.match(feed, /return Boolean\(product\.institution_id && product\.institution_id === institution\)/);
assert.match(feed, /return Boolean\(product\.city_id && product\.city_id === city\)/);
assert.match(feed, /if \(nearby !== null\) return nearby;/, 'nearby must use coarse-coordinate distance when available');
assert.match(feed, /return sameCampus\(product, user, legacyFaculty\) \|\| sameCity\(product, user\);/, 'missing coarse coordinates may fall back only to campus/city identity');

assert.match(store, /if \(!before \|\| \(before\.sin_leer \|\| 0\) === 0\) return/);
assert.match(store, /onlineBackend\.markChatRead\(chatId\)/);
assert.doesNotMatch(online, /Turismo Internacional/);
assert.equal((online.match(/Comunidad universitaria/g) || []).length >= 2, true);

console.log('PASS marketplace no longer polls Firestore every 30 seconds');
console.log('PASS nearby discovery is bounded to a cached 3x3 geo-cell candidate set; radius changes stay client-side');
console.log('PASS nearby candidates are restored after canonical snapshot refreshes');
console.log('PASS Feed no longer duplicates a 250-document metadata query');
console.log('PASS institution/city browsing fails closed when canonical geography is missing');
console.log('PASS coordinate-missing nearby fallback remains limited to campus/city identity');
console.log('PASS read markers are skipped when a chat already has zero unread messages');
console.log('PASS legacy runtime defaults are neutral instead of one university program');
console.log('Firestore cost + geography contract: PASS');
