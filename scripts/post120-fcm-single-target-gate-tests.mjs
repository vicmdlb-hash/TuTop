import assert from 'node:assert/strict';
import {
  PHYSICAL_QA_FCM_APPLY_ACK,
  loadActivePhysicalQaFcmAuthority,
  validatePhysicalQaFcmApplyGate,
  selectExactPhysicalNotification,
  selectExactPhysicalTarget,
} from './physical-qa-fcm-gate-lib.mjs';

const authority=loadActivePhysicalQaFcmAuthority();
assert.equal(authority.sha,'579bdecd7e193b8661276f114b9d3e097792d8d6');
assert.equal(authority.artifactId,10835643904);
assert.equal(authority.buildRunId,36064382977);
assert.equal(authority.apkSha256,'acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8');
assert.equal(authority.certSha256,'192b19f3e67ed7b69fa6862429e232b892979a6c8c97800845f6a1d1948ff79a');

assert.equal(validatePhysicalQaFcmApplyGate({apply:false},authority).pass,true);

const valid=validatePhysicalQaFcmApplyGate({
  apply:true,
  maintenanceAllow:'staging-v2',
  ack:PHYSICAL_QA_FCM_APPLY_ACK,
  candidateSha:authority.sha,
  candidateArtifactId:authority.artifactId,
  candidateBuildRunId:authority.buildRunId,
  candidateApkSha256:authority.apkSha256,
  candidateCertSha256:authority.certSha256,
  notificationId:'notif_abc123',
  recipientUid:'uid-recipient',
  deviceTokenRecordId:'device_record_1',
},authority);
assert.equal(valid.pass,true);
assert.equal(valid.mode,'APPLY');

for(const bad of [
  {maintenanceAllow:'wrong',ack:PHYSICAL_QA_FCM_APPLY_ACK,candidateSha:authority.sha,candidateArtifactId:authority.artifactId,candidateBuildRunId:authority.buildRunId,candidateApkSha256:authority.apkSha256,candidateCertSha256:authority.certSha256,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:'WRONG',candidateSha:authority.sha,candidateArtifactId:authority.artifactId,candidateBuildRunId:authority.buildRunId,candidateApkSha256:authority.apkSha256,candidateCertSha256:authority.certSha256,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:PHYSICAL_QA_FCM_APPLY_ACK,candidateSha:'0'.repeat(40),candidateArtifactId:authority.artifactId,candidateBuildRunId:authority.buildRunId,candidateApkSha256:authority.apkSha256,candidateCertSha256:authority.certSha256,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:PHYSICAL_QA_FCM_APPLY_ACK,candidateSha:authority.sha,candidateArtifactId:999,candidateBuildRunId:authority.buildRunId,candidateApkSha256:authority.apkSha256,candidateCertSha256:authority.certSha256,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:PHYSICAL_QA_FCM_APPLY_ACK,candidateSha:authority.sha,candidateArtifactId:authority.artifactId,candidateBuildRunId:authority.buildRunId,candidateApkSha256:'0'.repeat(64),candidateCertSha256:authority.certSha256,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:PHYSICAL_QA_FCM_APPLY_ACK,candidateSha:authority.sha,candidateArtifactId:authority.artifactId,candidateBuildRunId:authority.buildRunId,candidateApkSha256:authority.apkSha256,candidateCertSha256:authority.certSha256,notificationId:'',recipientUid:'u1',deviceTokenRecordId:'d1'},
]) assert.equal(validatePhysicalQaFcmApplyGate({apply:true,...bad},authority).pass,false);

const notification=selectExactPhysicalNotification([{id:'n1',recipient_uid:'u1'},{id:'n2',recipient_uid:'u2'}],'n1','u1');
assert.equal(notification.id,'n1');
assert.throws(()=>selectExactPhysicalNotification([{id:'n1',recipient_uid:'u2'}],'n1','u1'),/EXACT_NOTIFICATION_REQUIRED/);

const target=selectExactPhysicalTarget([{id:'d1',token:'secret'},{id:'d2',token:'secret2'}],'d1');
assert.equal(target.id,'d1');
assert.throws(()=>selectExactPhysicalTarget([{id:'d2'}],'d1'),/EXACT_DEVICE_TOKEN_RECORD_REQUIRED/);

console.log('PASS real FCM apply is bound to the active exact Physical QA candidate and exact notification/recipient/device-token selectors');
