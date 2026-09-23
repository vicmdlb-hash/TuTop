import assert from 'node:assert/strict';
import {
  BUILD120_FCM_APPLY_ACK,
  BUILD120_FCM_CANDIDATE_SHA,
  validateBuild120FcmApplyGate,
  selectExactPhysicalNotification,
  selectExactPhysicalTarget,
} from './build120-fcm-physical-gate-lib.mjs';

assert.equal(validateBuild120FcmApplyGate({apply:false}).pass,true);

const valid=validateBuild120FcmApplyGate({
  apply:true,
  maintenanceAllow:'staging-v2',
  ack:BUILD120_FCM_APPLY_ACK,
  candidateSha:BUILD120_FCM_CANDIDATE_SHA,
  notificationId:'notif_abc123',
  recipientUid:'uid-recipient',
  deviceTokenRecordId:'device_record_1',
});
assert.equal(valid.pass,true);
assert.equal(valid.mode,'APPLY');

for(const bad of [
  {maintenanceAllow:'wrong',ack:BUILD120_FCM_APPLY_ACK,candidateSha:BUILD120_FCM_CANDIDATE_SHA,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:'WRONG',candidateSha:BUILD120_FCM_CANDIDATE_SHA,notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:BUILD120_FCM_APPLY_ACK,candidateSha:'wrong',notificationId:'n1',recipientUid:'u1',deviceTokenRecordId:'d1'},
  {maintenanceAllow:'staging-v2',ack:BUILD120_FCM_APPLY_ACK,candidateSha:BUILD120_FCM_CANDIDATE_SHA,notificationId:'',recipientUid:'u1',deviceTokenRecordId:'d1'},
]) {
  assert.equal(validateBuild120FcmApplyGate({apply:true,...bad}).pass,false);
}

const notification=selectExactPhysicalNotification(
  [{id:'n1',recipient_uid:'u1'},{id:'n2',recipient_uid:'u2'}],
  'n1','u1'
);
assert.equal(notification.id,'n1');
assert.throws(()=>selectExactPhysicalNotification([{id:'n1',recipient_uid:'u2'}],'n1','u1'),/EXACT_NOTIFICATION_REQUIRED/);

const target=selectExactPhysicalTarget([{id:'d1',token:'secret'},{id:'d2',token:'secret2'}],'d1');
assert.equal(target.id,'d1');
assert.throws(()=>selectExactPhysicalTarget([{id:'d2'}],'d1'),/EXACT_DEVICE_TOKEN_RECORD_REQUIRED/);

console.log('PASS real FCM apply is Build120-only and requires exact notification, recipient and device-token record selectors');
