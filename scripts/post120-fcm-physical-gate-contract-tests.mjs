import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadActivePhysicalQaFcmAuthority } from './physical-qa-fcm-gate-lib.mjs';

// Fixture inspection only. This test must NEVER promote the historical manifest.
const candidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const fixture = JSON.parse(fs.readFileSync('docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json', 'utf8'));
const sender = fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs', 'utf8');

assert.equal(candidate.schema, 'tutop.physical-qa-candidate.v1');
assert.equal(candidate.environment, 'staging');
assert.equal(candidate.application_id, 'mx.tutop.app');
for (const field of ['artifact_id', 'build_run_id', 'build_tree_sha', 'apk_sha256']) {
  assert.equal(fixture.candidate[field], candidate[field], `fixture identity drift: ${field}`);
}
assert.match(fixture.evidence_session_id, /PENDIENTE/);
assert.doesNotMatch(JSON.stringify(fixture), /"(?:token|fcm_token|notification_id|phone|uid)"/i);
assert.match(sender, /validatePhysicalQaFcmApplyGate/);
assert.doesNotMatch(sender, /validateBuild120FcmApplyGate/);
assert.match(sender, /selectExactPhysicalNotification/);
assert.match(sender, /selectExactPhysicalTarget/);
assert.match(sender, /single_target_apply_guard/);
assert.match(sender, /selected_device_token_record_id/);
for (const name of [
  'TUTOP_FCM_PHYSICAL_CANDIDATE_SHA',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_ARTIFACT_ID',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_BUILD_RUN_ID',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_APK_SHA256',
  'TUTOP_FCM_PHYSICAL_CANDIDATE_CERT_SHA256',
]) assert.ok(sender.includes(name), `missing exact-identity selector ${name}`);

if (candidate.physical_release_candidate !== true) {
  assert.throws(() => loadActivePhysicalQaFcmAuthority(), /FCM_ACTIVE_CANDIDATE_REQUIRED/,
    'retired/obsolete manifest must not authorize a real FCM send');
  console.log('PASS old candidate is explicitly disabled for physical FCM; no send performed');
} else {
  assert.equal(candidate.candidate_status, 'active_exact_head');
  assert.equal(candidate.replacement_required, false);
  assert.equal(loadActivePhysicalQaFcmAuthority().sha, candidate.build_commit_sha);
  console.log('PASS source fixture bound to formally active candidate; no send performed');
}
console.log('PASS current FCM sender requires full identity and single-target authorization (static)');
