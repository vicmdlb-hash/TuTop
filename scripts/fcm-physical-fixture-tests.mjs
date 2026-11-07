import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFcmPhysicalFixture } from './fcm-physical-fixture-validator.mjs';
// The real Build120 manifest must stay obsolete. Test valid evidence only
// with an injected, clearly synthetic active candidate (never persisted).
const historicalCandidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const candidate = {
  ...historicalCandidate,
  candidate_status: 'active_exact_head',
  physical_release_candidate: true,
  replacement_required: false,
  apk_cert_sha256: 'c'.repeat(64),
};
const binding = Object.fromEntries([
  'artifact_id', 'build_run_id', 'build_commit_sha',
  'build_tree_sha', 'apk_sha256', 'apk_cert_sha256',
].map(field => [field, candidate[field]]));
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
const retiredCandidate = validateFcmPhysicalFixture(valid, historicalCandidate, now);
assert.equal(retiredCandidate.pass, false, 'retired Build120 may not validate FCM physical evidence');
assert(retiredCandidate.errors.includes('candidato físico no activo'));
for (const update of [
  { physical_release_candidate: false },
  { candidate_status: 'draft' },
  { replacement_required: true },
  { environment: 'production' },
  { application_id: 'other.app' },
  { staging_project: 'other-project' },
  { apk_cert_sha256: undefined },
]) {
  const rejectedCandidate = { ...candidate, ...update };
  assert.equal(validateFcmPhysicalFixture(valid, rejectedCandidate, now).pass, false);
}
for (const field of ['build_commit_sha', 'apk_cert_sha256']) {
  const mismatchedEvidence = structuredClone(valid);
  mismatchedEvidence.candidate[field] = field === 'build_commit_sha' ? 'f'.repeat(40) : 'f'.repeat(64);
  assert.equal(validateFcmPhysicalFixture(mismatchedEvidence, candidate, now).pass, false, field);
}

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
// Synthetic adversarial traces: the app state must PRECEDE a receipt, and
// the latest state cannot contradict the claimed foreground/background case.
const foregroundAfterReceive = structuredClone(valid);
foregroundAfterReceive.scenarios[0].events = [
  { at_ms: 1_000, kind: 'push_received', correlation: 'fg-a001', target: 'chat' },
  { at_ms: 2_000, kind: 'app_foreground' },
];
assert.equal(validateFcmPhysicalFixture(foregroundAfterReceive, candidate, now).pass, false);

const backgroundAfterReceive = structuredClone(valid);
backgroundAfterReceive.scenarios[1].events = [
  { at_ms: 10_000, kind: 'push_received', correlation: 'bg-a001', target: 'listing' },
  { at_ms: 11_000, kind: 'app_background' },
  { at_ms: 12_000, kind: 'push_action', correlation: 'bg-a001', target: 'listing' },
];
assert.equal(validateFcmPhysicalFixture(backgroundAfterReceive, candidate, now).pass, false);

const staleBackgroundState = structuredClone(valid);
staleBackgroundState.scenarios[1].events.splice(1, 0,
  { at_ms: 10_500, kind: 'app_foreground' });
assert.equal(validateFcmPhysicalFixture(staleBackgroundState, candidate, now).pass, false);

const exposedFcmToken = structuredClone(valid);
exposedFcmToken.fcmToken = 'synthetic-token-value-do-not-use';
assert.equal(validateFcmPhysicalFixture(exposedFcmToken, candidate, now).pass, false);

const exposedNestedAccessToken = structuredClone(valid);
exposedNestedAccessToken.scenarios[0].events[0].access_token = 'synthetic-access-token';
assert.equal(validateFcmPhysicalFixture(exposedNestedAccessToken, candidate, now).pass, false);

const mixedCaseSecret = structuredClone(valid);
mixedCaseSecret.scenarios[0].events[0].FCMTOKEN = 'synthetic-not-real';
assert.equal(validateFcmPhysicalFixture(mixedCaseSecret, candidate, now).pass, false);
const rawAppCheckSecret = structuredClone(valid);
rawAppCheckSecret.APP_CHECK_TOKEN = 'synthetic-not-real';
assert.equal(validateFcmPhysicalFixture(rawAppCheckSecret, candidate, now).pass, false);

// An adversarial fixture must reject aliases that differ only by separators,
// casing or a common header prefix, including when nested in an event.
for (const alias of [
  'refresh-token', 'device_token', 'X-Api-Key', 'auth_token', 'bearer-token',
  'client-secret', 'private_key', 'Phone_Number', 'EMAIL', 'set-cookie',
]) {
  const exposedAlias = structuredClone(valid);
  exposedAlias.scenarios[0].events[0][alias] = 'synthetic-not-a-real-credential';
  assert.equal(validateFcmPhysicalFixture(exposedAlias, candidate, now).pass, false, alias);
}
const nestedSensitiveHeader = structuredClone(valid);
nestedSensitiveHeader.scenarios[1].events[0].metadata = {
  headers: { 'X-Api-Key': 'synthetic-not-a-real-credential' },
};
assert.equal(validateFcmPhysicalFixture(nestedSensitiveHeader, candidate, now).pass, false);
const safeMetadata = structuredClone(valid);
safeMetadata.scenarios[0].events[0].metadata = { device_slot: 'A', event_count: 2 };
assert.equal(validateFcmPhysicalFixture(safeMetadata, candidate, now).pass, true);

// Evidence must contain only logical destination categories and opaque
// session IDs. No raw contact data, URLs or resource IDs are permitted.
for (const target of [
  'user@example.com', '+525512345678', 'https://example.com/chat',
  'chat/private-id', 'chat:private-id', 'chat some-person', 'private-id',
]) {
  const invalidSensitiveTarget = structuredClone(valid);
  invalidSensitiveTarget.scenarios[3].events
    .filter((event) => Object.hasOwn(event, 'target'))
    .forEach((event) => { event.target = target; });
  const result = validateFcmPhysicalFixture(invalidSensitiveTarget, candidate, now);
  assert.equal(result.pass, false, 'nonlogical target must be rejected');
  assert(result.errors.some((e) => e.includes('destino lógico no permitido')));
}
for (const target of ['transaction', 'saved_search', 'inbox']) {
  const safeLogicalTarget = structuredClone(valid);
  safeLogicalTarget.scenarios[3].events
    .filter((event) => Object.hasOwn(event, 'target'))
    .forEach((event) => { event.target = target; });
  assert.equal(validateFcmPhysicalFixture(safeLogicalTarget, candidate, now).pass, true, target);
}
for (const sessionId of ['user@example.com', 'https://example.com/id', 'A', 'a space', 'PENDIENTE']) {
  const unsafeSession = structuredClone(valid);
  unsafeSession.evidence_session_id = sessionId;
  assert.equal(validateFcmPhysicalFixture(unsafeSession, candidate, now).pass, false, sessionId);
}
const safeOpaqueSession = structuredClone(valid);
safeOpaqueSession.evidence_session_id = 'qa-device-b-opaque-82931';
assert.equal(validateFcmPhysicalFixture(safeOpaqueSession, candidate, now).pass, true);

console.log('PASS multiple distinct simultaneous pushes can validate without false duplicate detection');
console.log('PASS duplicate/replayed correlations, duplicate taps, reboot replay and target mismatch fail closed');
console.log('PASS event/window timing, prior app-state consistency, sensitive token names, unknown kinds, invalid payload and stale APK fail closed');
console.log('FCM physical fixture contract: PASS');
