import assert from 'node:assert/strict';
import { reservationReconciliationPlan } from '../src/lib/reservationReconciliation.ts';

const nowMs = Date.parse('2026-09-05T18:00:00.000Z');

assert.deepEqual(
  reservationReconciliationPlan({
    transaction: { status: 'reserved', reservation_expires_at: '2026-09-05T17:59:59.000Z' },
    listingStatus: 'active',
    nowMs,
  }),
  { kind: 'expire_reserved', nextTransactionStatus: 'expired' },
);

assert.equal(
  reservationReconciliationPlan({
    transaction: { status: 'reserved', reservation_expires_at: '2026-09-05T18:30:00.000Z' },
    listingStatus: 'active',
    nowMs,
  }).kind,
  'none',
);

assert.deepEqual(
  reservationReconciliationPlan({
    transaction: { status: 'expired', reservation_expires_at: '2026-09-05T17:00:00.000Z' },
    listingStatus: 'active',
    nowMs,
  }),
  { kind: 'none', reason: 'expired_transaction_listing_unchanged' },
);

assert.deepEqual(
  reservationReconciliationPlan({
    transaction: {
      status: 'completed',
      buyer_confirmed_at: '2026-09-05T17:10:00.000Z',
      seller_confirmed_at: '2026-09-05T17:11:00.000Z',
    },
    listingStatus: 'active',
    nowMs,
  }),
  { kind: 'repair_completed_listing', nextListingStatus: 'sold_out' },
);

assert.equal(
  reservationReconciliationPlan({
    transaction: { status: 'completed', buyer_confirmed_at: '2026-09-05T17:10:00.000Z' },
    listingStatus: 'active',
    nowMs,
  }).kind,
  'none',
);

for (const status of ['meetup_scheduled', 'disputed', 'cancelled', 'no_show']) {
  const plan = reservationReconciliationPlan({
    transaction: { status, reservation_expires_at: '2026-09-05T17:00:00.000Z' },
    listingStatus: 'active',
    nowMs,
  });
  assert.equal(plan.kind, 'none', `${status} must not auto-expire`);
  assert.equal(plan.reason, 'status_not_auto_expirable');
}

assert.equal(
  reservationReconciliationPlan({ transaction: { status: 'reserved' }, listingStatus: 'active', nowMs }).reason,
  'reservation_expiry_missing_or_invalid',
);

console.log('PASS expired reserved transactions expire without mutating canonical listing');
console.log('PASS completed bilateral transactions repair listing to sold_out');
console.log('PASS scheduled meetups/disputes are never auto-expired');
console.log('PASS malformed expiry never triggers an automatic write plan');
console.log('Reservation reconciliation tests: PASS');
