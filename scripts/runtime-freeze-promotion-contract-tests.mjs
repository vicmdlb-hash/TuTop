import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');
const manifest = JSON.parse(read('docs/RUNTIME_FREEZE_CANDIDATE_0.9.json'));
const pkg = JSON.parse(read('package.json'));
const october = read('.github/workflows/october-01-validation.yml');
const staging = read('.github/workflows/staging-v2-smoke.yml');
const android = read('.github/workflows/android-debug-apk.yml');
const androidV2 = android.slice(android.indexOf('  android-v2-staging:'));
const check = read('scripts/check.mjs');
const env = read('.env.example');

assert.equal(manifest.schema, 'tutop.runtime-freeze-candidate.v1');
assert.equal(manifest.status, 'runtime_freeze_candidate');
assert.equal(manifest.runtime_validated, false);
assert.equal(manifest.feature_freeze, true);
assert.equal(manifest.required_same_sha_chain, true);
assert.equal(manifest.current_physical_qa_candidate, null);
assert.deepEqual(manifest.cost_cutovers_default, {
  reviews_lazy: false,
  wallet_lazy: false,
  favorites_visible: false,
});
assert.deepEqual(manifest.required_promotion_sequence, [
  'october_01_validation_same_sha_green',
  'staging_v2_smoke_same_sha_green',
  'android_v2_same_sha_build',
  'apk_sha256_and_metadata',
  'generated_candidate_exact_head_verification',
  'guarded_candidate_activation',
  'strict_candidate_drift_green',
  'physical_qa_A_and_B',
]);

for (const [name, workflow] of [['october', october], ['staging', staging], ['android', android]]) {
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m, `${name} must be manual-only`);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
}

for (const expected of [
  'npm run check',
  'npm run build',
  'npm run v2:rules:prepare',
  'VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER: "true"',
  'VITE_TUTOP_V2_WALLET_LAZY_CUTOVER: "true"',
  'VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER: "true"',
  'tests/firestore.v2.transaction-lock.test.mjs',
  'tests/firestore.v2.favorite-membership.test.mjs',
  'tests/firestore.v2.unread-aggregation.test.mjs',
  'tests/firestore.v2.review-strike-aggregation.test.mjs',
]) assert(october.includes(expected), `October missing ${expected}`);
assert.equal(october.includes('npm run typecheck'), false, 'October must not run TypeScript validation twice');
assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
assert.equal(pkg.scripts.build, 'npm run typecheck && vite build');

assert.match(staging, /actions: read/);
assert.match(staging, /if: github\.ref_name == 'feat\/tutop-0\.8-p0'/);
assert.match(staging, /test "\$GITHUB_REF_NAME" = "feat\/tutop-0\.8-p0"/);
assert.match(staging, /october-01-validation\.yml\/runs/);
assert.match(staging, /head_sha="\$GITHUB_SHA"/);
assert.match(staging, /status=success/);
assert.match(staging, /event=workflow_dispatch/);
assert.match(staging, /TUTOP_VALIDATED_GATE_RUN_ID=\$GATE_RUN_ID/);
assert.match(staging, /TUTOP_VALIDATED_GATE_SHA=\$GITHUB_SHA/);
assert.match(staging, /npm run v2:catalog:seed/);
const stagingGateIndex = staging.indexOf('Require same-SHA green October gate before any staging mutation');
for (const step of [
  'Deploy current strict V2 rules and indexes',
  'Verify canonical catalog without overwriting',
  'Enable base Firebase Authentication without Identity Platform upgrade',
  'Prepare staging Web App runtime config',
  'Provision and validate staging Android Firebase app',
  'Real two-user marketplace smoke',
  'Real controlled account erasure smoke',
  'Enable App Check monitoring only',
]) {
  const index = staging.indexOf(step);
  assert(stagingGateIndex >= 0 && index > stagingGateIndex, `${step} must occur after October same-SHA gate`);
}

assert.match(android, /october-01-validation\.yml\/runs/);
assert.match(android, /staging-v2-smoke\.yml\/runs/);
assert.equal((android.match(/head_sha="\$GITHUB_SHA"/g) || []).length >= 2, true);
assert.match(android, /TUTOP_VALIDATED_GATE_SHA=\$GITHUB_SHA/);
assert.match(android, /TUTOP_VALIDATED_STAGING_SHA=\$GITHUB_SHA/);
assert.match(android, /head_sha=\$\{GITHUB_SHA\}/);
assert.match(android, /gate_run_id=\$\{TUTOP_VALIDATED_GATE_RUN_ID\}/);
assert.match(android, /staging_smoke_run_id=\$\{TUTOP_VALIDATED_STAGING_RUN_ID\}/);
assert.match(android, /PHYSICAL_QA_CANDIDATE\.generated\.json/);
assert.match(androidV2, /npm run build/);
assert.match(androidV2, /lintDebug testDebugUnitTest assembleDebug/);
for (const duplicate of ['npm run check', 'npm run typecheck', 'npm run v2:rules:prepare']) {
  assert.equal(androidV2.includes(duplicate), false, `Android V2 must reuse October same-SHA evidence instead of repeating ${duplicate}`);
}

assert.equal(pkg.scripts['v2:catalog:seed'], 'node scripts/gated-v2-catalog-seed.mjs');
assert.equal(pkg.scripts['v2:reservations:reconcile'], 'node scripts/gated-v2-reservation-reconcile.mjs');
assert.equal(pkg.scripts['v2:maintenance'], 'node scripts/gated-v2-maintenance.mjs');
assert.equal(pkg.scripts['firebase:deploy:spark'], 'node scripts/freeze-blocked-command.mjs firebase:deploy:spark');
for (const line of [
  'VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=false',
  'VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=false',
  'VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=false',
]) assert.match(env, new RegExp(line));

for (const contract of [
  'v2-rules-composition-contract-tests.mjs',
  'v2-rules-access-budget-tests.mjs',
  'v2-canonical-bridge-coverage-tests.mjs',
  'v2-canonical-completion-contract-tests.mjs',
  'v2-terminal-state-authority-tests.mjs',
  'visible-favorites-cutover-tests.mjs',
  'physical-qa-candidate-generation-tests.mjs',
  'runtime-freeze-promotion-contract-tests.mjs',
  'secondary-workflow-freeze-contract-tests.mjs',
  'staging-mutation-surface-contract-tests.mjs',
]) assert.match(check, new RegExp(contract.replaceAll('.', '\\.')));

console.log('PASS runtime freeze manifest remains fail-closed and all cost cutovers default-off');
console.log('PASS October, staging and Android remain manual-only');
console.log('PASS October obtains typecheck evidence once through npm run build');
console.log('PASS staging exports October run+SHA authority before any remote mutation');
console.log('PASS Android binds October + staging evidence to the exact checkout SHA and reuses upstream static evidence');
console.log('PASS public catalog/reconcile/maintenance npm mutation surfaces use exact-SHA wrappers');
console.log('PASS direct Spark deploy remains blocked during runtime freeze');
console.log('Runtime freeze promotion contract: PASS');
