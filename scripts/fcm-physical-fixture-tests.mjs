import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFcmPhysicalFixture } from './fcm-physical-fixture-validator.mjs';
const candidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const binding = { artifact_id: candidate.artifact_id, build_run_id: candidate.build_run_id, build_tree_sha: candidate.build_tree_sha, apk_sha256: candidate.apk_sha256 };
const now = Date.parse('2026-09-07T04:30:00.000Z');
const startedAt = '2026-09-07T04:29:00.000Z';
const completedAt = '2026-09-07T04:29:50.000Z';
const valid = {
  schema: 'tutop.fcm-physical-fixture.v1', candidate: binding, device_slot: 'A',
  evidence_session_id: 'fcm-session-device-a', evidence_started_at: startedAt, evidence_completed_at: completedAt,
  scenarios: [
    { name: 'foreground', events: [
      { at_ms: 1_000, kind: 'app_foreground' }, { at_ms: 2_000, kind: 'push_received', correlation: 'fg-a001', target: 'chat' },
    ] },
    { name: 'background', events: [
      { at_ms: 10_000, kind: 'app_background' },
      { at_ms: 11_000, kind: 'push_received', correlation: 'bg-a001', target: 'listing' },
      { at_ms: 11_100, kind: 'push_received', correlation: 'bg-a002', target: 'chat' },
      { at_ms: 12_000, kind: 'push_action', correlation: 'bg-a001', target: 'listing' },
      { at_ms: 12_100, kind: 'push_action', correlation: 'bg-a002', target: 'chat' },
    ] },
    { name: 'cold_start', events: [
      { at_ms: 20_000, kind: 'app_boot' }, { at_ms: 21_000, kind: 'push_received', correlation: 'cs-a001', target: 'chat' }, { at_ms: 22_000, kind: 'push_action', correlation: 'cs-a001', target: 'chat', launch: 'cold_start' },
    ] },
    { name: 'deep_link', events: [
      { at_ms: 30_000, kind: 'push_received', correlation: 'dl-a001', target: 'listing' }, { at_ms: 31_000, kind: 'push_action', correlation: 'dl-a001', target: 'listing' }, { at_ms: 32_000, kind: 'route_opened', correlation: 'dl-a001', target: 'listing' },
    ] },
  ],
};
assert.equal(validateFcmPhysicalFixture(valid, candidate, now).pass, true);
const duplicate = structuredClone(valid); duplicate.scenarios[1].events.splice(3, 0, { at_ms: 11_500, kind: 'push_received', correlation: 'bg-a001', target: 'listing' });
assert.equal(validateFcmPhysicalFixture(duplicate, candidate, now).pass, false);
const reversed = structuredClone(valid); reversed.scenarios[2].events = [
  { at_ms: 20_000, kind: 'app_boot' }, { at_ms: 21_000, kind: 'push_action', correlation: 'cs-a001', target: 'chat', launch: 'cold_start' }, { at_ms: 22_000, kind: 'push_received', correlation: 'cs-a001', target: 'chat' },
];
assert.equal(validateFcmPhysicalFixture(reversed, candidate, now).pass, false);
const replay = structuredClone(valid); replay.scenarios[3].events[0].correlation = 'cs-a001'; replay.scenarios[3].events[1].correlation = 'cs-a001'; replay.scenarios[3].events[2].correlation = 'cs-a001';
assert.equal(validateFcmPhysicalFixture(replay, candidate, now).pass, false);
const targetMismatch = structuredClone(valid); targetMismatch.scenarios[1].events.find((event) => event.kind === 'push_action').target = 'chat';
assert.equal(validateFcmPhysicalFixture(targetMismatch, candidate, now).pass, false);
const duplicateAction = structuredClone(valid); duplicateAction.scenarios[1].events.push({ at_ms: 13_000, kind: 'push_action', correlation: 'bg-a001', target: 'listing' });
assert.equal(validateFcmPhysicalFixture(duplicateAction, candidate, now).pass, false);
const rebootReplay = structuredClone(valid); rebootReplay.scenarios[2].events.splice(1, 0, { at_ms: 20_500, kind: 'app_boot' });
assert.equal(validateFcmPhysicalFixture(rebootReplay, candidate, now).pass, false);
const invalidPayload = structuredClone(valid); invalidPayload.scenarios[0].events.push({ at_ms: 3_000, kind: 'push_invalid_payload' });
assert.equal(validateFcmPhysicalFixture(invalidPayload, candidate, now).pass, false);
const staleCandidate = structuredClone(valid); staleCandidate.candidate.apk_sha256 = '0'.repeat(64);
assert.equal(validateFcmPhysicalFixture(staleCandidate, candidate, now).pass, false);
const rawSecret = structuredClone(valid); rawSecret.notification_id = 'raw-id';
assert.equal(validateFcmPhysicalFixture(rawSecret, candidate, now).pass, false);
const missingSession = structuredClone(valid); missingSession.evidence_session_id = 'PENDIENTE';
assert.equal(validateFcmPhysicalFixture(missingSession, candidate, now).pass, false);
const outsideWindow = structuredClone(valid); outsideWindow.scenarios[3].events[2].at_ms = 51_000;
assert.equal(validateFcmPhysicalFixture(outsideWindow, candidate, now).pass, false);
const staleWindow = structuredClone(valid); staleWindow.evidence_started_at = '2026-09-05T01:00:00.000Z'; staleWindow.evidence_completed_at = '2026-09-05T01:01:00.000Z';
assert.equal(validateFcmPhysicalFixture(staleWindow, candidate, now).pass, false);
const futureWindow = structuredClone(valid); futureWindow.evidence_started_at = '2026-09-07T05:00:00.000Z'; futureWindow.evidence_completed_at = '2026-09-07T05:01:00.000Z';
assert.equal(validateFcmPhysicalFixture(futureWindow, candidate, now).pass, false);
const unknownKind = structuredClone(valid); unknownKind.scenarios[0].events.push({ at_ms: 3_000, kind: 'mystery_event' });
assert.equal(validateFcmPhysicalFixture(unknownKind, candidate, now).pass, false);
console.log('PASS multiple distinct simultaneous pushes can validate without false duplicate detection');
console.log('PASS duplicate/replayed correlations, duplicate taps, reboot replay and target mismatch fail closed');
console.log('PASS event/window timing, unknown kinds, invalid payload, stale APK and raw identifiers fail closed');
console.log('FCM physical fixture contract: PASS');
