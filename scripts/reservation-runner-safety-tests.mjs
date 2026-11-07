import assert from 'node:assert/strict';
import fs from 'node:fs';

const runner = fs.readFileSync('scripts/reconcile-v2-reservations.mjs', 'utf8');
const domain = fs.readFileSync('src/lib/reservationReconciliation.ts', 'utf8');
const backend = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');
const lockRuleHardener = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs', 'utf8');

assert.match(runner, /process\.argv\.includes\('--apply'\)/);
assert.match(runner, /TUTOP_ALLOW_V2_RECONCILE/);
assert.match(runner, /allow !== 'staging-v2'/);
assert.match(runner, /historicalProject = 'tutop-3a4f7'/);
assert.match(runner, /projectId === historicalProject/);
assert.match(runner, /DRY RUN: no se escribió nada/);
assert.match(runner, /RESERVATION_RECONCILE_HTTP_/);
assert.doesNotMatch(runner, /await response\.text\(\)/, 'never log raw Firestore REST errors');
assert.doesNotMatch(runner, /console\.table\s*\(/, 'do not print staging user/listing/transaction identifiers');
assert.match(runner, /actionTypeCounts/);
assert.match(runner, /lockReasonCounts/);
assert.match(runner, /Acciones de reparación por clase/);
assert.match(runner, /Limpieza de reservation locks por clase/);
assert.match(runner, /requestJson\(`\$\{base\}:commit`/);
assert.match(runner, /listings_v2/);
assert.match(runner, /status: 'expired'/);
assert.match(runner, /status: 'sold_out'/);
assert.match(runner, /listing_reservation_locks/);
assert.match(runner, /completed_sold_out_trusted_cleanup/);
assert.match(runner, /\['cancelled', 'expired', 'no_show'\]/);
assert.match(runner, /cleanedLocks/);
assert.doesNotMatch(runner, /products\//);
assert.doesNotMatch(runner, /estado: 'Activo'/);
assert.doesNotMatch(runner, /estado: 'Vendido'/);
assert.match(domain, /transaction\.status !== 'reserved'/);
assert.match(domain, /expired_transaction_listing_unchanged/);
assert.match(domain, /status_not_auto_expirable/);
assert.doesNotMatch(runner, /status: 'cancelled'/);
assert.doesNotMatch(runner, /status: 'no_show'/);
assert.doesNotMatch(runner, /meetup_scheduled.*status:/s);

const finalizeStart = backend.indexOf('  async finalizeCompletedListing');
const finalizeEnd = backend.indexOf('  async disputeTransaction', finalizeStart);
assert.ok(finalizeStart >= 0 && finalizeEnd > finalizeStart, 'finalizeCompletedListing block must remain discoverable');
const finalizeBlock = backend.slice(finalizeStart, finalizeEnd);
assert.match(finalizeBlock, /status: 'sold_out'/);
assert.doesNotMatch(finalizeBlock, /delete:/);
assert.doesNotMatch(finalizeBlock, /terminalTransactionWrites/);
assert.doesNotMatch(backend, /releaseCompletedLockBestEffort/);
assert.match(lockRuleHardener, /completed queda reservado a cleanup trusted/);
assert.doesNotMatch(lockRuleHardener, /data\.status == 'completed'.*allow delete/s);

// Pure synthetic inventory tests: do NOT contact Firestore or use credentials.
const { assertCompleteReconciliationPage } = await import('./reservation-reconcile-inventory-lib.mjs');
const inventoryScope = { projectId: 'tutop-beta-vicmdlb-1356585881', collectionId: 'transactions_v2', limit: 3 };
const inventoryRow = (id) => ({ document: {
  name: `projects/${inventoryScope.projectId}/databases/(default)/documents/${inventoryScope.collectionId}/${id}`,
  fields: {}, updateTime: '2026-11-07T00:00:00Z',
} });
assert.equal(assertCompleteReconciliationPage([inventoryRow('A'), inventoryRow('B')], inventoryScope).length, 2);
assert.equal(assertCompleteReconciliationPage([{ readTime: '2026-11-07T00:00:00Z' }], inventoryScope).length, 0);
for (const invalid of [
  [inventoryRow('A'), inventoryRow('B'), inventoryRow('C')],
  [inventoryRow('A'), inventoryRow('A')],
  [{ document: { name: 'projects/other/databases/(default)/documents/transactions_v2/A' } }],
  [{ document: { name: `projects/${inventoryScope.projectId}/databases/(default)/documents/listing_reservation_locks/A` } }],
  [{ error: { code: 500 } }],
  null,
]) assert.throws(() => assertCompleteReconciliationPage(invalid, inventoryScope), /RECONCILE_INVENTORY_/);
for (const invalidScope of [
  { ...inventoryScope, collectionId: 'user_private' },
  { ...inventoryScope, projectId: 'tutop-3a4f7' },
  { ...inventoryScope, limit: 0 }, { ...inventoryScope, limit: 501 },
  { ...inventoryScope, limit: Number.NaN },
]) assert.throws(() => assertCompleteReconciliationPage([inventoryRow('A')], invalidScope), /RECONCILE_INVENTORY_/);
assert.match(runner, /assertCompleteReconciliationPage\(response, \{ projectId, collectionId, limit: maxDocs \}\)/);
assert.match(runner, /RECONCILE_LIMIT_INVALID/);
console.log('PASS reconciliation inventory: incomplete/duplicate/untrusted pages refuse all writes');

console.log('PASS reservation runner is dry-run by default');
console.log('PASS apply mode requires explicit staging-v2 permission');
console.log('PASS historical Firebase project is blocked');
console.log('PASS runner uses canonical listings_v2 only');
console.log('PASS runner only expires reservations or repairs bilateral completion');
console.log('PASS runner never writes cancelled/no_show/meetup states');
console.log('PASS terminal reservation locks are cleaned only by trusted reconciliation');
console.log('PASS completed marketplace clients do not own reservation-lock cleanup');
console.log('Reservation runner safety checks: PASS');
