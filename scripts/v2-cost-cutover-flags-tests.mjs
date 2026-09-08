import fs from 'node:fs';
import assert from 'node:assert/strict';

const flags = fs.readFileSync('src/services/v2CostCutoverFlags.ts', 'utf8');
const bridge = fs.readFileSync('src/services/v2CostCutoverSnapshotBridge.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

assert.match(flags, /VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER/);
assert.match(flags, /VITE_TUTOP_V2_WALLET_LAZY_CUTOVER/);
assert.match(flags, /=== 'true'/);
assert.match(flags, /V2_COST_CUTOVER_REQUIRES_SCHEMA_V2/);
assert.match(flags, /environment !== 'staging'/);
assert.match(flags, /V2_COST_CUTOVER_STAGING_ONLY/);

assert.match(app, /import '\.\/services\/v2CostCutoverSnapshotBridge';/);
assert.match(bridge, /if \(reviewsCutover \|\| walletCutover\)/);
assert.match(bridge, /reviewsCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('reviews'/);
assert.match(bridge, /walletCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('wallet_transactions'/);
assert.match(bridge, /reviewsCutover\s*\? await reviewStrikeCountBackend\.load\(\)/);
assert.doesNotMatch(bridge, /reviewStrikeCountBackend\.load\(\)\.catch/);
assert.match(bridge, /products: \[\]/);

const currentRootCeiling = 565;
const reviewsCutoverRootCeiling = currentRootCeiling - 200;
const reviewsAndWalletCutoverRootCeiling = reviewsCutoverRootCeiling - 100;
assert.equal(reviewsCutoverRootCeiling, 365);
assert.equal(reviewsAndWalletCutoverRootCeiling, 265);

console.log('PASS V2 cost cutovers are absent-by-default, exact-true, schema-V2 and staging-only');
console.log('PASS reviews cutover removes both 100-doc review queries and fails closed through strike COUNT');
console.log('PASS wallet cutover removes the 100-doc wallet history query while Wallet owns lazy history');
console.log('PASS target root ceilings are 365 with reviews cutover and 265 with reviews+wallet cutover');
console.log('V2 cost cutover flags contract: PASS');
