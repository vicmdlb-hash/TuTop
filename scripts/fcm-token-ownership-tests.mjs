import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  currentTokenOwnerRecords,
  eligibleRecipientTargets,
  isPermanentFcmTokenError,
} from './fcm-token-ownership-lib.mjs';

const token = 'fcm-token-shared-abcdefghijklmnopqrstuvwxyz';

const onlyA = currentTokenOwnerRecords([
  { id: 'a1', owner_uid: 'A', token, active: true, updated_at: '2026-09-19T01:00:00Z' },
]);
assert.deepEqual(onlyA.map(x => x.owner_uid), ['A']);

const bTakesOwnership = currentTokenOwnerRecords([
  { id: 'a1', owner_uid: 'A', token, active: true, updated_at: '2026-09-19T01:00:00Z' },
  { id: 'b1', owner_uid: 'B', token, active: true, updated_at: '2026-09-19T02:00:00Z' },
]);
assert.deepEqual(bTakesOwnership.map(x => x.owner_uid), ['B']);
assert.equal(eligibleRecipientTargets([
  { id: 'a1', owner_uid: 'A', token, active: true, updated_at: '2026-09-19T01:00:00Z' },
  { id: 'b1', owner_uid: 'B', token, active: true, updated_at: '2026-09-19T02:00:00Z' },
], 'A').length, 0, 'old owner must not receive after newer owner registration');
assert.equal(eligibleRecipientTargets([
  { id: 'a1', owner_uid: 'A', token, active: true, updated_at: '2026-09-19T01:00:00Z' },
  { id: 'b1', owner_uid: 'B', token, active: true, updated_at: '2026-09-19T02:00:00Z' },
], 'B').length, 1);

const newerInactiveMustNotReviveOld = currentTokenOwnerRecords([
  { id: 'a1', owner_uid: 'A', token, active: true, updated_at: '2026-09-19T01:00:00Z' },
  { id: 'b1', owner_uid: 'B', token, active: false, updated_at: '2026-09-19T03:00:00Z' },
]);
assert.equal(newerInactiveMustNotReviveOld.length, 0, 'newer inactive ownership tombstone must suppress older active mapping');

const ambiguousTie = currentTokenOwnerRecords([
  { id: 'a1', owner_uid: 'A', token, active: true, updated_at: '2026-09-19T04:00:00Z' },
  { id: 'b1', owner_uid: 'B', token, active: true, updated_at: '2026-09-19T04:00:00Z' },
]);
assert.equal(ambiguousTie.length, 0, 'same-time cross-owner ambiguity must fail closed');

const separateTokens = currentTokenOwnerRecords([
  { id: 'a1', owner_uid: 'A', token: token + '-1', active: true, updated_at: '2026-09-19T01:00:00Z' },
  { id: 'b1', owner_uid: 'B', token: token + '-2', active: true, updated_at: '2026-09-19T01:00:00Z' },
]);
assert.equal(separateTokens.length, 2);

assert.equal(isPermanentFcmTokenError(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'), true);
assert.equal(isPermanentFcmTokenError(400, 'INVALID_ARGUMENT registration token is invalid'), true);
assert.equal(isPermanentFcmTokenError(500, 'INTERNAL'), false);
assert.equal(isPermanentFcmTokenError(429, 'RESOURCE_EXHAUSTED'), false);

const sender = fs.readFileSync('scripts/post110-fcm-sender.mjs','utf8');
assert.match(sender, /eligibleRecipientTargets\(tokens, item\.recipient_uid\)/);
assert.match(sender, /isPermanentFcmTokenError\(response\.status, detail\)/);
assert.match(sender, /deactivateTokenRecord\(target, 'fcm-permanent-token-error'\)/);
assert.match(sender, /current_owner_filter: true/);
assert.match(sender, /permanent_invalid_token_cleanup: apply/);
assert.doesNotMatch(sender, /tokens\.filter\(\(target\) => target\.owner_uid === item\.recipient_uid/);

console.log('PASS trusted FCM sender uses current-token-owner semantics and fail-closed ambiguity/invalid-token cleanup');
