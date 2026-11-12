import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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

// Test the exact current TypeScript helper as isolated credential-free JS.
const terminalStart = backend.indexOf('async function terminalTransactionWrites(');
const terminalEnd = backend.indexOf('async function assertReservationLockConsistent(', terminalStart);
assert(terminalStart >= 0 && terminalEnd > terminalStart);
const terminalHelper = backend.slice(terminalStart, terminalEnd)
  .replace('client: FirebaseRestClient, transaction: MarketplaceTransaction, patch: Record<string, unknown>', 'client, transaction, patch')
  .replace('getDocument<any>', 'getDocument');
assert(terminalHelper.includes('currentDocument: { updateTime: lock.updateTime }'));
const terminalWriteTest = vm.runInNewContext(terminalHelper + '\\nterminalTransactionWrites', {
  reservationLockPath: listing => `listing_reservation_locks/${listing}`,
  patchWrite: (_client, path, data) => ({ update: path, data }),
  reservationAvailabilityWrite: (_client, id, availability) => ({ listing: id, availability }),
  nowIso: () => '2026-11-12T00:00:00Z',
});
const lockFixture = { data: { transaction_id: 'tx-a' }, updateTime: '2026-11-12T01:02:03.123456789Z' };
const mockClient = lock => ({
  getDocument: async () => lock,
  documentName: path => path,
});
const terminalTransaction = { id: 'tx-a', listing_id: 'listing-a' };
const latestWrites = await terminalWriteTest(mockClient(lockFixture), terminalTransaction,
  { status: 'cancelled', updated_at: '2026-11-12T01:05:00Z' });
assert.equal(latestWrites.length, 3);
assert.equal(latestWrites[1].delete, 'listing_reservation_locks/listing-a');
assert.equal(latestWrites[1].currentDocument.updateTime, lockFixture.updateTime,
  'lock deletion must carry the exact Firestore read witness');
await assert.rejects(
  terminalWriteTest(mockClient({ data: { transaction_id: 'tx-a' } }), terminalTransaction, { status: 'expired' }),
  /RESERVATION_LOCK_VERSION_UNKNOWN/,
);
await assert.rejects(
  terminalWriteTest(mockClient({ data: { transaction_id: 'tx-b' }, updateTime: lockFixture.updateTime }),
    terminalTransaction, { status: 'cancelled' }), /RESERVATION_LOCK_MISMATCH/,
);
const noLockWrites = await terminalWriteTest(mockClient(null), terminalTransaction, { status: 'expired' });
assert.equal(noLockWrites.length, 1, 'no existing lock must not create a delete');
console.log('PASS terminal transaction locks use exact updateTime delete preconditions, reject missing witness');

// Pure synthetic inventory tests: do NOT contact Firestore or use credentials.
const { assertCompleteReconciliationPage, validateReconciliationInventoryPage } = await import('./reservation-reconcile-inventory-lib.mjs');
const { collectCursorPages } = await import('./firestore-query-pagination.mjs');
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
assert.match(runner, /validateReconciliationInventoryPage/);
assert.match(runner, /collectCursorPages/);
assert.match(runner, /RECONCILE_MAX_PAGES_INVALID/);
assert.match(runner, /RECONCILE_LIMIT_INVALID/);

// Cursor pagination must exhaust all pages, including exact-boundary pages.
const rows12 = Array.from({ length: 12 }, (_, n) => inventoryRow('ID' + String(n).padStart(3, '0')));
let pagesRead = 0;
const collected = await collectCursorPages(async ({ afterName, pageSize }) => {
  pagesRead += 1;
  const start = afterName ? rows12.findIndex(x => x.document.name === afterName) + 1 : 0;
  return validateReconciliationInventoryPage(rows12.slice(start, start + pageSize),
    { ...inventoryScope, limit: pageSize }).map(doc => ({ name: doc.name }));
}, { pageSize: 3, maxPages: 10 });
assert.equal(collected.length, 12);
assert.equal(pagesRead, 5, 'full last page must be followed by a final empty query');
assert.equal(new Set(collected.map(x => x.name)).size, 12);
assert.equal(validateReconciliationInventoryPage(rows12.slice(0, 3), inventoryScope).length, 3);
for (const invalid of [
  [{}], [{ document: null }],
  [{ document: { name: rows12[0].document.name + '/nested' } }],
  Array.from({ length: 4 }, (_, n) => inventoryRow('X' + n)),
]) assert.throws(() => validateReconciliationInventoryPage(invalid, inventoryScope),
  /RECONCILE_INVENTORY_/);
await assert.rejects(collectCursorPages(async ({ pageSize }) =>
  validateReconciliationInventoryPage([rows12[0]], { ...inventoryScope, limit: pageSize })
    .map(doc => ({ name: doc.name })),
  { pageSize: 1, maxPages: 2 }), /QUERY_CURSOR_NOT_ADVANCING/);
assert.match(runner, /id: document.name.split/);
assert.match(runner, /name: document.name/);
console.log('PASS reservation inventory paginates all pages and rejects malformed cursors');

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
