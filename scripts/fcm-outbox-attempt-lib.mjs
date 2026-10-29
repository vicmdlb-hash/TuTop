import { fcmTokenCleanupPrecondition } from './fcm-token-ownership-lib.mjs';

// Firestore cannot atomically commit an external HTTP FCM send. Claim first;
// uncertain outcomes stay dispatching until reviewed, never auto-replayed.
function validTime(t) {
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(t)
    && Number.isFinite(Date.parse(t));
}
export function planFcmOutboxClaim(item, now) {
  if (item?.status !== 'pending') throw new Error('FCM_OUTBOX_NOT_PENDING');
  if (!validTime(now)) throw new Error('FCM_OUTBOX_CLAIM_TIME_INVALID');
  const attempts = item.attempts === undefined ? 0 : Number(item.attempts);
  if (!Number.isSafeInteger(attempts) || attempts < 0
      || attempts >= Number.MAX_SAFE_INTEGER)
    throw new Error('FCM_OUTBOX_ATTEMPTS_INVALID');
  return {
    fields: { status: 'dispatching', attempts: attempts + 1,
      dispatch_started_at: now, updated_at: now },
    precondition: fcmTokenCleanupPrecondition(item),
  };
}
export function attachCommittedFcmClaim(item, planned, response) {
  if (planned?.fields?.status !== 'dispatching' || item?.status !== 'pending')
    throw new Error('FCM_OUTBOX_CLAIM_NOT_PLANNED');
  if (!Array.isArray(response?.writeResults) || response.writeResults.length !== 1)
    throw new Error('FCM_OUTBOX_CLAIM_UNVERIFIED');
  const stamp = response.writeResults[0]?.updateTime;
  fcmTokenCleanupPrecondition({ _document_update_time: stamp });
  return { ...item, ...planned.fields, _document_update_time: stamp };
}
export function planFcmOutboxCompletion(claimed, now) {
  if (claimed?.status !== 'dispatching') throw new Error('FCM_OUTBOX_NOT_DISPATCHING');
  if (!validTime(now)) throw new Error('FCM_OUTBOX_SENT_TIME_INVALID');
  return {
    fields: { status: 'sent', sent_at: now, updated_at: now },
    precondition: fcmTokenCleanupPrecondition(claimed),
  };
}

/**
 * Require every superseded active token mapping to be verifiably deactivated
 * before any external FCM send. On an uncertain cleanup, leave the previously
 * claimed outbox record in dispatching for manual reconciliation; never retry.
 */
export function canSendAfterStaleOwnerCleanup(required, verified) {
  if (!Number.isSafeInteger(required) || required < 0
      || !Number.isSafeInteger(verified) || verified < 0
      || verified > required) throw new Error('FCM_STALE_OWNER_CLEANUP_COUNT_INVALID');
  return required === verified;
}
