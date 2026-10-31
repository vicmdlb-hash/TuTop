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

console.log('PASS successor emulator workflow is branch-scoped and demo-only');
console.log('PASS no staging credentials/deploy/apply path is present');
console.log('PASS all current Firestore V2 suites plus Storage Rules are wired serially');
console.log('Successor emulator gate contract: PASS');
