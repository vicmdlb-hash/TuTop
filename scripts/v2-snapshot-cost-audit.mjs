import fs from 'node:fs';

const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const identityBridge = fs.readFileSync('src/services/nationalIdentityHydrationBridge.ts', 'utf8');

const legacyProductQuery = /runQuery<any>\('products',[\s\S]*?,\s*100\)/.test(online);
const weeklyBidQuery = /runQuery<any>\('bids',[\s\S]*?,\s*300\)/.test(online);
const bridgeReloadsCanonical = /canonicalListingsBackend\.loadMarketplaceProducts\(/.test(identityBridge);

if (legacyProductQuery && bridgeReloadsCanonical) {
  console.warn('WARN V2_SNAPSHOT_DUPLICATE_MARKETPLACE_READ: loadSnapshot reads up to 100 legacy products before the V2 bridge replaces them with listings_v2.');
}
if (weeklyBidQuery && bridgeReloadsCanonical) {
  console.warn('WARN V2_SNAPSHOT_LEGACY_BID_READ: loadSnapshot reads up to 300 weekly bids even though V2 canonical marketplace ranking does not use that legacy snapshot.');
}

console.log(`V2 snapshot cost audit: legacyProducts=${legacyProductQuery} legacyBids=${weeklyBidQuery} canonicalReload=${bridgeReloadsCanonical}`);
console.log('Audit is informational until a runner can typecheck a lean V2 snapshot implementation.');
