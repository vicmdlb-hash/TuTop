import assert from 'node:assert/strict';
import fs from 'node:fs';

const runner = fs.readFileSync('scripts/reconcile-v2-reservations.mjs', 'utf8');
const domain = fs.readFileSync('src/lib/reservationReconciliation.ts', 'utf8');

assert.match(runner, /process\.argv\.includes\('--apply'\)/);
assert.match(runner, /TUTOP_ALLOW_V2_RECONCILE/);
assert.match(runner, /allow !== 'staging-v2'/);
assert.match(runner, /historicalProject = 'tutop-3a4f7'/);
assert.match(runner, /projectId === historicalProject/);
assert.match(runner, /DRY RUN: no se escribió nada/);
assert.match(runner, /requestJson\(`\$\{base\}:commit`/);
assert.match(runner, /status: 'expired'/);
assert.match(runner, /estado: 'Activo'/);
assert.match(runner, /estado: 'Vendido'/);
assert.match(domain, /transaction\.status !== 'reserved'/);
assert.match(domain, /status_not_auto_expirable/);
assert.doesNotMatch(runner, /status: 'cancelled'/);
assert.doesNotMatch(runner, /status: 'no_show'/);
assert.doesNotMatch(runner, /meetup_scheduled.*status:/s);

console.log('PASS reservation runner is dry-run by default');
console.log('PASS apply mode requires explicit staging-v2 permission');
console.log('PASS historical Firebase project is blocked');
console.log('PASS runner only repairs expired/completed deterministic states');
console.log('PASS runner never writes cancelled/no_show/meetup states');
console.log('Reservation runner safety checks: PASS');
