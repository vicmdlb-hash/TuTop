import assert from 'node:assert/strict';
import { validateAppCheckPhysicalEvidence } from './app-check-enforcement-readiness.mjs';

const now = Date.parse('2026-09-06T23:40:00.000Z');
const valid = {
  status: 'verified',
  platform: 'android',
  app_version: '0.9.0-beta.0',
  staging_project: 'tutop-beta-vicmdlb-1356585881',
  device_count: 2,
  app_check_token_observed: true,
  verified_at: '2026-09-06T23:35:00.000Z',
  contains_raw_token: false,
};
const ready = validateAppCheckPhysicalEvidence(valid, now);
assert.equal(ready.ready, true);
assert.equal(ready.min_device_count, 2);
assert.equal(ready.max_age_days, 7);

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

console.log('PASS App Check enforcement accepts fresh verified Android evidence only');
console.log('PASS enforcement requires at least two physical Android devices');
console.log('PASS App Check evidence older than seven days is rejected');
console.log('PASS pending/template evidence cannot unlock enforcement');
console.log('PASS historical Firebase and raw-token evidence are rejected');
console.log('App Check enforcement readiness contract: PASS');
