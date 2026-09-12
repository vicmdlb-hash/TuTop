import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTwoDeviceEvidence } from './physical-qa-two-device-gate.mjs';

const historical = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const exactSha = String(historical.build_commit_sha || '1'.repeat(40));
const candidate = {
  ...historical,
  physical_release_candidate: true,
  candidate_status: 'active_exact_head',
  replacement_required: false,
  build_commit_sha: exactSha,
  gate_commit_sha: exactSha,
  staging_smoke_commit_sha: exactSha,
  artifact_id: 10002986519,
  build_run_id: 34088114928,
  gate_run_id: 34088114001,
  staging_smoke_run_id: 34088114501,
};
const expected = {
  artifact_name: candidate.artifact_name,
  artifact_id: candidate.artifact_id,
  build_run_id: candidate.build_run_id,
  build_commit_sha: candidate.build_commit_sha,
  build_tree_sha: candidate.build_tree_sha,
  apk_sha256: candidate.apk_sha256,
  gate_run_id: candidate.gate_run_id,
  gate_commit_sha: candidate.gate_commit_sha,
  staging_smoke_run_id: candidate.staging_smoke_run_id,
  staging_smoke_commit_sha: candidate.staging_smoke_commit_sha,
};
const now = Date.parse('2026-09-07T04:30:00.000Z');
const allPass = Object.fromEntries([
  'install_boot','auth_identity','reinstall_identity','keyboard','android_back','lifecycle','safe_areas','rotation',
  'offline_reconnect','push_foreground','push_background','push_cold_start','push_deep_link','app_check_token_observed',
].map((key) => [key, 'pass']));

function fcmFixture(slot, session, startedAt, completedAt) {
  return {
    schema: 'tutop.fcm-physical-fixture.v1',
    candidate: { artifact_id: candidate.artifact_id, build_run_id: candidate.build_run_id, build_tree_sha: candidate.build_tree_sha, apk_sha256: candidate.apk_sha256 },
    device_slot: slot,
    evidence_session_id: session,
    evidence_started_at: startedAt,
    evidence_completed_at: completedAt,
    scenarios: [
      { name: 'foreground', events: [
        { at_ms: 1_000, kind: 'app_foreground' },
        { at_ms: 2_000, kind: 'push_received', correlation: `fg-${slot.toLowerCase()}001`, target: 'chat' },
      ] },
      { name: 'background', events: [
        { at_ms: 10_000, kind: 'app_background' },
        { at_ms: 11_000, kind: 'push_received', correlation: `bg-${slot.toLowerCase()}001`, target: 'listing' },
        { at_ms: 12_000, kind: 'push_action', correlation: `bg-${slot.toLowerCase()}001`, target: 'listing' },
      ] },
      { name: 'cold_start', events: [
        { at_ms: 20_000, kind: 'app_boot' },
        { at_ms: 21_000, kind: 'push_received', correlation: `cs-${slot.toLowerCase()}001`, target: 'chat' },
        { at_ms: 22_000, kind: 'push_action', correlation: `cs-${slot.toLowerCase()}001`, target: 'chat', launch: 'cold_start' },
      ] },
      { name: 'deep_link', events: [
        { at_ms: 30_000, kind: 'push_received', correlation: `dl-${slot.toLowerCase()}001`, target: 'listing' },
        { at_ms: 31_000, kind: 'push_action', correlation: `dl-${slot.toLowerCase()}001`, target: 'listing' },
        { at_ms: 32_000, kind: 'route_opened', correlation: `dl-${slot.toLowerCase()}001`, target: 'listing' },
      ] },
    ],
  };
}

function screenshots(slot, started) {
  return [
    { case: 'keyboard', captured_at: new Date(started + 36_000).toISOString(), sha256: (slot === 'A' ? '1' : '4').repeat(64) },
    { case: 'safe_areas', captured_at: new Date(started + 37_000).toISOString(), sha256: (slot === 'A' ? '2' : '5').repeat(64) },
    { case: 'rotation', captured_at: new Date(started + 38_000).toISOString(), sha256: (slot === 'A' ? '3' : '6').repeat(64) },
  ];
}

