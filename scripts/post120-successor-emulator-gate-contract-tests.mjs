import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/post120-emulator-security.yml', 'utf8');
const config = JSON.parse(fs.readFileSync('firebase.v2.json', 'utf8'));

assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
assert.match(workflow, /^\s*push:\s*$/m);
assert.match(workflow, /fix\/post120-physical-failure-cluster/);
assert.doesNotMatch(workflow, /schedule:/);
assert.doesNotMatch(workflow, /pull_request:/);

for (const forbidden of ['tutop-beta-vicmdlb-1356585881','tutop-3a4f7','FIREBASE_TOKEN','TUTOP_FIREBASE_OAUTH_CLIENT_ID','TUTOP_FIREBASE_OAUTH_CLIENT_SECRET','secrets.','firebase deploy','firebase:deploy:staging','--apply']) {
  assert.equal(workflow.includes(forbidden), false, 'forbidden emulator-gate token: ' + forbidden);
}

for (const required of ['demo-tutop-post120-rules','@firebase/rules-unit-testing@5.0.2','firebase@12.18.0','firebase-tools@15.29.0','--only firestore,storage','--test-concurrency=1','tests/storage.rules.test.mjs','git diff --exit-code -- package.json package-lock.json']) {
  assert.equal(workflow.includes(required), true, 'missing emulator-gate token: ' + required);
}

const firestoreTests = [
  'tests/firestore.v2.rules.test.mjs',
  'tests/firestore.v2.atomic.test.mjs',
  'tests/firestore.v2.acceptance-atomic.test.mjs',
  'tests/firestore.v2.auth-status.test.mjs',
  'tests/firestore.v2.reputation-trust.test.mjs',
  'tests/firestore.v2.governance.test.mjs',
  'tests/firestore.v2.runtime-services.test.mjs',
  'tests/firestore.v2.account-operations.test.mjs',
  'tests/firestore.v2.notification-receipts.test.mjs',
  'tests/firestore.v2.transaction-lock.test.mjs',
  'tests/firestore.v2.unread-aggregation.test.mjs',
  'tests/firestore.v2.review-strike-aggregation.test.mjs',
  'tests/firestore.v2.favorite-membership.test.mjs',
  'tests/firestore.v2.post106-verified-identity.test.mjs',
  'tests/firestore.v2.private-admin-reads.test.mjs',
  'tests/firestore.v2.publication-profile-coupling.test.mjs',
  'tests/firestore.v2.seller-follows.test.mjs',
  'tests/firestore.v2.user-blocks.test.mjs'
];
for (const testPath of firestoreTests) assert.equal(workflow.includes(testPath), true, 'missing Firestore test: ' + testPath);

assert.equal(config.firestore?.rules, 'firebase/firestore.v2.generated.rules');
assert.equal(config.storage?.rules, 'firebase/storage.rules');
assert.equal(config.emulators?.firestore?.port, 8080);
assert.equal(config.emulators?.storage?.port, 9199);
assert.equal(config.emulators?.ui?.enabled, false);

// This guard checks source isolation, NOT live guardian consent enforcement.
// Passing a source contract is never authorization to release to minors.
const guardianDemoConfig = JSON.parse(fs.readFileSync('firebase.guardian-demo.json', 'utf8'));
const guardianDemoGenerator = fs.readFileSync('scripts/prepare-firestore-guardian-demo-rules.mjs', 'utf8');
// A future guardian demo cannot silently skip trusted, versioned UGC consent.
assert.match(guardianDemoGenerator, /function guardianUgcConsentReady\(uid, ageProof\)/);
assert.match(guardianDemoGenerator, /guardianUgcConsentReady\(uid, proof\)/);
assert.match(guardianDemoGenerator, /ugc-beta-draft-2026-11-14-v1/);
assert.match(guardianDemoGenerator, /guardianConsentVersion == ageProof\.guardian\.consentVersion/);

const sourceRules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const erasureSmoke = fs.readFileSync('scripts/staging-account-erasure-smoke.mjs', 'utf8');

assert.equal(guardianDemoConfig.firestore?.rules, 'firebase/firestore.v2.guardian-demo.rules');
assert.notEqual(guardianDemoConfig.firestore?.rules, config.firestore?.rules,
  'guardian migration demo must never masquerade as current V2 rules');
assert.equal(guardianDemoConfig.storage?.rules, 'firebase/storage.rules');
assert.match(guardianDemoGenerator, /GUARDIAN_DEMO_ONLY_PROJECT_REQUIRED/);
assert.match(guardianDemoGenerator, /process\.env\.GCLOUD_PROJECT !== 'demo-tutop-post120-rules'/);
assert.match(guardianDemoGenerator, /process\.env\.FIREBASE_PROJECT_ID !== 'demo-tutop-post120-rules'/);
assert.match(guardianDemoGenerator, /const outputPath = 'firebase\/firestore\.v2\.guardian-demo\.rules'/);

// Until real server-issued age/guardian capability gates have been tested,
// removing these explicit source warnings must require a deliberate review.
assert.match(sourceRules, /This storage boundary alone does NOT enforce marketplace capabilities\./);
assert.match(sourceRules, /write-side marketplace gate is a separate blocker\./);
assert.match(erasureSmoke,
  /throw new Error\('ACCOUNT_ERASURE_STAGING_SMOKE_DISABLED_UNTIL_ATOMIC_ADMISSION_FREEZE'\)/);

console.log('PASS successor emulator workflow is branch-scoped and demo-only');
console.log('PASS no staging credentials/deploy/apply path is present');
console.log('PASS all current Firestore V2 suites plus Storage Rules are wired serially');
console.log('PASS guardian migration demo isolated; live guardian backend still unapproved');
console.log('PASS staging account-erasure destructive smoke remains safety-blocked');
console.log('Successor emulator gate contract: PASS');
