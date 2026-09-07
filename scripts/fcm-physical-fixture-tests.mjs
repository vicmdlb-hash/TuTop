import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFcmPhysicalFixture } from './fcm-physical-fixture-validator.mjs';
const candidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const binding = { artifact_id: candidate.artifact_id, build_run_id: candidate.build_run_id, build_tree_sha: candidate.build_tree_sha, apk_sha256: candidate.apk_sha256 };
const valid = {
  schema: 'tutop.fcm-physical-fixture.v1', candidate: binding, device_slot: 'A', scenarios: [
    { name: 'foreground', events: [
      { at_ms: 1, kind: 'app_foreground' }, { at_ms: 2, kind: 'push_received', correlation: 'fg-a1', target: 'chat' },
    ] },
    { name: 'background', events: [
      { at_ms: 10, kind: 'app_background' }, { at_ms: 11, kind: 'push_received', correlation: 'bg-a1', target: 'listing' }, { at_ms: 12, kind: 'push_action', correlation: 'bg-a1', target: 'listing' },
    ] },
    { name: 'cold_start', events: [
      { at_ms: 20, kind: 'app_boot' }, { at_ms: 21, kind: 'push_received', correlation: 'cs-a1', target: 'chat' }, { at_ms: 22, kind: 'push_action', correlation: 'cs-a1', target: 'chat', launch: 'cold_start' },
    ] },
    { name: 'deep_link', events: [
      { at_ms: 30, kind: 'push_received', correlation: 'dl-a1', target: 'listing' }, { at_ms: 31, kind: 'push_action', correlation: 'dl-a1', target: 'listing' }, { at_ms: 32, kind: 'route_opened', correlation: 'dl-a1', target: 'listing' },
    ] },
  ],
};
assert.equal(validateFcmPhysicalFixture(valid, candidate).pass, true);
const duplicate = structuredClone(valid); duplicate.scenarios[1].events.splice(2, 0, { at_ms: 11.5, kind: 'push_received', correlation: 'bg-a1', target: 'listing' });
assert.equal(validateFcmPhysicalFixture(duplicate, candidate).pass, false);
const reversed = structuredClone(valid); reversed.scenarios[2].events = [
  { at_ms: 20, kind: 'app_boot' }, { at_ms: 21, kind: 'push_action', correlation: 'cs-a1', target: 'chat', launch: 'cold_start' }, { at_ms: 22, kind: 'push_received', correlation: 'cs-a1', target: 'chat' },
];
assert.equal(validateFcmPhysicalFixture(reversed, candidate).pass, false);
const invalidPayload = structuredClone(valid); invalidPayload.scenarios[0].events.push({ at_ms: 3, kind: 'push_invalid_payload' });
assert.equal(validateFcmPhysicalFixture(invalidPayload, candidate).pass, false);
const staleCandidate = structuredClone(valid); staleCandidate.candidate.apk_sha256 = '0'.repeat(64);
assert.equal(validateFcmPhysicalFixture(staleCandidate, candidate).pass, false);
const rawSecret = structuredClone(valid); rawSecret.notification_id = 'raw-id';
assert.equal(validateFcmPhysicalFixture(rawSecret, candidate).pass, false);
console.log('PASS canonical foreground/background/cold-start/deep-link fixture validates');
console.log('PASS duplicate, out-of-order, invalid payload and stale APK fixtures fail closed');
console.log('PASS raw notification identifiers are forbidden');
console.log('FCM physical fixture contract: PASS');
