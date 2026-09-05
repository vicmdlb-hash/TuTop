import assert from 'node:assert/strict';
import { reservationReconciliationPlan } from '../src/lib/reservationReconciliation.ts';

const nowMs = Date.parse('2026-09-05T18:00:00.000Z');

assert.deepEqual(
  reservationReconciliationPlan({
    transaction: { status: 'reserved', reservation_expires_at: '2026-09-05T17:59:59.000Z' },
    productStatus: 'Reservado',
    nowMs,
  }),
  { kind: 'expire_reserved', nextTransactionStatus: 'expired', nextProductStatus: 'Activo' },
);

assert.equal(
  reservationReconciliationPlan({
    transaction: { status: 'reserved', reservation_expires_at: '2026-09-05T18:30:00.000Z' },
    productStatus: 'Reservado',
    nowMs,
  }).kind,
  'none',
);

assert.deepEqual(
  reservationReconciliationPlan({
    transaction: { status: 'expired', reservation_expires_at: '2026-09-05T17:00:00.000Z' },
    productStatus: 'Reservado',
    nowMs,
  }),
  { kind: 'repair_expired_listing', nextProductStatus: 'Activo' },
);

assert.deepEqual(
  reservationReconciliationPlan({
    transaction: {
      status: 'completed',
      buyer_confirmed_at: '2026-09-05T17:10:00.000Z',
      seller_confirmed_at: '2026-09-05T17:11:00.000Z',
    },
    productStatus: 'Reservado',
    nowMs,
  }),
  { kind: 'repair_completed_listing', nextProductStatus: 'Vendido' },
);

assert.equal(
  reservationReconciliationPlan({
    transaction: { status: 'completed', buyer_confirmed_at: '2026-09-05T17:10:00.000Z' },
    productStatus: 'Reservado',
    nowMs,
  }).kind,
  'none',
);

for (const status of ['meetup_scheduled', 'disputed', 'cancelled', 'no_show']) {
  const plan = reservationReconciliationPlan({
    transaction: { status, reservation_expires_at: '2026-09-05T17:00:00.000Z' },
    productStatus: 'Reservado',
    nowMs,
  });
  assert.equal(plan.kind, 'none', `${status} must not auto-expire`);
  assert.equal(plan.reason, 'status_not_auto_expirable');
}

assert.equal(
  reservationReconciliationPlan({ transaction: { status: 'reserved' }, productStatus: 'Reservado', nowMs }).reason,
  'reservation_expiry_missing_or_invalid',
);

console.log('PASS expired reserved transactions produce deterministic release plan');
console.log('PASS completed bilateral transactions repair listing to Vendido');
console.log('PASS scheduled meetups/disputes are never auto-expired');
console.log('PASS malformed expiry never triggers an automatic write plan');
console.log('Reservation reconciliation tests: PASS');
