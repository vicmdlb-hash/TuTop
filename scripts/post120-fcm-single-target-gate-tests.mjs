import assert from 'node:assert/strict';
import { currentTokenOwnerRecords, eligibleRecipientTargets } from './fcm-token-ownership-lib.mjs';
import {
  PHYSICAL_QA_FCM_APPLY_ACK,
  loadActivePhysicalQaFcmAuthority,
  validatePhysicalQaFcmApplyGate,
  selectExactPhysicalNotification,
  selectExactPhysicalTarget,
} from './physical-qa-fcm-gate-lib.mjs';

// Synthetic authority prevents accidentally making a retired Build120/121
// manifest active. No Firebase token, credential, send, or staging usage.
const authority = {
  sha: 'a'.repeat(40),
  artifactId: 101,
  buildRunId: 202,
  apkSha256: 'b'.repeat(64),
  certSha256: 'c'.repeat(64),
};
const good = {
  apply: true,
  maintenanceAllow: 'staging-v2',
  ack: PHYSICAL_QA_FCM_APPLY_ACK,
  candidateSha: authority.sha,
  candidateArtifactId: authority.artifactId,
  candidateBuildRunId: authority.buildRunId,
  candidateApkSha256: authority.apkSha256,
  candidateCertSha256: authority.certSha256,
  notificationId: 'notification-1',
  recipientUid: 'synthetic-user-b',
  deviceTokenRecordId: 'device-record-b',
};
const dryRun = validatePhysicalQaFcmApplyGate({ apply: false }, authority);
assert.equal(dryRun.pass, true);
assert.equal(dryRun.mode, 'DRY_RUN');
assert.equal(dryRun.notificationId, '');
assert.equal(dryRun.deviceTokenRecordId, '');
const valid = validatePhysicalQaFcmApplyGate(good, authority);
assert.equal(valid.pass, true);
assert.equal(valid.mode, 'APPLY');
assert.equal(valid.notificationId, good.notificationId);
assert.equal(valid.deviceTokenRecordId, good.deviceTokenRecordId);
for (const [field, value] of [
  ['maintenanceAllow', 'wrong'],
  ['ack', 'WRONG'],
  ['candidateSha', '0'.repeat(40)],
  ['candidateArtifactId', 999],
  ['candidateBuildRunId', 999],
  ['candidateApkSha256', '0'.repeat(64)],
  ['candidateCertSha256', '0'.repeat(64)],
  ['notificationId', ''],
  ['recipientUid', ''],
  ['deviceTokenRecordId', ''],
  ['notificationId', 'bad/path'],
]) {
  const bad = { ...good, [field]: value };
  assert.equal(validatePhysicalQaFcmApplyGate(bad, authority).pass, false,
    `${field} mismatch must block apply`);
}
assert.equal(selectExactPhysicalNotification([
  { id: good.notificationId, recipient_uid: good.recipientUid },
], good.notificationId, good.recipientUid).id, good.notificationId);
assert.throws(() => selectExactPhysicalNotification([
  { id: good.notificationId, recipient_uid: 'old-user-a' },
], good.notificationId, good.recipientUid), /FCM_EXACT_NOTIFICATION_REQUIRED/);
assert.throws(() => selectExactPhysicalNotification([
  { id: good.notificationId, recipient_uid: good.recipientUid },
  { id: good.notificationId, recipient_uid: good.recipientUid },
], good.notificationId, good.recipientUid), /FCM_EXACT_NOTIFICATION_REQUIRED/);
assert.equal(selectExactPhysicalTarget([
  { id: good.deviceTokenRecordId },
], good.deviceTokenRecordId).id, good.deviceTokenRecordId);
assert.throws(() => selectExactPhysicalTarget([
  { id: 'device-record-a' },
], good.deviceTokenRecordId), /FCM_EXACT_DEVICE_TOKEN_RECORD_REQUIRED/);
assert.throws(() => selectExactPhysicalTarget([
  { id: good.deviceTokenRecordId },
  { id: good.deviceTokenRecordId },
], good.deviceTokenRecordId), /FCM_EXACT_DEVICE_TOKEN_RECORD_REQUIRED/);

// Validate owner-only selection with synthetic status and timestamp records.
const synthetic = (id, owner_uid, active, updated_at) => ({
  id, token: 'example-record', owner_uid, active, updated_at,
});
const activeRecord = synthetic('recent', 'beta', true, '2026-10-24T10:00:00Z');
const priorRecord = synthetic('prior', 'alpha', true, '2026-10-23T10:00:00Z');
assert.deepEqual(eligibleRecipientTargets([priorRecord, activeRecord], 'alpha'), []);
assert.deepEqual(eligibleRecipientTargets([priorRecord, activeRecord], 'beta').map(x => x.id), ['recent']);
assert.deepEqual(currentTokenOwnerRecords([priorRecord, { ...activeRecord, active: false }]), []);
assert.deepEqual(currentTokenOwnerRecords([priorRecord, { ...activeRecord, active: 'false' }]), []);
assert.deepEqual(currentTokenOwnerRecords([priorRecord, { ...activeRecord, updated_at: '' }]), []);
assert.deepEqual(currentTokenOwnerRecords([activeRecord, { ...activeRecord, id: 'conflict', active: false }]), []);
for (const invalidUpdate of ['not-a-date', '', null, 1234]) {
  const damaged = { ...activeRecord, updated_at: invalidUpdate, created_at: '2026-10-22T10:00:00Z' };
  assert.deepEqual(eligibleRecipientTargets([priorRecord, damaged], 'alpha'), [],
    'malformed newer update must never revive a prior FCM owner');
  assert.deepEqual(eligibleRecipientTargets([priorRecord, damaged], 'beta'), []);
}


// Default authority always rejects the historical disabled candidate.
assert.throws(() => loadActivePhysicalQaFcmAuthority(), /FCM_ACTIVE_CANDIDATE_REQUIRED/);
console.log('PASS synthetic exact-SHA/APK/cert/recipient/device FCM authorization; obsolete candidate fails closed');
