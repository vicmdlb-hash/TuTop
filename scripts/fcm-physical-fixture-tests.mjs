import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFcmPhysicalFixture } from './fcm-physical-fixture-validator.mjs';
const candidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const binding = { artifact_id: candidate.artifact_id, build_run_id: candidate.build_run_id, build_tree_sha: candidate.build_tree_sha, apk_sha256: candidate.apk_sha256 };
const valid = {
  schema: 'tutop.fcm-physical-fixture.v1', candidate: binding, device_slot: 'A', evidence_session_id: 'fcm-session-device-a', scenarios: [
    { name: 'foreground', events: [
      { at_ms: 1, kind: 'app_foreground' }, { at_ms: 2, kind: 'push_received', correlation: 'fg-a001', target: 'chat' },
    ] },
    { name: 'background', events: [
      { at_ms: 10, kind: 'app_background' },
      { at_ms: 11, kind: 'push_received', correlation: 'bg-a001', target: 'listing' },
      { at_ms: 11.1, kind: 'push_received', correlation: 'bg-a002', target: 'chat' },
      { at_ms: 12, kind: 'push_action', correlation: 'bg-a001', target: 'listing' },
      { at_ms: 12.1, kind: 'push_action', correlation: 'bg-a002', target: 'chat' },
    ] },
    { name: 'cold_start', events: [
      { at_ms: 20, kind: 'app_boot' }, { at_ms: 21, kind: 'push_received', correlation: 'cs-a001', target: 'chat' }, { at_ms: 22, kind: 'push_action', correlation: 'cs-a001', target: 'chat', launch: 'cold_start' },
    ] },
    { name: 'deep_link', events: [
      { at_ms: 30, kind: 'push_received', correlation: 'dl-a001', target: 'listing' }, { at_ms: 31, kind: 'push_action', correlation: 'dl-a001', target: 'listing' }, { at_ms: 32, kind: 'route_opened', correlation: 'dl-a001', target: 'listing' },
    ] },
  ],
};
assert.equal(validateFcmPhysicalFixture(valid, candidate).pass, true);
const duplicate = structuredClone(valid); duplicate.scenarios[1].events.splice(3, 0, { at_ms: 11.5, kind: 'push_received', correlation: 'bg-a001', target: 'listing' });
assert.equal(validateFcmPhysicalFixture(duplicate, candidate).pass, false);
const reversed = structuredClone(valid); reversed.scenarios[2].events = [
  { at_ms: 20, kind: 'app_boot' }, { at_ms: 21, kind: 'push_action', correlation: 'cs-a001', target: 'chat', launch: 'cold_start' }, { at_ms: 22, kind: 'push_received', correlation: 'cs-a001', target: 'chat' },
];
assert.equal(validateFcmPhysicalFixture(reversed, candidate).pass, false);
const replay = structuredClone(valid); replay.scenarios[3].events[0].correlation = 'cs-a001'; replay.scenarios[3].events[1].correlation = 'cs-a001'; replay.scenarios[3].events[2].correlation = 'cs-a001';
assert.equal(validateFcmPhysicalFixture(replay, candidate).pass, false);
const targetMismatch = structuredClone(valid); targetMismatch.scenarios[1].events.find((event) => event.kind === 'push_action').target = 'chat';
assert.equal(validateFcmPhysicalFixture(targetMismatch, candidate).pass, false);
const duplicateAction = structuredClone(valid); duplicateAction.scenarios[1].events.push({ at_ms: 13, kind: 'push_action', correlation: 'bg-a001', target: 'listing' });
assert.equal(validateFcmPhysicalFixture(duplicateAction, candidate).pass, false);
const rebootReplay = structuredClone(valid); rebootReplay.scenarios[2].events.splice(1, 0, { at_ms: 20.5, kind: 'app_boot' });
assert.equal(validateFcmPhysicalFixture(rebootReplay, candidate).pass, false);
const invalidPayload = structuredClone(valid); invalidPayload.scenarios[0].events.push({ at_ms: 3, kind: 'push_invalid_payload' });
assert.equal(validateFcmPhysicalFixture(invalidPayload, candidate).pass, false);
const staleCandidate = structuredClone(valid); staleCandidate.candidate.apk_sha256 = '0'.repeat(64);
assert.equal(validateFcmPhysicalFixture(staleCandidate, candidate).pass, false);
const rawSecret = structuredClone(valid); rawSecret.notification_id = 'raw-id';
assert.equal(validateFcmPhysicalFixture(rawSecret, candidate).pass, false);
const missingSession = structuredClone(valid); missingSession.evidence_session_id = 'PENDIENTE';
assert.equal(validateFcmPhysicalFixture(missingSession, candidate).pass, false);
console.log('PASS multiple distinct simultaneous pushes can validate without false duplicate detection');
console.log('PASS duplicate/replayed correlations, duplicate taps, reboot replay and target mismatch fail closed');
console.log('PASS out-of-order, invalid payload, stale APK, raw identifiers and missing session fail closed');
console.log('FCM physical fixture contract: PASS');
