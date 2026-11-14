import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateReconciliationInventoryPage } from './reservation-reconcile-inventory-lib.mjs';
// Source-only check: NEVER run credential-bearing staging reconciliation.
const source = fs.readFileSync('scripts/reconcile-v2-reservations.mjs', 'utf8');
const applyStart = source.indexOf('let applied = 0;');
const terminalStart = source.indexOf('let cleanedLocks = 0;', applyStart);
assert(applyStart > 0 && terminalStart > applyStart);
const writes = source.slice(applyStart, terminalStart);
const expiry = writes.slice(writes.indexOf("if (plan.kind === 'expire_reserved')"), writes.indexOf("} else if (plan.kind === 'repair_completed_listing')"));
const terminal = source.slice(terminalStart);
for (const value of ["if (apply && allow !== 'staging-v2')", "const historicalProject = 'tutop-3a4f7'", "__updateTime: document.updateTime || null", 'trusted_snapshot_guard_failed', 'currentDocument: { updateTime: expectedUpdateTime }', 'lock?.transaction_id === transaction.id']) assert(source.includes(value), 'missing critical source guard: ' + value);
assert(source.includes('validateReconciliationInventoryPage(response, { projectId, collectionId, limit: pageSize })'), 'runner must validate every cursor page before inspecting documents');
assert(source.includes('collectCursorPages(') && source.includes("fieldPath: '__name__'") && source.includes('before: false'), 'runner must traverse ordered cursor pages');
for (const value of ["status: 'expired'", "availability_status: 'available'", 'plan.transaction_update_time', 'plan.listing_update_time', 'plan.lock_update_time']) assert(expiry.includes(value), 'expiration must atomically handle ' + value);
for (const value of ['lockPlan.release_availability', "availability_status: 'available'", 'lockPlan.listing_update_time', 'lockPlan.lock_update_time', 'status: lockPlan.transaction_status']) assert(terminal.includes(value), 'terminal cleanup must protect ' + value);
assert(!terminal.includes('writes: [deleteWrite('), 'no unconditional terminal lock deletion');
assert(!source.includes('verifyWrite(') && !source.includes('verify:'), 'Firestore REST Write does not support verify');
// A 200 runQuery response with skippedResults cannot prove complete
// reconciliation. Exercise the pure production validator, no credentials.
const scope = { projectId: 'tutop-beta-vicmdlb-1356585881', collectionId: 'transactions_v2', limit: 3 };
const syntheticTransaction = {
  document: { name: 'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents/transactions_v2/syntheticTx1' },
};
assert.equal(validateReconciliationInventoryPage([syntheticTransaction], scope).length, 1);
assert.deepEqual(validateReconciliationInventoryPage([{ readTime: '2026-11-08T00:00:00Z', skippedResults: 0 }], scope), []);
assert.throws(() => validateReconciliationInventoryPage([
  { readTime: '2026-11-08T00:00:00Z', skippedResults: 2 },
], scope), /RECONCILE_INVENTORY_SKIPPED_RESULTS_UNSAFE/);
assert.throws(() => validateReconciliationInventoryPage([
  { ...syntheticTransaction, skippedResults: 1 },
], scope), /RECONCILE_INVENTORY_SKIPPED_RESULTS_UNSAFE/);

console.log('PASS source-only reservation reconciliation: atomic availability release and snapshot-conditioned terminal cleanup; no Firebase calls');
