import fs from 'node:fs';
import assert from 'node:assert/strict';

const manifest = JSON.parse(fs.readFileSync('docs/RUNTIME_FREEZE_CANDIDATE_0.9.json', 'utf8'));
const october = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');
const staging = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const check = fs.readFileSync('scripts/check.mjs', 'utf8');
const env = fs.readFileSync('.env.example', 'utf8');

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

for (const workflow of [october, staging, android]) {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\nschedule:/);
  assert.doesNotMatch(workflow, /\npush:/);
}

assert.match(october, /npm run check/);
assert.match(october, /npm run typecheck/);
assert.match(october, /npm run build/);
assert.match(october, /npm run v2:rules:prepare/);
assert.match(october, /VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER: "true"/);
assert.match(october, /VITE_TUTOP_V2_WALLET_LAZY_CUTOVER: "true"/);
assert.match(october, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER: "true"/);
assert.match(october, /tests\/firestore\.v2\.transaction-lock\.test\.mjs/);
assert.match(october, /tests\/firestore\.v2\.favorite-membership\.test\.mjs/);
assert.match(october, /tests\/firestore\.v2\.unread-aggregation\.test\.mjs/);
assert.match(october, /tests\/firestore\.v2\.review-strike-aggregation\.test\.mjs/);

assert.match(staging, /actions: read/);
assert.match(staging, /if: github\.ref_name == 'feat\/tutop-0\.8-p0'/);
assert.match(staging, /head_sha="\$GITHUB_SHA"/);
assert.match(staging, /october-01-validation\.yml\/runs/);
assert.match(staging, /status=success/);
assert.match(staging, /event=workflow_dispatch/);
assert.match(staging, /DETENIDO: staging requiere october-01-validation exitoso sobre el mismo SHA/);
const stagingGateIndex = staging.indexOf('Require same-SHA green October gate before any staging mutation');
const stagingDeployIndex = staging.indexOf('Deploy current strict V2 rules and indexes');
assert(stagingGateIndex >= 0 && stagingDeployIndex > stagingGateIndex, 'staging gate must run before any deploy');

assert.match(android, /october-01-validation\.yml\/runs/);
assert.match(android, /staging-v2-smoke\.yml\/runs/);
assert.equal((android.match(/head_sha="\$GITHUB_SHA"/g) || []).length >= 2, true);
assert.match(android, /DETENIDO: falta october-01-validation exitoso sobre el mismo SHA/);
assert.match(android, /DETENIDO: falta staging-v2-smoke exitoso sobre el mismo SHA/);
assert.match(android, /head_sha=\$\{GITHUB_SHA\}/);
assert.match(android, /gate_run_id=\$\{TUTOP_VALIDATED_GATE_RUN_ID\}/);
assert.match(android, /staging_smoke_run_id=\$\{TUTOP_VALIDATED_STAGING_RUN_ID\}/);
assert.match(android, /PHYSICAL_QA_CANDIDATE\.generated\.json/);

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
]) assert.match(check, new RegExp(contract.replaceAll('.', '\\.')));

console.log('PASS runtime freeze manifest is fail-closed and keeps all cutovers default-off');
console.log('PASS October, staging and Android remain manual-only');
console.log('PASS staging cannot mutate staging before a green October run on the exact same SHA');
console.log('PASS Android cannot build V2 candidate before green October + staging runs on the exact same SHA');
console.log('PASS exact APK metadata and generated candidate identity stay chained to the validated SHA');
console.log('Runtime freeze promotion contract: PASS');
