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

assert.equal(candidate.schema, 'tutop.physical-qa-candidate.v1');
assert.equal(candidate.environment, 'staging');
assert.equal(candidate.app_version, '0.9.0-beta.0');
assert.match(String(candidate.apk_sha256 || ''), /^[a-f0-9]{64}$/);
assert(Number.isSafeInteger(candidate.artifact_id) && candidate.artifact_id > 0);
assert(Number.isSafeInteger(candidate.build_run_id) && candidate.build_run_id > 0);

const obsolete = candidate.physical_release_candidate === false
  && candidate.candidate_status === 'obsolete_runtime_drift'
  && candidate.replacement_required === true;
const active = candidate.physical_release_candidate === true
  && candidate.candidate_status === 'active_exact_head'
  && candidate.replacement_required === false;
assert.equal(obsolete || active, true, 'candidate must be explicitly obsolete or active_exact_head');
assert.notEqual(obsolete, active, 'candidate state must be unambiguous');

if (obsolete) {
  assert.equal(candidate.artifact_id, 10002986519);
  assert.equal(candidate.apk_sha256, '57005fd59b0026645c8b7fe02cbc36a3876e93ba287ae9c6cd2cc323a567e493');
  assert.match(candidate.notes, /historical/i);
  assert.match(candidate.notes, /cannot satisfy a current Physical QA gate/i);
} else {
  assert.match(String(candidate.build_commit_sha || ''), /^[a-f0-9]{40}$/);
  assert.equal(candidate.gate_commit_sha, candidate.build_commit_sha);
  assert.equal(candidate.staging_smoke_commit_sha, candidate.build_commit_sha);
  assert(Number.isSafeInteger(candidate.gate_run_id) && candidate.gate_run_id > 0);
  assert(Number.isSafeInteger(candidate.staging_smoke_run_id) && candidate.staging_smoke_run_id > 0);
  assert.match(String(candidate.build_tree_sha || ''), /^[a-f0-9]{40}$/);
}

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
  if (active) {
    assert.equal(template.candidate.gate_run_id, candidate.gate_run_id);
    assert.equal(template.candidate.gate_commit_sha, candidate.gate_commit_sha);
    assert.equal(template.candidate.staging_smoke_run_id, candidate.staging_smoke_run_id);
    assert.equal(template.candidate.staging_smoke_commit_sha, candidate.staging_smoke_commit_sha);
  }
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
assert.equal(appCheck.candidate_build_run_id, candidate.build_run_id);
assert.equal(appCheck.candidate_build_tree_sha, candidate.build_tree_sha);
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

console.log(`PASS Physical QA candidate state is fail-closed and explicit: ${candidate.candidate_status}`);
console.log(`PASS Device A/B, FCM and App Check templates remain bound to the ${active ? 'active exact-head' : 'historical obsolete'} candidate without synthesized physical evidence`);
console.log('PASS recovery/legal/OIDC/cron external gates remain explicitly unresolved');
console.log('PASS current cost-cutover runbook requires baseline Physical QA A+B before cutover promotion');
console.log('Physical QA readiness pack contract: PASS');
