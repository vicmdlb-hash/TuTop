import fs from 'node:fs';
import assert from 'node:assert/strict';

const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const identityBridge = fs.readFileSync('src/services/nationalIdentityHydrationBridge.ts', 'utf8');

assert.match(online, /function v2SnapshotMode\(\)/);
assert.match(online, /const leanV2 = v2SnapshotMode\(\)/);
assert.match(online, /leanV2 \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('products'/);
assert.match(online, /leanV2 \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('bids'/);
assert.match(identityBridge, /canonicalListingsBackend\.loadMarketplaceProducts\(/);

console.log('PASS V2 snapshot skips legacy products and weekly bids reads');
console.log('PASS canonical listings_v2 hydration remains the V2 marketplace authority');
console.log('V2 snapshot cost contract: PASS');
