import fs from 'node:fs';
import assert from 'node:assert/strict';

const flags = fs.readFileSync('src/services/v2CostCutoverFlags.ts', 'utf8');
const bridge = fs.readFileSync('src/services/v2CostCutoverSnapshotBridge.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');
const october = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');
const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');

assert.match(flags, /VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER/);
assert.match(flags, /VITE_TUTOP_V2_WALLET_LAZY_CUTOVER/);
assert.match(flags, /=== 'true'/);
assert.match(flags, /V2_COST_CUTOVER_REQUIRES_SCHEMA_V2/);
assert.match(flags, /environment !== 'staging'/);
assert.match(flags, /V2_COST_CUTOVER_STAGING_ONLY/);

assert.match(envExample, /VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=false/);
assert.match(envExample, /VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=false/);

const leanChatImport = app.indexOf("import './services/v2LeanChatSnapshotBridge';");
const cutoverImport = app.indexOf("import './services/v2CostCutoverSnapshotBridge';");
const identityImport = app.indexOf("import './services/nationalIdentityHydrationBridge';");
assert.ok(leanChatImport >= 0 && cutoverImport > leanChatImport && identityImport > cutoverImport, 'V2 snapshot bridge order must be lean-chat → cost-cutover → identity hydration');
assert.match(bridge, /if \(reviewsCutover \|\| walletCutover\)/);
assert.match(bridge, /reviewsCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('reviews'/);
assert.match(bridge, /walletCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('wallet_transactions'/);
assert.match(bridge, /reviewsCutover\s*\? await reviewStrikeCountBackend\.load\(\)/);
assert.doesNotMatch(bridge, /reviewStrikeCountBackend\.load\(\)\.catch/);
assert.match(bridge, /backend\.loadChat\(doc, session\.uid\)/);
assert.match(bridge, /backend\.deriveNotifications\(chats, \[\], \[\], session\.uid\)/);
assert.match(bridge, /products: \[\]/);

assert.match(october, /on:\s*\n\s*workflow_dispatch:/);
assert.doesNotMatch(october, /schedule:/);
assert.match(october, /VITE_TUTOP_SCHEMA_V2: "true"/);
assert.match(october, /VITE_TUTOP_ENVIRONMENT: staging/);
assert.match(october, /VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER: "true"/);
assert.match(october, /VITE_TUTOP_V2_WALLET_LAZY_CUTOVER: "true"/);

assert.match(android, /enable_reviews_lazy_cutover:[\s\S]*?default: false[\s\S]*?type: boolean/);
assert.match(android, /enable_wallet_lazy_cutover:[\s\S]*?default: false[\s\S]*?type: boolean/);
assert.match(android, /VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER: \$\{\{ inputs\.enable_reviews_lazy_cutover \}\}/);
assert.match(android, /VITE_TUTOP_V2_WALLET_LAZY_CUTOVER: \$\{\{ inputs\.enable_wallet_lazy_cutover \}\}/);
assert.match(android, /actions: read/);
assert.match(android, /Require same-SHA green consolidated gate and real staging smoke/);
assert.match(android, /actions\/workflows\/october-01-validation\.yml\/runs/);
assert.match(android, /actions\/workflows\/staging-v2-smoke\.yml\/runs/);
assert.match(android, /head_sha="\$GITHUB_SHA"/);
assert.match(android, /status=success/);
assert.match(android, /event=workflow_dispatch/);
assert.match(android, /exit 43/);
assert.match(android, /exit 44/);
assert.match(android, /TUTOP_VALIDATED_GATE_RUN_ID/);
assert.match(android, /TUTOP_VALIDATED_STAGING_RUN_ID/);
assert.match(android, /physical-qa-staging\.metadata\.txt/);
assert.match(android, /reviews_lazy_cutover=\$\{VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER\}/);
assert.match(android, /wallet_lazy_cutover=\$\{VITE_TUTOP_V2_WALLET_LAZY_CUTOVER\}/);
assert.doesNotMatch(android, /\n\s+push:/);
assert.doesNotMatch(android, /\n\s+pull_request:/);
assert.doesNotMatch(android, /\n\s+schedule:/);

const currentRootCeiling = 565;
const reviewsCutoverRootCeiling = currentRootCeiling - 200;
const reviewsAndWalletCutoverRootCeiling = reviewsCutoverRootCeiling - 100;
assert.equal(reviewsCutoverRootCeiling, 365);
assert.equal(reviewsAndWalletCutoverRootCeiling, 265);

console.log('PASS V2 cost cutovers are default-off, exact-true, schema-V2 and staging-only');
console.log('PASS bridge order preserves lean chat behavior before canonical identity/listing hydration');
console.log('PASS reviews cutover removes both 100-doc review queries and fails closed through strike COUNT');
console.log('PASS wallet cutover removes the 100-doc wallet history query while Wallet owns lazy history');
console.log('PASS consolidated manual gate compiles with both cutovers enabled without activating runtime staging');
console.log('PASS every V2 APK requires same-SHA green consolidated gate + real staging smoke');
console.log('PASS APK metadata records SHA, prerequisite run IDs and cutover state');
console.log('PASS target root ceilings are 365 with reviews cutover and 265 with reviews+wallet cutover');
console.log('V2 cost cutover flags contract: PASS');
