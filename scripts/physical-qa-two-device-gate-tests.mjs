import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTwoDeviceEvidence } from './physical-qa-two-device-gate.mjs';

const candidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const expected = {
  artifact_name: candidate.artifact_name,
  artifact_id: candidate.artifact_id,
  build_run_id: candidate.build_run_id,
  build_commit_sha: candidate.build_commit_sha,
  build_tree_sha: candidate.build_tree_sha,
  apk_sha256: candidate.apk_sha256,
};
const now = Date.now();
const allPass = Object.fromEntries([
  'install_boot','auth_identity','reinstall_identity','keyboard','android_back','lifecycle','safe_areas','rotation',
  'offline_reconnect','push_foreground','push_background','push_cold_start','push_deep_link','app_check_token_observed',
].map((key) => [key, 'pass']));
function bundle(slot, model, viewport, session) {
  return {
    schema: 'tutop.physical-qa-evidence.v1', app_version: '0.9.0-beta.0', environment: 'staging', candidate: expected,
    evidence_session_id: session,
    device: { slot, label: `QA-${slot}`, manufacturer: 'SyntheticVendor', model, android_version: '15', viewport, installation: 'clean', physical: true },
    required_cases: allPass,
    diagnostic_report: {
      generated_at: new Date(now - 1000).toISOString(), version: '0.9.0-beta.0', platform: 'android', native_runtime: true,
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
        { at: new Date(now - 900).toISOString(), kind: 'app_boot', detail: 'android' },
        { at: new Date(now - 800).toISOString(), kind: 'network_offline', detail: 'seq=1' },
        { at: new Date(now - 700).toISOString(), kind: 'network_online', detail: 'seq=1' },
        { at: new Date(now - 600).toISOString(), kind: 'push_received', detail: 'target=chat correlation=abc123' },
        { at: new Date(now - 500).toISOString(), kind: 'push_action', detail: 'target=chat correlation=abc123' },
      ],
    }, screenshots: [], notes: 'synthetic contract fixture only',
  };
}
const a = bundle('A', 'Model-A', '412x915', 'session-device-a');
const b = bundle('B', 'Model-B', '360x800', 'session-device-b');
assert.equal(validateTwoDeviceEvidence([a, b], now, candidate).pass, true);
assert.equal(validateTwoDeviceEvidence([a, { ...b, device: { ...b.device, model: a.device.model, viewport: a.device.viewport } }], now, candidate).pass, false);
assert.equal(validateTwoDeviceEvidence([a, { ...b, evidence_session_id: a.evidence_session_id }], now, candidate).pass, false);
const templateA = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_A_0.9.json', 'utf8'));
const templateB = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_B_0.9.json', 'utf8'));
assert.equal(validateTwoDeviceEvidence([templateA, templateB], now, candidate).pass, false);
console.log('PASS two distinct physical bundles can satisfy the combined gate');
console.log('PASS duplicate device/session evidence fails closed');
console.log('PASS Device A/B templates remain blocked until real evidence exists');
console.log('Two-device Physical QA contract: PASS');
