import type { MarketplaceTransaction, ProductStatus } from '../types';

export type ReservationReconciliationPlan =
  | { kind: 'none'; reason: string }
  | { kind: 'expire_reserved'; nextTransactionStatus: 'expired'; nextProductStatus: 'Activo' }
  | { kind: 'repair_expired_listing'; nextProductStatus: 'Activo' }
  | { kind: 'repair_completed_listing'; nextProductStatus: 'Vendido' };

/**
 * Pure planning only. This function performs no writes and is suitable for a future
 * trusted scheduler/admin worker. It intentionally mirrors the current client Rules:
 * only `reserved` may auto-expire; scheduled meetups/disputes are never auto-cancelled.
 */
export function reservationReconciliationPlan(input: {
  transaction: Pick<MarketplaceTransaction,
    'status' | 'reservation_expires_at' | 'buyer_confirmed_at' | 'seller_confirmed_at'>;
  productStatus: ProductStatus;
  nowMs?: number;
}): ReservationReconciliationPlan {
  const { transaction, productStatus } = input;
  const nowMs = input.nowMs ?? Date.now();

  if (transaction.status === 'completed') {
    if (!transaction.buyer_confirmed_at || !transaction.seller_confirmed_at) {
      return { kind: 'none', reason: 'completed_requires_bilateral_confirmation' };
    }
    if (productStatus !== 'Vendido') {
      return { kind: 'repair_completed_listing', nextProductStatus: 'Vendido' };
    }
    return { kind: 'none', reason: 'completed_listing_already_sold' };
  }

  if (transaction.status === 'expired') {
    if (productStatus === 'Reservado') {
      return { kind: 'repair_expired_listing', nextProductStatus: 'Activo' };
    }
    return { kind: 'none', reason: 'expired_listing_already_released' };
  }

  if (transaction.status !== 'reserved') {
    return { kind: 'none', reason: 'status_not_auto_expirable' };
  }

  const expiresMs = transaction.reservation_expires_at ? Date.parse(transaction.reservation_expires_at) : Number.NaN;
  if (!Number.isFinite(expiresMs)) {
    return { kind: 'none', reason: 'reservation_expiry_missing_or_invalid' };
  }
  if (expiresMs > nowMs) {
    return { kind: 'none', reason: 'reservation_still_active' };
  }

  return { kind: 'expire_reserved', nextTransactionStatus: 'expired', nextProductStatus: 'Activo' };
}
