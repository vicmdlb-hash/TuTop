export const BUILD120_FCM_CANDIDATE_SHA = '554f4ef6d0429b0059738d8cd6e1b6e4890bda91';
export const BUILD120_FCM_APPLY_ACK = 'SEND_BUILD120_SINGLE_DEVICE_FCM';

function cleanSelector(value, label) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > 180 || clean.includes('/')) {
    throw new Error(`${label}_INVALID`);
  }
  return clean;
}

export function validateBuild120FcmApplyGate({
  apply,
  maintenanceAllow,
  ack,
  candidateSha,
  notificationId,
  recipientUid,
  deviceTokenRecordId,
}) {
  if (!apply) {
    return {
      pass: true,
      mode: 'DRY_RUN',
      notificationId: '',
      recipientUid: '',
      deviceTokenRecordId: '',
    };
  }

  try {
    if (String(maintenanceAllow || '').trim() !== 'staging-v2') {
      return { pass: false, error: 'FCM_APPLY_REQUIRES_STAGING_V2' };
    }
    if (String(ack || '').trim() !== BUILD120_FCM_APPLY_ACK) {
      return { pass: false, error: 'FCM_APPLY_ACK_MISMATCH' };
    }
    if (String(candidateSha || '').trim() !== BUILD120_FCM_CANDIDATE_SHA) {
      return { pass: false, error: 'FCM_APPLY_CANDIDATE_SHA_MISMATCH' };
    }
    return {
      pass: true,
      mode: 'APPLY',
      notificationId: cleanSelector(notificationId, 'FCM_NOTIFICATION_ID'),
      recipientUid: cleanSelector(recipientUid, 'FCM_RECIPIENT_UID'),
      deviceTokenRecordId: cleanSelector(deviceTokenRecordId, 'FCM_DEVICE_TOKEN_RECORD_ID'),
    };
  } catch (error) {
    return { pass: false, error: error instanceof Error ? error.message : 'FCM_APPLY_SELECTOR_INVALID' };
  }
}

export function selectExactPhysicalNotification(pending, notificationId, recipientUid) {
  const matches = (pending || []).filter((item) => String(item?.id || '') === notificationId && String(item?.recipient_uid || '') === recipientUid);
  if (matches.length !== 1) throw new Error(`FCM_EXACT_NOTIFICATION_REQUIRED:${matches.length}`);
  return matches[0];
}

export function selectExactPhysicalTarget(targets, deviceTokenRecordId) {
  const matches = (targets || []).filter((target) => String(target?.id || '') === deviceTokenRecordId);
  if (matches.length !== 1) throw new Error(`FCM_EXACT_DEVICE_TOKEN_RECORD_REQUIRED:${matches.length}`);
  return matches[0];
}
