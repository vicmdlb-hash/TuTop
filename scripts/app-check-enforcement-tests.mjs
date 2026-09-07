import assert from 'node:assert/strict';
import { validateAppCheckPhysicalEvidence } from './app-check-enforcement-readiness.mjs';

const now = Date.parse('2026-09-06T23:40:00.000Z');
const valid = {
  status: 'verified',
  platform: 'android',
  app_version: '0.9.0-beta.0',
  staging_project: 'tutop-beta-vicmdlb-1356585881',
  candidate_apk_sha256: '57005fd59b0026645c8b7fe02cbc36a3876e93ba287ae9c6cd2cc323a567e493',
  candidate_artifact_id: 10002986519,
  candidate_build_run_id: 34078588228,
  candidate_build_tree_sha: 'd1d90343806871479d1685783d1c1e5db1b5c341',
  device_count: 2,
  app_check_token_observed: true,
  verified_at: '2026-09-06T23:35:00.000Z',
  contains_raw_token: false,
};
const ready = validateAppCheckPhysicalEvidence(valid, now);
assert.equal(ready.ready, true);
assert.equal(ready.min_device_count, 2);
assert.equal(ready.max_age_days, 7);
assert.equal(ready.candidate_artifact_id, 10002986519);

for (const mutate of [
  (x) => { x.status = 'pending_human'; },
  (x) => { x.platform = 'web'; },
  (x) => { x.app_check_token_observed = false; },
  (x) => { x.staging_project = 'tutop-3a4f7'; },
  (x) => { x.device_count = 1; },
  (x) => { x.contains_raw_token = true; },
  (x) => { x.verified_at = '2026-08-20T00:00:00.000Z'; },
]) {
  const candidate = structuredClone(valid);
  mutate(candidate);
  assert.equal(validateAppCheckPhysicalEvidence(candidate, now).ready, false);
}

const oneDevice = structuredClone(valid);
oneDevice.device_count = 1;
assert(validateAppCheckPhysicalEvidence(oneDevice, now).errors.includes('two_device_evidence_required'));

const eightDaysOld = structuredClone(valid);
eightDaysOld.verified_at = '2026-08-29T23:35:00.000Z';
assert(validateAppCheckPhysicalEvidence(eightDaysOld, now).errors.includes('evidence_stale_or_future'));

// Evidence from an older APK with the same semantic version must never unlock enforcement.
for (const [field, value, expectedError] of [
  ['candidate_apk_sha256', '71975f84cd26adb1526db895e76dcb455aed2f258e3f6cf01035c9fd90c95321', 'wrong_apk_candidate'],
  ['candidate_artifact_id', 10002002950, 'wrong_artifact_candidate'],
  ['candidate_build_run_id', 34075660334, 'wrong_build_run_candidate'],
  ['candidate_build_tree_sha', '0000000000000000000000000000000000000000', 'wrong_build_tree_candidate'],
]) {
  const staleCandidate = structuredClone(valid);
  staleCandidate[field] = value;
  const result = validateAppCheckPhysicalEvidence(staleCandidate, now);
  assert.equal(result.ready, false);
  assert(result.errors.includes(expectedError));
}

console.log('PASS App Check enforcement accepts fresh verified Android evidence only');
console.log('PASS enforcement requires at least two physical Android devices');
console.log('PASS App Check evidence older than seven days is rejected');
console.log('PASS pending/template evidence cannot unlock enforcement');
console.log('PASS historical Firebase and raw-token evidence are rejected');
console.log('PASS same-version evidence from a different APK/artifact/run/tree is rejected');
console.log('App Check enforcement readiness contract: PASS');
