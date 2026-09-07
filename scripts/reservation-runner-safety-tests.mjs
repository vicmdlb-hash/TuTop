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

assert.match(backend, /Client authority ends at the authoritative sale close/);
assert.doesNotMatch(backend, /releaseCompletedLockBestEffort/);
assert.match(lockRuleHardener, /completed queda reservado a cleanup trusted/);
assert.doesNotMatch(lockRuleHardener, /data\.status == 'completed'.*allow delete/s);

console.log('PASS reservation runner is dry-run by default');
console.log('PASS apply mode requires explicit staging-v2 permission');
console.log('PASS historical Firebase project is blocked');
console.log('PASS runner uses canonical listings_v2 only');
console.log('PASS runner only expires reservations or repairs bilateral completion');
console.log('PASS runner never writes cancelled/no_show/meetup states');
console.log('PASS terminal reservation locks are cleaned only by trusted reconciliation');
console.log('PASS completed marketplace clients do not own reservation-lock cleanup');
console.log('Reservation runner safety checks: PASS');
