import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const hydrator = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
const explore = fs.readFileSync('src/components/ExploreScreen.tsx','utf8');

assert.match(backend, /force\?: boolean/);
assert.match(backend, /if \(!input\.force && cached && cached\.expiresAt > Date\.now\(\)\) return cached\.products/);

assert.match(hydrator, /const hydrate = async \(location: ApproxLocation, force = false\)/);
assert.match(hydrator, /loadNearbyProducts\(\{ geoCells: cells, limitPerCell: 10, force \}\)/);
assert.match(hydrator, /const onBaseHydrated = \(\) => hydrateCached\(true\)/);

assert.match(explore, /V2_LISTINGS_BASE_HYDRATED_EVENT/);
assert.match(explore, /setNearbyProducts\(\[\]\)/);
assert.match(explore, /setNearbyRefreshKey\(\(current\) => current \+ 1\)/);
assert.match(explore, /loadNearbyProducts\(\{ geoCells: cells, limitPerCell: 15, force: true \}\)/);

console.log('PASS nearby moderation freshness: authoritative base hydration invalidates open Explore state and bypasses nearby cache');
