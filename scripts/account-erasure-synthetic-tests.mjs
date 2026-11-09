import assert from 'node:assert/strict';
import { buildAccountErasurePlan, reservationLockBlockers, residualRiskSummary, summarizeRetainedOperationalMatches } from './account-erasure-planner.mjs';

const projectId = 'tutop-beta-vicmdlb-1356585881';
const uid = 'synthetic-user-001';

const clean = buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  directDeletes: [`users/${uid}`, `user_private/${uid}`, `wallets/${uid}`],
});
assert.equal(clean.mode, 'dry-run');
assert.equal(clean.auth_delete_last, true);
assert.equal(clean.blocked, false);
assert.deepEqual(clean.delete_paths, [`user_private/${uid}`, `users/${uid}`, `wallets/${uid}`].sort());
assert.equal(residualRiskSummary(clean).requires_retention_review, true,
  'zero observed retained records is not legal retention approval');
assert.equal(residualRiskSummary(clean).legal_review_approved, false);
assert.equal(residualRiskSummary(clean).residual_inventory_exhaustive, false);
assert.equal(residualRiskSummary(clean).safe_to_execute_in_staging, false);
assert.equal(residualRiskSummary(clean).admission_freeze_verified, false);

// Terminal transaction alone cannot prove safe deletion while a residual
// lock remains: lock inventory is scoped, deduped, and fail-closed.
const mkLock = (path, buyer = uid, seller = 'seller-002') => ({
  path, fields: { buyer_id: { stringValue: buyer }, seller_id: { stringValue: seller } },
});
const locks = reservationLockBlockers([
  mkLock('listing_reservation_locks/listing-1'),
  mkLock('listing_reservation_locks/listing-1'),
  mkLock('listing_reservation_locks/listing-2', 'buyer-002', uid),
], uid);
assert.deepEqual(locks.map(item => item.id), ['listing-1', 'listing-2']);
assert(locks.every(item => item.code === 'marketplace_reservation_lock_present'));
const stillLocked = buildAccountErasurePlan({
  projectId, uid, status: 'pending', blockers: locks,
});
assert.equal(stillLocked.blocked, true, 'residual locks must block erasure');
assert.equal(residualRiskSummary(stillLocked).blocker_count, 2);
for (const malformed of [
  mkLock('chats/other'), mkLock('listing_reservation_locks/../oops'),
  mkLock('listing_reservation_locks/listing-1', 'other-1', 'other-2'),
  { path: 'listing_reservation_locks/listing-1', fields: {} }, null,
]) {
  assert.throws(() => reservationLockBlockers([malformed], uid), /ERASURE_LOCK_/);
}
assert.throws(() => reservationLockBlockers(null, uid), /ERASURE_LOCK_INVENTORY_INVALID/);

const marketplace = buildAccountErasurePlan({
  projectId, uid, status: 'processing',
  directDeletes: [`users/${uid}`],
  queryDeletePaths: [`favorites/f1`, `saved_searches/s1`, `device_tokens/d1`, `favorites/f1`],
  withdrawDocs: [
    { collection: 'listings_v2', path: 'listings_v2/l1' },
    { collection: 'demand_requests', path: 'demand_requests/q1' },
  ],
  retained: [
    { collection: 'transactions_v2', field: 'seller_id', count: 2 },
    { collection: 'listing_reservation_locks', field: 'seller_id', count: 1 },
    { collection: 'chats', field: 'seller_id', count: 1 },
    { collection: 'reports', field: 'created_by', count: 1 },
  ],
});
assert.equal(marketplace.delete_paths.filter((path) => path === 'favorites/f1').length, 1, 'delete paths must deduplicate');
assert.deepEqual(marketplace.withdraw_paths, ['demand_requests/q1', 'listings_v2/l1']);
assert.equal(marketplace.retained_count, 5);
assert.equal(residualRiskSummary(marketplace).requires_retention_review, true);

const blocked = buildAccountErasurePlan({
  projectId, uid, status: 'pending', apply: true,
  blockers: [
    { code: 'active_marketplace_transaction', collection: 'transactions_v2', id: 'tx-1', status: 'reserved' },
    { code: 'active_marketplace_transaction', collection: 'transactions_v2', id: 'tx-1', status: 'reserved' },
    { code: 'active_marketplace_transaction', collection: 'transactions_v2', id: 'tx-2', status: 'disputed' },
  ],
});
assert.equal(blocked.blocked, true);
assert.equal(blocked.blockers.length, 2, 'blockers must deduplicate');
assert.equal(residualRiskSummary(blocked).blocker_count, 2);
assert.equal(residualRiskSummary(blocked).safe_to_execute_in_staging, false);

