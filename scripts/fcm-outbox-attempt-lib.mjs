import { eligibleRecipientTargets, fcmTokenCleanupPrecondition } from './fcm-token-ownership-lib.mjs';

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

/**
 * Secondary, post-cleanup, pre-send gate. The caller must obtain freshRecords
 * from a new COMPLETE Firestore query after deactivating superseded owners.
 * Fail closed on changed recipient, record version, ambiguous ownership,
 * cross-account token reuse or incomplete/duplicated results.
 * This minimizes, but CANNOT eliminate, the external HTTP/Firestore race:
 * real FCM delivery still requires controlled two-device testing.
 */
export function isFreshFcmTargetStillEligible(selected, freshRecords, recipientUid) {
  if (!selected || !Array.isArray(freshRecords)
      || typeof recipientUid !== 'string' || !recipientUid.trim()
      || selected.owner_uid !== recipientUid || selected.active !== true
      || typeof selected.id !== 'string' || !selected.id.trim()
      || typeof selected.token !== 'string' || !selected.token.trim()) return false;
  try { fcmTokenCleanupPrecondition(selected); } catch { return false; }

  const ids = new Set();
  for (const record of freshRecords) {
    if (!record || typeof record.id !== 'string' || !record.id.trim()
        || ids.has(record.id)) return false;
    ids.add(record.id);
    // Any competing ACTIVE account for this token means delivery is unsafe,
    // even if older timestamps would otherwise select the requested UID.
    if (record.token === selected.token
        && record.active === true && record.owner_uid !== recipientUid) return false;
  }
  const current = eligibleRecipientTargets(freshRecords, recipientUid)
    .filter((record) => record.token === selected.token);
  return current.length === 1 && current[0].id === selected.id
    && current[0]._document_update_time === selected._document_update_time
    && current[0].active === true && current[0].owner_uid === recipientUid;
}
