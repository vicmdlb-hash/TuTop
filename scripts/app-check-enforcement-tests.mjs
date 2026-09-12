import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAppCheckPhysicalEvidence } from './app-check-enforcement-readiness.mjs';

const historical = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
assert.equal(historical.physical_release_candidate, true);
assert.equal(historical.candidate_status, 'active_exact_head');
assert.equal(historical.replacement_required, false);
const candidate = { ...historical, physical_release_candidate: true, candidate_status: 'synthetic_contract_fixture', replacement_required: false };

const now = Date.parse('2026-09-07T04:30:00.000Z');
const valid = {
  status: 'verified',
  platform: 'android',
  app_version: '0.9.0-beta.0',
  staging_project: 'tutop-beta-vicmdlb-1356585881',
  candidate_apk_sha256: candidate.apk_sha256,
  candidate_artifact_id: candidate.artifact_id,
  candidate_build_run_id: candidate.build_run_id,
  candidate_build_tree_sha: candidate.build_tree_sha,
  device_count: 2,
  devices: [
    { slot: 'A', physical: true, evidence_session_id: 'appcheck-session-a', profile_fingerprint_sha256: 'a'.repeat(64), app_check_token_observed: true, verified_at: '2026-09-07T04:20:00.000Z' },
    { slot: 'B', physical: true, evidence_session_id: 'appcheck-session-b', profile_fingerprint_sha256: 'b'.repeat(64), app_check_token_observed: true, verified_at: '2026-09-07T04:21:00.000Z' },
  ],
  app_check_token_observed: true,
  verified_at: '2026-09-07T04:22:00.000Z',
  contains_raw_token: false,
};
const ready = validateAppCheckPhysicalEvidence(valid, now, candidate);
assert.equal(ready.ready, true);
assert.equal(ready.min_device_count, 2);
assert.equal(ready.max_age_days, 7);
assert.equal(ready.candidate_artifact_id, candidate.artifact_id);

for (const mutate of [
  (x) => { x.status = 'pending_human'; },
  (x) => { x.platform = 'web'; },
  (x) => { x.app_check_token_observed = false; },
  (x) => { x.staging_project = 'tutop-3a4f7'; },
  (x) => { x.device_count = 1; },
  (x) => { x.contains_raw_token = true; },
  (x) => { x.verified_at = '2026-08-20T00:00:00.000Z'; },
]) {
  const evidence = structuredClone(valid);
  mutate(evidence);
  assert.equal(validateAppCheckPhysicalEvidence(evidence, now, candidate).ready, false);
}

const oneDevice = structuredClone(valid);
oneDevice.devices = [oneDevice.devices[0]];
oneDevice.device_count = 1;
assert(validateAppCheckPhysicalEvidence(oneDevice, now, candidate).errors.includes('two_device_evidence_required'));

const fakeCount = structuredClone(valid);
fakeCount.device_count = 2;
fakeCount.devices = [fakeCount.devices[0]];
assert.equal(validateAppCheckPhysicalEvidence(fakeCount, now, candidate).ready, false);

const duplicateSession = structuredClone(valid);
duplicateSession.devices[1].evidence_session_id = duplicateSession.devices[0].evidence_session_id;
assert(validateAppCheckPhysicalEvidence(duplicateSession, now, candidate).errors.includes('independent_evidence_sessions_required'));

const duplicateFingerprint = structuredClone(valid);
duplicateFingerprint.devices[1].profile_fingerprint_sha256 = duplicateFingerprint.devices[0].profile_fingerprint_sha256;
assert(validateAppCheckPhysicalEvidence(duplicateFingerprint, now, candidate).errors.includes('independent_device_fingerprints_required'));

const nonPhysical = structuredClone(valid);
nonPhysical.devices[1].physical = false;
assert.equal(validateAppCheckPhysicalEvidence(nonPhysical, now, candidate).ready, false);

const perDeviceStale = structuredClone(valid);
perDeviceStale.devices[1].verified_at = '2026-08-20T00:00:00.000Z';
assert.equal(validateAppCheckPhysicalEvidence(perDeviceStale, now, candidate).ready, false);

const rawNestedToken = structuredClone(valid);
rawNestedToken.devices[0].app_check_token = 'must-never-be-stored';
assert(validateAppCheckPhysicalEvidence(rawNestedToken, now, candidate).errors.includes('raw_token_must_not_be_stored'));

for (const [field, value, expectedError] of [
  ['candidate_apk_sha256', '71975f84cd26adb1526db895e76dcb455aed2f258e3f6cf01035c9fd90c95321', 'wrong_apk_candidate'],
  ['candidate_artifact_id', 10002002950, 'wrong_artifact_candidate'],
  ['candidate_build_run_id', 34075660334, 'wrong_build_run_candidate'],
  ['candidate_build_tree_sha', '0000000000000000000000000000000000000000', 'wrong_build_tree_candidate'],
]) {
  const staleCandidate = structuredClone(valid);
  staleCandidate[field] = value;
  const result = validateAppCheckPhysicalEvidence(staleCandidate, now, candidate);
  assert.equal(result.ready, false);
  assert(result.errors.includes(expectedError));
}

console.log('PASS historical 0.9.0 repository manifest remains the preserved App Check physical-evidence baseline');
console.log('PASS App Check enforcement accepts fresh verified Android evidence only against an explicit candidate');
console.log('PASS two independent A/B device records, sessions and sanitized fingerprints are required');
console.log('PASS fake device_count, duplicate evidence, stale devices and nested raw tokens fail closed');
console.log('App Check enforcement readiness contract: PASS');
