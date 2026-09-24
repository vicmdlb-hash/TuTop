import fs from 'node:fs';
import assert from 'node:assert/strict';

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

for(const field of ['artifact_id','build_run_id','build_tree_sha','apk_sha256']) {
  assert.equal(fixture.candidate[field],candidate[field],`fixture drift: ${field}`);
}
assert.equal(fixture.candidate.apk_cert_sha256,candidate.apk_cert_sha256);
assert.equal(fixture.two_device_required,true);
assert.equal(fixture.account_switch_isolation_required,true);
assert.match(fixture.evidence_session_id,/PENDIENTE/);
assert.doesNotMatch(JSON.stringify(fixture),/"token"|"fcm_token"|"notification_id"|"phone"|"uid"/i);

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

console.log('PASS FCM physical fixture is exact-Build121, two-device required, and sender is single-notification/single-device scoped to active candidate identity');
