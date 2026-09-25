import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateFcmPhysicalFixture } from './fcm-physical-fixture-validator.mjs';

const candidate=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json','utf8'));
const sender=fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');

assert.equal(candidate.app_version,'0.9.2-beta.11');
assert.equal(candidate.build_commit_sha,'579bdecd7e193b8661276f114b9d3e097792d8d6');
assert.equal(candidate.artifact_id,10835643904);
assert.equal(candidate.build_run_id,36064382977);
assert.equal(candidate.build_tree_sha,'99e3d1952be7eccc7ed6bdd090f4435b305648ee');
assert.equal(candidate.apk_sha256,'acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8');
assert.equal(candidate.apk_cert_sha256,'192B19F3E67ED7B69FA6862429E232B892979A6C8C97800845F6A1D1948FF79A');
assert.equal(candidate.physical_release_candidate,true);
assert.equal(candidate.candidate_status,'active_exact_head');

for(const field of ['artifact_id','artifact_url','artifact_digest','build_run_id','build_commit_sha','build_tree_sha','apk_sha256','apk_cert_sha256']) {
  assert.equal(fixture.candidate[field],candidate[field],`fixture drift: ${field}`);
}
assert.equal(fixture.two_device_required,true);
assert.equal(fixture.account_switch_isolation_required,true);
assert.match(fixture.evidence_session_id,/PENDIENTE/);
assert.doesNotMatch(JSON.stringify(fixture),/"token"|"fcm_token"|"notification_id"|"phone"|"uid"/i);

const now = Date.parse('2026-09-25T03:40:00.000Z');
const started = '2026-09-25T03:30:00.000Z';
const completed = '2026-09-25T03:35:00.000Z';
const validFixture = {
  ...fixture,
  device_slot: 'B',
  evidence_session_id: 'fcm-build121-device-b',
  evidence_started_at: started,
  evidence_completed_at: completed,
  scenarios: [
    { name: 'foreground', events: [
      { at_ms: 1000, kind: 'app_foreground' },
      { at_ms: 2000, kind: 'push_received', correlation: 'fg-b121', target: 'chat' },
    ] },
    { name: 'background', events: [
      { at_ms: 10000, kind: 'app_background' },
      { at_ms: 11000, kind: 'push_received', correlation: 'bg-b121', target: 'listing' },
      { at_ms: 12000, kind: 'push_action', correlation: 'bg-b121', target: 'listing' },
    ] },
    { name: 'cold_start', events: [
      { at_ms: 20000, kind: 'app_boot' },
      { at_ms: 21000, kind: 'push_received', correlation: 'cs-b121', target: 'chat' },
      { at_ms: 22000, kind: 'push_action', correlation: 'cs-b121', target: 'chat', launch: 'cold_start' },
    ] },
    { name: 'deep_link', events: [
      { at_ms: 30000, kind: 'push_received', correlation: 'dl-b121', target: 'listing' },
      { at_ms: 31000, kind: 'push_action', correlation: 'dl-b121', target: 'listing' },
      { at_ms: 32000, kind: 'route_opened', correlation: 'dl-b121', target: 'listing' },
    ] },
  ],
};
assert.equal(validateFcmPhysicalFixture(validFixture,candidate,now).pass,true);
for (const mutate of [
  (x) => { x.candidate.artifact_url = 'https://example.invalid/wrong'; },
  (x) => { x.candidate.artifact_digest = 'sha256:' + '0'.repeat(64); },
  (x) => { x.candidate.build_commit_sha = '0'.repeat(40); },
  (x) => { x.candidate.apk_cert_sha256 = '0'.repeat(64); },
  (x) => { x.two_device_required = false; },
  (x) => { x.account_switch_isolation_required = false; },
]) {
  const invalid = structuredClone(validFixture);
  mutate(invalid);
  assert.equal(validateFcmPhysicalFixture(invalid,candidate,now).pass,false);
}

assert.match(sender,/validatePhysicalQaFcmApplyGate/);
assert.doesNotMatch(sender,/validateBuild120FcmApplyGate/);
for(const env of [
  'TUTOP_FCM_PHYSICAL_CANDIDATE_SHA',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_ARTIFACT_ID',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_BUILD_RUN_ID',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_APK_SHA256',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_CERT_SHA256',
]) assert.match(sender,new RegExp(env));
assert.match(sender,/selectExactPhysicalNotification/);
assert.match(sender,/selectExactPhysicalTarget/);
assert.match(sender,/single_target_apply_guard/);
assert.match(sender,/selected_device_token_record_id/);

console.log('PASS FCM physical fixture is exact-Build121 across artifact/digest/commit/APK/cert identity');
console.log('PASS FCM validator rejects disabled two-device/account-switch gates and candidate identity drift');
console.log('PASS sender is single-notification/single-device scoped to active candidate identity');
