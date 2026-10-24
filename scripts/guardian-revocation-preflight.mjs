/**
 * SERVER DESIGN PREFLIGHT ONLY. No Firebase credentials, reads, writes or
 * deployments. Input authenticity, pagination completeness, authorization,
 * concurrent chat creation, and atomic commit remain responsibilities of a
 * separately audited privileged backend. DO NOT call with untrusted client data.
 *
 * A partial revocation is worse than a deliberate fail-closed refusal: until
 * every affected chat can be invalidated in one privileged atomic operation,
 * social sends must be suspended at the trusted admission layer.
 */
const goodId = id => typeof id === 'string'
  && /^[A-Za-z0-9_-]{1,128}$/.test(id) && !id.startsWith('__');

function requireValid(ok, reason) {
  if (!ok) throw new Error('GUARDIAN_REVOCATION_REFUSED:' + reason);
}

export function prepareGuardianRevocation(input) {
  requireValid(input && typeof input === 'object', 'invalid_input');
  const { subjectUid, chats, expectedChatCount, snapshotComplete,
    snapshotObservedAtMs, nowMs, revokeGuardianGrant = false } = input;
  requireValid(goodId(subjectUid), 'invalid_subject');
  requireValid(Number.isSafeInteger(nowMs) && nowMs > 0, 'invalid_clock');
  requireValid(Number.isSafeInteger(snapshotObservedAtMs)
    && snapshotObservedAtMs <= nowMs
    && nowMs - snapshotObservedAtMs <= 30_000, 'stale_or_future_snapshot');
  requireValid(snapshotComplete === true, 'incomplete_pagination');
  requireValid(Array.isArray(chats), 'missing_chats');
  requireValid(Number.isSafeInteger(expectedChatCount)
    && expectedChatCount === chats.length, 'incomplete_chat_inventory');
  requireValid(revokeGuardianGrant === true || revokeGuardianGrant === false,
    'invalid_guardian_grant_option');

  // Conservative server transaction budget, not a published product limit.
  // Any fanout above this bound needs a different deny-first architecture.
  const numberOfWrites = chats.length + 1 + Number(revokeGuardianGrant);
  requireValid(numberOfWrites <= 400, 'cannot_atomically_revoke_all_chats');
  const seen = new Set();
  for (const chat of chats) {
    requireValid(chat && goodId(chat.id), 'invalid_chat_id');
    requireValid(goodId(chat.buyerUid) && goodId(chat.sellerUid),
      'invalid_participant');
    requireValid(chat.buyerUid !== chat.sellerUid, 'self_chat');
    requireValid(chat.buyerUid === subjectUid || chat.sellerUid === subjectUid,
      'foreign_chat');
    requireValid(!seen.has(chat.id), 'duplicate_chat');
    seen.add(chat.id);
  }
  const writes = [
    { path: 'age_proofs_v2/' + subjectUid, changes: { revoked: true } },
    ...(revokeGuardianGrant
      ? [{ path: 'guardian_grants_v2/' + subjectUid, changes: { active: false } }]
      : []),
    ...chats.map(chat => ({
      path: 'chats/' + chat.id,
      changes: { guardian_pair_revoked: true, guardian_pair_vetted: false },
    })),
  ];
  return {
    kind: 'PREVIEW_NOT_EXECUTABLE',
    subjectUid,
    writes,
    writeCount: numberOfWrites,
    requiresPrivilegedAtomicCommit: true,
    requiresServerVerifiedEnumeration: true,
    requiresAdmissionFreezeDuringCommit: true,
    // No caller can treat this preview as evidence that access was revoked.
    completionVerified: false,
  };
}
