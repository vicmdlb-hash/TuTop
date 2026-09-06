import assert from 'node:assert/strict';
import { buildAccountErasurePlan, residualRiskSummary } from './account-erasure-planner.mjs';

const projectId = 'tutop-beta-vicmdlb-1356585881';
const uid = 'synthetic-user-001';

const clean = buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  directDeletes: [`users/${uid}`, `user_private/${uid}`, `wallets/${uid}`],
});
assert.equal(clean.mode, 'dry-run');
assert.equal(clean.auth_delete_last, true);
assert.deepEqual(clean.delete_paths, [`user_private/${uid}`, `users/${uid}`, `wallets/${uid}`].sort());
assert.equal(residualRiskSummary(clean).requires_retention_review, false);

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
    { collection: 'chats', field: 'seller_id', count: 1 },
    { collection: 'reports', field: 'created_by', count: 1 },
  ],
});
assert.equal(marketplace.delete_paths.filter((path) => path === 'favorites/f1').length, 1, 'delete paths must deduplicate');
assert.deepEqual(marketplace.withdraw_paths, ['demand_requests/q1', 'listings_v2/l1']);
assert.equal(marketplace.retained_count, 4);
assert.equal(residualRiskSummary(marketplace).requires_retention_review, true);

const applied = buildAccountErasurePlan({ projectId, uid, status: 'pending', apply: true });
assert.equal(applied.mode, 'apply');

assert.throws(() => buildAccountErasurePlan({ projectId, uid: 'short', status: 'pending' }), /INVALID_UID/);
assert.throws(() => buildAccountErasurePlan({ projectId, uid, status: 'completed' }), /UNPROCESSABLE_STATUS:completed/);
assert.throws(() => buildAccountErasurePlan({ projectId, uid, status: 'rejected' }), /UNPROCESSABLE_STATUS:rejected/);

const hostile = buildAccountErasurePlan({
  projectId, uid, status: 'pending',
  withdrawDocs: [
    { collection: 'transactions_v2', path: 'transactions_v2/t1' },
    { collection: 'audit_log', path: 'audit_log/a1' },
    { collection: 'listings_v2', path: 'listings_v2/l2' },
  ],
});
assert.deepEqual(hostile.withdraw_paths, ['listings_v2/l2'], 'planner must reject unsupported destructive withdrawal collections');

console.log('PASS clean account dry-run plan');
console.log('PASS marketplace account dedupe/withdraw/retain plan');
console.log('PASS apply mode remains explicit');
console.log('PASS closed deletion requests cannot be processed');
console.log('PASS transaction/audit collections cannot be injected as withdrawals');
console.log('Synthetic account erasure scenarios: PASS');