function bundle(slot, model, viewport, session, offset = 0) {
  const started = now - 60_000 + offset;
  const completed = now - 10_000 + offset;
  const startedAt = new Date(started).toISOString();
  const completedAt = new Date(completed).toISOString();
  return {
    schema: 'tutop.physical-qa-evidence.v1', app_version: '0.9.0-beta.0', environment: 'staging', candidate: expected,
    evidence_session_id: session,
    evidence_started_at: startedAt,
    evidence_completed_at: completedAt,
    device: { slot, label: `QA-${slot}`, manufacturer: 'SyntheticVendor', model, android_version: '15', viewport, installation: 'clean', physical: true },
    required_cases: allPass,
    diagnostic_report: {
      generated_at: new Date(started + 5_000).toISOString(), version: '0.9.0-beta.0', platform: 'android', native_runtime: true,
      viewport: { width: 412, height: 915, dpr: 2.6 }, online: true, visibility: 'visible',
      checks: [
        { key: 'staging-project', label: 'Firebase staging', status: 'pass', detail: 'ok' },
        { key: 'v2', label: 'Schema V2', status: 'pass', detail: 'ok' },
        { key: 'auth', label: 'Sesión', status: 'pass', detail: 'ok' },
        { key: 'identity', label: 'Identidad', status: 'pass', detail: 'ok' },
        { key: 'network', label: 'Conectividad', status: 'pass', detail: 'online' },
        { key: 'push-permission', label: 'Push', status: 'pass', detail: 'granted' },
        { key: 'app-check', label: 'App Check', status: 'pass', detail: 'observed' },
      ],
      events: [
        { at: new Date(started + 10_000).toISOString(), kind: 'app_boot', detail: 'android' },
        { at: new Date(started + 20_000).toISOString(), kind: 'network_offline', detail: 'seq=1' },
        { at: new Date(started + 25_000).toISOString(), kind: 'network_online', detail: 'seq=1' },
        { at: new Date(started + 30_000).toISOString(), kind: 'push_received', detail: 'target=chat correlation=abc123' },
        { at: new Date(started + 35_000).toISOString(), kind: 'push_action', detail: 'target=chat correlation=abc123' },
      ],
    },
    fcm_fixture_report: fcmFixture(slot, session, startedAt, completedAt),
    app_check_evidence: {
      device_slot: slot,
      evidence_session_id: session,
      observed: true,
      observed_at: new Date(started + 39_000).toISOString(),
      candidate_apk_sha256: candidate.apk_sha256,
      contains_raw_token: false,
    },
    screenshots: screenshots(slot, started),
    notes: 'synthetic contract fixture only',
  };
}
const a = bundle('A', 'Model-A', '412x915', 'session-device-a');
const b = bundle('B', 'Model-B', '360x800', 'session-device-b', -1_000);
assert.equal(validateTwoDeviceEvidence([a, b], now, candidate).pass, true);

assert.equal(validateTwoDeviceEvidence([a, { ...b, device: { ...b.device, model: a.device.model, viewport: a.device.viewport } }], now, candidate).pass, false);
assert.equal(validateTwoDeviceEvidence([a, { ...b, evidence_session_id: a.evidence_session_id }], now, candidate).pass, false);

const reversed = structuredClone(b); reversed.evidence_started_at = b.evidence_completed_at; reversed.evidence_completed_at = b.evidence_started_at;
assert.equal(validateTwoDeviceEvidence([a, reversed], now, candidate).pass, false);
const stale = structuredClone(b); stale.evidence_started_at = new Date(now - 26 * 60 * 60_000).toISOString(); stale.evidence_completed_at = new Date(now - 25 * 60 * 60_000).toISOString();
assert.equal(validateTwoDeviceEvidence([a, stale], now, candidate).pass, false);
const unordered = structuredClone(b); [unordered.diagnostic_report.events[0], unordered.diagnostic_report.events[1]] = [unordered.diagnostic_report.events[1], unordered.diagnostic_report.events[0]];
assert.equal(validateTwoDeviceEvidence([a, unordered], now, candidate).pass, false);

const reusedScreenshot = structuredClone(b);
reusedScreenshot.screenshots[0].sha256 = a.screenshots[0].sha256;
assert.equal(validateTwoDeviceEvidence([a, reusedScreenshot], now, candidate).pass, false);

const reusedFcmCorrelation = structuredClone(b);
reusedFcmCorrelation.fcm_fixture_report.scenarios[0].events[1].correlation = a.fcm_fixture_report.scenarios[0].events[1].correlation;
assert.equal(validateTwoDeviceEvidence([a, reusedFcmCorrelation], now, candidate).pass, false);

const missingVisual = structuredClone(b);
missingVisual.screenshots = missingVisual.screenshots.filter((shot) => shot.case !== 'rotation');
assert.equal(validateTwoDeviceEvidence([a, missingVisual], now, candidate).pass, false);

const mismatchedFcmSession = structuredClone(b);
mismatchedFcmSession.fcm_fixture_report.evidence_session_id = 'another-session';
assert.equal(validateTwoDeviceEvidence([a, mismatchedFcmSession], now, candidate).pass, false);

const fcmOutsideWindow = structuredClone(b);
fcmOutsideWindow.fcm_fixture_report.scenarios[3].events[2].at_ms = 80_000;
assert.equal(validateTwoDeviceEvidence([a, fcmOutsideWindow], now, candidate).pass, false);

const appCheckWrongSession = structuredClone(b);
appCheckWrongSession.app_check_evidence.evidence_session_id = 'another-session';
assert.equal(validateTwoDeviceEvidence([a, appCheckWrongSession], now, candidate).pass, false);

const wrongGateBinding = structuredClone(b);
wrongGateBinding.candidate.gate_commit_sha = '0'.repeat(40);
assert.equal(validateTwoDeviceEvidence([a, wrongGateBinding], now, candidate).pass, false);

const invalidCandidate = { ...candidate, staging_smoke_commit_sha: '0'.repeat(40) };
assert.equal(validateTwoDeviceEvidence([a, b], now, invalidCandidate).pass, false);

const templateA = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_A_0.9.json', 'utf8'));
const templateB = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_B_0.9.json', 'utf8'));
assert.equal(validateTwoDeviceEvidence([templateA, templateB], now, candidate).pass, false);
console.log('PASS two distinct fresh physical sessions can satisfy the combined gate');
console.log('PASS duplicate device/session, screenshot and cross-device FCM replay evidence fail closed');
console.log('PASS visual evidence, FCM session/window and per-device App Check binding are required');
console.log('PASS evidence is bound to exact gate/staging/build candidate identity');
console.log('PASS reversed, stale and out-of-order evidence sessions fail closed');
console.log('PASS Device A/B templates remain blocked until real evidence exists');
console.log('Two-device Physical QA contract: PASS');
