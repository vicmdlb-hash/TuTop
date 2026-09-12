import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyReservationLockResidue } from './reservation-lock-residue-audit.mjs';

const lock = { id: 'listing-1', transaction_id: 'tx-1', listing_id: 'listing-1' };
const activeTx = { id: 'tx-1', listing_id: 'listing-1', status: 'reserved' };
const activeListing = { id: 'listing-1', status: 'active' };
assert.deepEqual(classifyReservationLockResidue(lock, activeTx, activeListing), { severity: 'expected', reason: 'active_transaction_lock' });

assert.equal(classifyReservationLockResidue(lock, null, activeListing).reason, 'orphan_lock_missing_transaction');
assert.equal(classifyReservationLockResidue(lock, { ...activeTx, id: 'tx-2' }, activeListing).reason, 'lock_transaction_mismatch');
assert.equal(classifyReservationLockResidue(lock, activeTx, null).reason, 'lock_listing_missing');
assert.match(classifyReservationLockResidue(lock, activeTx, { id: 'listing-1', status: 'sold_out' }).reason, /active_transaction_listing/);

const completed = {
  id: 'tx-1', listing_id: 'listing-1', status: 'completed',
  buyer_confirmed_at: '2026-09-07T00:00:00.000Z', seller_confirmed_at: '2026-09-07T00:01:00.000Z',
};
assert.equal(classifyReservationLockResidue(lock, completed, { id: 'listing-1', status: 'sold_out' }).reason, 'terminal_completed_lock_residue');
for (const status of ['cancelled', 'expired', 'no_show']) {
  assert.equal(classifyReservationLockResidue(lock, { ...activeTx, status }, activeListing).reason, `terminal_${status}_lock_residue`);
}
assert.match(classifyReservationLockResidue(lock, { ...activeTx, status: 'mystery' }, activeListing).reason, /unknown_transaction_status/);

const source = fs.readFileSync('scripts/reservation-lock-residue-audit.mjs', 'utf8');
assert.doesNotMatch(source, /deleteWrite|:commit/);
assert.match(source, /transactions_v2\/\$\{lock\.transaction_id\}/);
assert.match(source, /listings_v2\/\$\{lock\.listing_id\}/);
assert.match(source, /No se borran automáticamente/);

console.log('PASS active reservation locks are recognized as expected');
console.log('PASS orphan/mismatched/missing and terminal residues fail closed');
console.log('PASS post-maintenance auditor performs direct document verification');
console.log('PASS residue auditor is read-only and never deletes ambiguous locks');
console.log('Reservation lock residue audit tests: PASS');