const applied = buildAccountErasurePlan({ projectId, uid, status: 'pending', apply: true });
assert.equal(applied.mode, 'apply');
assert.equal(applied.blocked, false);

assert.throws(() => buildAccountErasurePlan({ projectId, uid: 'short', status: 'pending' }), /INVALID_UID/);
for (const malformed of ['12345678/../admin', '../12345678', 'bad name_123', 'ümlaut123', '12345678\\n', { toString: () => '12345678' }]) {
  assert.throws(() => buildAccountErasurePlan({ projectId, uid: malformed, status: 'pending' }), /INVALID_UID/);
}
assert.throws(() => buildAccountErasurePlan({ projectId, uid, status: 'completed' }), /UNPROCESSABLE_STATUS:completed/);
assert.throws(() => buildAccountErasurePlan({ projectId, uid, status: 'rejected' }), /UNPROCESSABLE_STATUS:rejected/);

// An unsupported withdrawal is not a disposable document and must not vanish
// from the erasure report: rejecting the whole plan prevents false clean proof.
for (const bad of [
  { collection: 'transactions_v2', path: 'transactions_v2/t1' },
  { collection: 'audit_log', path: 'audit_log/a1' },
  { collection: 'chats', path: 'chats/c1' },
  null,
  {},
]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId, uid, status: 'pending',
    withdrawDocs: [
      { collection: 'listings_v2', path: 'listings_v2/l2' }, bad,
    ],
  }), /ERASURE_WITHDRAW_COLLECTION_INVALID/);
}
for (const malformedInventory of [null, 'not-an-array', {}]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId, uid, status: 'pending', withdrawDocs: malformedInventory,
  }), /ERASURE_WITHDRAW_INVENTORY_INVALID/);
}
const deduplicatedWithdrawals = buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  withdrawDocs: [
    { collection: 'listings_v2', path: 'listings_v2/l2' },
    { collection: 'listings_v2', path: 'listings_v2/l2' },
    { collection: 'demand_requests', path: 'demand_requests/q2' },
  ],
});
assert.deepEqual(deduplicatedWithdrawals.withdraw_paths,
  ['demand_requests/q2', 'listings_v2/l2'],
  'duplicate withdrawals must not inflate mutation attempts or proof counts');

// A trusted staging processor must never let a withdrawal's claimed
// collection disguise a document in another collection or a nested path.
for (const path of [
  'users/another-user', 'transactions_v2/t1', 'audit_log/a1',
  'listings_v2/../another', 'listings_v2/a/b', 'listings_v2/',
  'listings_v2/with space', 123, null,
]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId, uid, status: 'pending',
    withdrawDocs: [{ collection: 'listings_v2', path }],
  }), /ERASURE_WITHDRAW_PATH_INVALID/);
}
assert.throws(() => buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  withdrawDocs: [{ collection: 'demand_requests', path: 'listings_v2/l1' }],
}), /ERASURE_WITHDRAW_PATH_INVALID/);
const validWithdraw = buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  withdrawDocs: [{ collection: 'demand_requests', path: 'demand_requests/q2' }],
});
assert.deepEqual(validWithdraw.withdraw_paths, ['demand_requests/q2']);

// A malformed blocker or retention count is not evidence of zero residual
// data. It must stop a destructive execution instead of being filtered out.
for (const badCount of [-1, 1.5, Infinity, NaN, '2', null]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId, uid, status: 'pending',
    retained: [{ collection: 'transactions_v2', field: 'seller_id', count: badCount }],
  }), /ERASURE_RETAINED_COUNT_INVALID/);
}
for (const badBlocker of [
  null, {}, { code: 'active_marketplace_transaction', collection: 'transactions_v2' },
  { code: 'active_marketplace_transaction', collection: 'transactions_v2', id: 123 },
]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId, uid, status: 'pending', blockers: [badBlocker],
  }), /ERASURE_BLOCKER_INVALID/);
}
assert.equal(buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  retained: [{ collection: 'chats', field: 'buyer_id', count: 0 }],
}).retained_count, 0);

