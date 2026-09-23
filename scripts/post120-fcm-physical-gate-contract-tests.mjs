import fs from 'node:fs';
import assert from 'node:assert/strict';

const candidate=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json','utf8'));
const sender=fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');

assert.equal(candidate.app_version,'0.9.2-beta.10');
assert.equal(candidate.build_commit_sha,'554f4ef6d0429b0059738d8cd6e1b6e4890bda91');
assert.equal(candidate.artifact_id,10622421310);
assert.equal(candidate.build_run_id,35560814829);
assert.equal(candidate.build_tree_sha,'61485d3c218cc553a230be09dab3217b2774b44e');
assert.equal(candidate.apk_sha256,'9855a2e51587f3115f9c270c28d61b1f5c4aa4db7813dacc16b3fe700d458cc0');

for(const field of ['artifact_id','build_run_id','build_tree_sha','apk_sha256']) {
  assert.equal(fixture.candidate[field],candidate[field],`fixture drift: ${field}`);
}
assert.match(fixture.evidence_session_id,/PENDIENTE/);
assert.doesNotMatch(JSON.stringify(fixture),/"token"|"fcm_token"|"notification_id"|"phone"|"uid"/i);

assert.match(sender,/validateBuild120FcmApplyGate/);
assert.match(sender,/selectExactPhysicalNotification/);
assert.match(sender,/selectExactPhysicalTarget/);
assert.match(sender,/single_target_apply_guard/);
assert.match(sender,/selected_device_token_record_id/);

console.log('PASS FCM physical fixture is exact-Build120 and apply sender is single-notification/single-device scoped');
