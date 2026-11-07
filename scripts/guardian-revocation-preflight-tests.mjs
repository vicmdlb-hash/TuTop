import assert from 'node:assert/strict';
import { prepareGuardianRevocation } from './guardian-revocation-preflight.mjs';

// Synthetic identities only. A passing plan test never proves privileged
// authorization, backend atomicity, real account consent, or chat enumeration.
const nowMs = 1_800_000_000_000;
const chat = (id, buyerUid = 'alice', sellerUid = 'bob') =>
  ({ id, buyerUid, sellerUid });
const base = (extras = {}) => ({
  subjectUid: 'alice',
  nowMs,
  snapshotObservedAtMs: nowMs - 1_000,
  snapshotComplete: true,
  expectedChatCount: 2,
  revokeGuardianGrant: true,
  chats: [chat('chat-1'), chat('chat-2', 'carol', 'alice')],
  ...extras,
});
const refused = (reason, input) => {
  assert.throws(() => prepareGuardianRevocation(input),
    { message: 'GUARDIAN_REVOCATION_REFUSED:' + reason });
};
const result = prepareGuardianRevocation(base());
assert.equal(result.kind, 'PREVIEW_NOT_EXECUTABLE');
assert.equal(result.writeCount, 5);
assert.equal(result.writes.length, 5);
assert.deepEqual(result.writes[0], {
  path: 'age_proofs_v2/alice', changes: { revoked: true },
});
assert.deepEqual(result.writes[1], {
  path: 'guardian_grants_v2/alice', changes: { active: false },
});
assert.deepEqual(result.writes[2], {
  path: 'adult_actions_v2/alice', changes: { authorized: false },
});
assert.deepEqual(result.writes[3], {
  path: 'chats/chat-1',
  changes: { guardian_pair_revoked: true, guardian_pair_vetted: false },
});
assert.equal(result.requiresPrivilegedAtomicCommit, true);
assert.equal(result.requiresServerVerifiedEnumeration, true);
assert.equal(result.requiresAdmissionFreezeDuringCommit, true);
assert.equal(result.completionVerified, false);
const full = prepareGuardianRevocation(base({ revokeGuardianGrant: true }));
assert.deepEqual(full.writes[1], {
  path: 'guardian_grants_v2/alice', changes: { active: false },
});
assert.equal(full.writeCount, 5);
const noChats = prepareGuardianRevocation(base({
  chats: [], expectedChatCount: 0,
}));
assert.equal(noChats.writeCount, 3);
assert.deepEqual(noChats.writes.map(w => w.path),
  ['age_proofs_v2/alice', 'guardian_grants_v2/alice', 'adult_actions_v2/alice']);
refused('guardian_grant_revocation_required', base({ revokeGuardianGrant: false }));
refused('guardian_grant_revocation_required', base({ revokeGuardianGrant: undefined }));
refused('guardian_grant_revocation_required', base({ revokeGuardianGrant: 'true' }));
refused('incomplete_pagination', base({ snapshotComplete: false }));
refused('incomplete_pagination', base({ snapshotComplete: undefined }));
refused('incomplete_chat_inventory', base({ expectedChatCount: 1 }));
refused('stale_or_future_snapshot', base({
  snapshotObservedAtMs: nowMs - 31_000,
}));
refused('stale_or_future_snapshot', base({
  snapshotObservedAtMs: nowMs + 1,
}));
refused('duplicate_chat', base({
  chats: [chat('chat-1'), chat('chat-1')],
}));
refused('foreign_chat', base({
  chats: [chat('chat-1'), chat('chat-2', 'bob', 'carol')],
}));
refused('invalid_chat_id', base({
  chats: [chat('chat-1'), chat('../admins')],
}));
refused('invalid_subject', base({ subjectUid: 'malicious/uid' }));
refused('self_chat', base({
  chats: [chat('chat-1'), chat('chat-2', 'alice', 'alice')],
}));
refused('cannot_atomically_revoke_all_chats', base({
  chats: Array.from({ length: 398 }, (_, i) => chat('chat-' + i)),
  expectedChatCount: 398,
}));
// Conservative limit is 400 total planned writes (age+grant+adult-action+chats).
const bounded = prepareGuardianRevocation(base({
  chats: Array.from({ length: 397 }, (_, i) => chat('chat-' + i)),
  expectedChatCount: 397,
}));
assert.equal(bounded.writeCount, 400);

refused('invalid_clock', base({ nowMs: Number.NaN }));
console.log('PASS guardian revocation preflight: complete, bounded, server-only preview; no writes');
