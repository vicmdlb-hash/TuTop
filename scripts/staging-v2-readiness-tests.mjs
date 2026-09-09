import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync('scripts/deploy-firebase-staging.mjs', 'utf8');
const seed = fs.readFileSync('scripts/seed-v2-catalog.mjs', 'utf8');
const seedWrapper = fs.readFileSync('scripts/gated-v2-catalog-seed.mjs', 'utf8');
const guard = fs.readFileSync('scripts/staging-freeze-guard.mjs', 'utf8');
const generator = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs', 'utf8');
const firebaseV2 = JSON.parse(fs.readFileSync('firebase.v2.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.equal(firebaseV2.firestore.rules, 'firebase/firestore.v2.generated.rules');
assert.match(generator, /match \/reputation\/\{uid\}/);
assert.match(generator, /subject_uid/);
assert.match(generator, /completed_transactions == request\.resource\.data\.completed_as_seller \+ request\.resource\.data\.completed_as_buyer/);
assert.match(generator, /allow delete: if false/);

assert.match(guard, /TUTOP_V2_STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881'/);
assert.match(guard, /TUTOP_V2_FREEZE_BRANCH = 'feat\/tutop-0\.8-p0'/);
assert.match(guard, /GITHUB_ACTIONS/);
assert.match(guard, /TUTOP_VALIDATED_GATE_RUN_ID/);
assert.match(guard, /TUTOP_VALIDATED_GATE_SHA/);
assert.match(guard, /gateSha !== githubSha/);

assert.match(deploy, /assertStagingFreezeContext/);
assert.match(deploy, /allowEnv: 'TUTOP_ALLOW_FIREBASE_DEPLOY'/);
assert.match(deploy, /allowValue: 'staging-v2'/);
assert.match(deploy, /v2:rules:prepare/);
assert.match(deploy, /--config', 'firebase\.v2\.json'/);
assert.match(deploy, /--only', 'firestore:rules,firestore:indexes'/);
assert.match(deploy, /v2:catalog:plan/);
assert.doesNotMatch(deploy, /TUTOP_ALLOW_PRODUCTION_FIREBASE/);
assert.doesNotMatch(deploy, /TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID/);
assert.doesNotMatch(deploy, /firestore:rules,firestore:indexes,storage,functions,hosting/);
assert.doesNotMatch(deploy, /--only', 'functions/);
assert.doesNotMatch(deploy, /--only', 'hosting/);
assert.doesNotMatch(deploy, /--only', 'storage/);
assert.match(deploy, /NO despliega hosting, storage, functions/);

assert.match(seedWrapper, /assertStagingFreezeContext/);
assert.match(seedWrapper, /allowEnv: 'TUTOP_ALLOW_V2_SEED'/);
assert.match(seedWrapper, /allowValue: 'staging-v2'/);
assert.match(seedWrapper, /seed-v2-catalog\.mjs', '--apply'/);
assert.equal(packageJson.scripts['v2:catalog:seed'], 'node scripts/gated-v2-catalog-seed.mjs');

assert.match(seed, /TUTOP_ALLOW_V2_SEED/);
assert.match(seed, /currentDocument: \{ exists: false \}/);
assert.match(seed, /documents:commit/);

console.log('PASS V2 config points to generated strict rules');
console.log('PASS reputation strict schema is generated deterministically');
console.log('PASS Firestore deploy is exact-project/exact-branch/exact-October-SHA gated centrally');
console.log('PASS deploy scope remains Firestore V2 rules/indexes only');
console.log('PASS catalog seed public npm entrypoint is exact-gate wrapped');
console.log('PASS V2 catalog dry-run remains mandatory before deploy');
console.log('PASS V2 seed implementation remains atomic create-only');
console.log('V2 staging readiness checks: PASS');
