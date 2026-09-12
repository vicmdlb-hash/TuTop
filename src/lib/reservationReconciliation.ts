import type { MarketplaceTransaction } from '../types';
import type { CanonicalListingStatus } from './marketplaceGovernance';

export type ReservationReconciliationPlan =
  | { kind: 'none'; reason: string }
  | { kind: 'expire_reserved'; nextTransactionStatus: 'expired' }
  | { kind: 'repair_completed_listing'; nextListingStatus: 'sold_out' };

/**
 * Pure planning for the canonical V2 model.
 * Reservation belongs exclusively to `transactions_v2`; an active listing is not
 * mutated merely because one buyer has a reservation. Only a bilateral completed
 * transaction may force the listing to `sold_out`.
 */
export function reservationReconciliationPlan(input: {
  transaction: Pick<MarketplaceTransaction,
    'status' | 'reservation_expires_at' | 'buyer_confirmed_at' | 'seller_confirmed_at'>;
  listingStatus: CanonicalListingStatus;
  nowMs?: number;
}): ReservationReconciliationPlan {
  const { transaction, listingStatus } = input;
  const nowMs = input.nowMs ?? Date.now();

  if (transaction.status === 'completed') {
    if (!transaction.buyer_confirmed_at || !transaction.seller_confirmed_at) {
      return { kind: 'none', reason: 'completed_requires_bilateral_confirmation' };
    }
    if (listingStatus !== 'sold_out') {
      return { kind: 'repair_completed_listing', nextListingStatus: 'sold_out' };
    }
    return { kind: 'none', reason: 'completed_listing_already_sold' };
  }

  // Expiration never needs to "release" the listing in V2 because reservation
  // does not change canonical listing status in the first place.
  if (transaction.status === 'expired') {
    return { kind: 'none', reason: 'expired_transaction_listing_unchanged' };
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

  return { kind: 'expire_reserved', nextTransactionStatus: 'expired' };
}