// Blocker identities are tuples, never colon-joined strings: a caller can
// otherwise collide two distinct reasons and under-report residual risk.
const collision = buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  blockers: [
    { code: 'active:marketplace', collection: 'transactions_v2', id: 'tx-3', status: 'reserved' },
    { code: 'active', collection: 'marketplace:transactions_v2', id: 'tx-3', status: 'disputed' },
    { code: 'active:marketplace', collection: 'transactions_v2', id: 'tx-3', status: 'reserved' },
  ],
});
assert.equal(collision.blockers.length, 2, 'distinct blocker tuples must survive delimiter collision');
assert.equal(residualRiskSummary(collision).blocker_count, 2);
assert.equal(collision.blocked, true);

// Safe individual integers do not imply a safe sum: overflow must fail closed.
assert.throws(() => buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  retained: [
    { collection: 'transactions_v2', field: 'buyer_id', count: Number.MAX_SAFE_INTEGER },
    { collection: 'chats', field: 'buyer_id', count: 1 },
  ],
}), /ERASURE_RETAINED_TOTAL_INVALID/);

// The pure planner must not accidentally accept a production project or a
// string/number masquerading as a boolean apply flag, regardless of caller.
for (const wrongProject of ['other-project', 'tutop-3a4f7', '', null, undefined]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId: wrongProject, uid, status: 'pending',
  }), /ERASURE_PROJECT_NOT_ALLOWED/);
}
for (const malformedApply of ['false', 'true', 0, 1, null, {}, []]) {
  assert.throws(() => buildAccountErasurePlan({
    projectId, uid, status: 'pending', apply: malformedApply,
  }), /ERASURE_APPLY_FLAG_INVALID/);
}
assert.equal(buildAccountErasurePlan({projectId, uid, status: 'pending', apply: false}).mode, 'dry-run');
assert.equal(buildAccountErasurePlan({projectId, uid, status: 'pending', apply: true}).mode, 'apply');

console.log('PASS clean account dry-run plan');
console.log('PASS marketplace account dedupe/withdraw/retain plan');
console.log('PASS active marketplace transactions block destructive erasure');
console.log('PASS apply mode remains explicit');
console.log('PASS closed deletion requests cannot be processed');
console.log('PASS transaction/audit collections cannot be injected as withdrawals');
console.log('Synthetic account erasure scenarios: PASS');

const uniqueRetained = summarizeRetainedOperationalMatches([
  { collection: 'reports', field: 'created_by', docs: [{path:'reports/a'},{path:'reports/b'}] },
  { collection: 'reports', field: 'target_id', docs: [{path:'reports/b'},{path:'reports/c'}] },
  { collection: 'notification_outbox', field: 'recipient_uid', docs: [{path:'notification_outbox/n1'}] },
  { collection: 'audit_log', field: 'target_id', docs: [{path:'audit_log/log1'},{path:'audit_log/log2'}] },
  { collection: 'audit_log', field: 'admin_uid', docs: [{path:'audit_log/log2'}] },
  { collection: 'reports', field: 'target_id', docs: [{path:'reports/c'}] },
]);
assert.deepEqual(uniqueRetained, [
  {collection:'audit_log',field:'admin_uid|target_id',count:2},
  {collection:'notification_outbox',field:'recipient_uid',count:1},
  {collection:'reports',field:'created_by|target_id',count:3},
], 'report records found through author and target references must be counted once');
const uniquePlan = buildAccountErasurePlan({
  projectId, uid, status:'pending', retained: uniqueRetained,
});
assert.equal(uniquePlan.retained_count,6,'multi-field audit and report matches must not overcount retained records');
for (const invalid of [
  [{collection:'reports',field:'target_id',docs:[{path:'users/victim'}]}],
  [{collection:'reports',field:'target_id',docs:[{path:'reports/a/child/b'}]}],
  [{collection:'reports',field:'target_id',docs:[{}]}],
  [{collection:'reports',field:'target_id',docs:null}],
]) assert.throws(()=>summarizeRetainedOperationalMatches(invalid),
  /ERASURE_RETAINED_MATCH/, 'malformed retained source must fail closed');
console.log('PASS retained audit target/admin and report author/target references are unique by document path');
