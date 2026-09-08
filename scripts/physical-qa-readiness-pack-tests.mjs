import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readText = (file) => fs.readFileSync(file, 'utf8');

const candidate = readJson('docs/PHYSICAL_QA_CANDIDATE_0.9.json');
const deviceA = readJson('docs/PHYSICAL_QA_DEVICE_A_0.9.json');
const deviceB = readJson('docs/PHYSICAL_QA_DEVICE_B_0.9.json');
const fcm = readJson('docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json');
const appCheck = readJson('docs/APP_CHECK_PHYSICAL_EVIDENCE_TEMPLATE.json');
const recovery = readText('docs/RECOVERY_PROVIDER_DECISION_MATRIX_0.9.md');
const legal = readText('docs/LEGAL_RETENTION_REVIEW_DOSSIER_0.9.md');
const oidc = readText('docs/CI_OIDC_WIF_PARITY_CHECKLIST_0.9.md');
const cron = readText('docs/TRUSTED_CRON_DEFAULT_BRANCH_PATCH_0.9.md');
const cutoverRunbook = readText('docs/V2_COST_CUTOVER_RUNBOOK_0.9.md');

assert.equal(candidate.physical_release_candidate, false);
assert.equal(candidate.candidate_status, 'obsolete_runtime_drift');
assert.equal(candidate.replacement_required, true);
assert.equal(candidate.environment, 'staging');
assert.equal(candidate.artifact_id, 10002986519);
assert.equal(candidate.apk_sha256, '57005fd59b0026645c8b7fe02cbc36a3876e93ba287ae9c6cd2cc323a567e493');
assert.match(candidate.notes, /historical/i);
assert.match(candidate.notes, /cannot satisfy a current Physical QA gate/i);

for (const [slot, template] of [['A', deviceA], ['B', deviceB]]) {
  assert.equal(template.environment, 'staging');
  assert.equal(template.device.slot, slot);
  assert.equal(template.device.physical, false, `Device ${slot} template must never claim physical evidence`);
  assert.match(template.evidence_session_id, /^PENDIENTE-/);
  assert.equal(template.candidate.artifact_id, candidate.artifact_id);
  assert.equal(template.candidate.build_run_id, candidate.build_run_id);
  assert.equal(template.candidate.build_commit_sha, candidate.build_commit_sha);
  assert.equal(template.candidate.build_tree_sha, candidate.build_tree_sha);
  assert.equal(template.candidate.apk_sha256, candidate.apk_sha256);
  for (const value of Object.values(template.required_cases)) assert.equal(value, 'pending');
  assert.equal(template.diagnostic_report, null);
  assert.equal(template.fcm_fixture_report, null);
  assert.equal(template.app_check_evidence, null);
}

assert.notEqual(deviceA.evidence_session_id, deviceB.evidence_session_id);
assert.equal(fcm.candidate.artifact_id, candidate.artifact_id);
assert.equal(fcm.candidate.build_run_id, candidate.build_run_id);
assert.equal(fcm.candidate.build_tree_sha, candidate.build_tree_sha);
assert.equal(fcm.candidate.apk_sha256, candidate.apk_sha256);
assert.equal(fcm.device_slot, 'A|B');
assert.deepEqual(fcm.scenarios.map((x) => x.name), ['foreground', 'background', 'cold_start', 'deep_link']);
assert(fcm.scenarios.every((x) => Array.isArray(x.events) && x.events.length === 0));

assert.equal(appCheck.status, 'pending_human');
assert.equal(appCheck.device_count, 0);
assert.equal(appCheck.app_check_token_observed, false);
assert.equal(appCheck.contains_raw_token, false);
assert.equal(appCheck.candidate_artifact_id, candidate.artifact_id);
assert.equal(appCheck.candidate_apk_sha256, candidate.apk_sha256);
assert.deepEqual(appCheck.devices.map((x) => x.slot), ['A', 'B']);
assert(appCheck.devices.every((x) => x.physical === false && x.app_check_token_observed === false));

assert(recovery.includes('`provider = disabled`'));
assert(recovery.includes('verified email → recovery codes as secondary → SMS'));
assert(legal.includes('PENDIENTE REVISIÓN LEGAL'));
assert(legal.includes('PENDIENTE LEGAL'));
assert(oidc.includes('PREPARED, NOT MIGRATED'));
assert(oidc.includes('`FIREBASE_TOKEN` permanece como fallback'));
assert(cron.includes('**NO APLICAR AHORA.**'));
assert(cron.includes('el cron NO está activo automáticamente'));
assert(cutoverRunbook.includes('PREPARADO / DESACTIVADO POR DEFECTO'));
assert(cutoverRunbook.includes('Physical QA A+B'));

console.log('PASS historical APK20 is explicitly obsolete and retained only for traceability');
console.log('PASS Device A/B, FCM and App Check templates remain fail-closed historical placeholders');
console.log('PASS recovery/legal/OIDC/cron external gates remain explicitly unresolved');
console.log('PASS current cost-cutover runbook requires a new exact-HEAD Physical QA candidate');
console.log('Physical QA readiness pack contract: PASS');
