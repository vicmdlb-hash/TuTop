import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync('scripts/deploy-firebase-staging.mjs', 'utf8');
const seed = fs.readFileSync('scripts/seed-v2-catalog.mjs', 'utf8');
const firebaseV2 = JSON.parse(fs.readFileSync('firebase.v2.json', 'utf8'));

assert.equal(firebaseV2.firestore.rules, 'firebase/firestore.v2.rules');
for (const script of [deploy, seed]) {
  assert.match(script, /historicalProject = 'tutop-3a4f7'/);
  assert.match(script, /project.*=== historicalProject|projectId === historicalProject/);
  assert.match(script, /staging-v2/);
  assert.match(script, /staging\|stage\|beta\|dev\|test\|sandbox/);
  assert.match(script, /TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID/);
}
assert.match(deploy, /TUTOP_ALLOW_FIREBASE_DEPLOY=staging-v2/);
assert.match(deploy, /--config', 'firebase\.v2\.json'/);
assert.match(deploy, /--only', 'firestore:rules,firestore:indexes'/);
assert.match(deploy, /v2:catalog:plan/);
assert.doesNotMatch(deploy, /firestore:rules,firestore:indexes,storage,functions,hosting/);
assert.doesNotMatch(deploy, /--only', 'functions/);
assert.doesNotMatch(deploy, /--only', 'hosting/);
assert.doesNotMatch(deploy, /--only', 'storage/);
assert.match(deploy, /NO despliega hosting, storage, functions/);
assert.match(seed, /TUTOP_ALLOW_V2_SEED=staging-v2/);
assert.match(seed, /currentDocument: \{ exists: false \}/);
assert.match(seed, /documents:commit/);

console.log('PASS V2 deploy uses firebase.v2.json explicitly');
console.log('PASS historical TuTop Firebase project is blocked in deploy and seed');
console.log('PASS deploy scope is Firestore V2 rules/indexes only');
console.log('PASS deploy and seed require staging-v2 policy');
console.log('PASS V2 catalog dry-run is mandatory before deploy');
console.log('PASS V2 seed remains atomic create-only');
console.log('V2 staging readiness checks: PASS');
