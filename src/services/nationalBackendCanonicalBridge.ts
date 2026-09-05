import { canonicalTransactionsBackend } from './canonicalTransactionsBackend';
import { nationalBackend, nationalSchemaEnabled } from './nationalBackend';

// Transitional 0.8.5 adapter: callers keep the nationalBackend API while V2
// reservation/completion semantics move entirely to transactions_v2 + listings_v2.
// The stable V1 path remains untouched because this bridge only overrides methods
// when VITE_TUTOP_SCHEMA_V2 is enabled at runtime.
if (nationalSchemaEnabled()) {
  Object.assign(nationalBackend, {
    acceptOfferAndCreateTransaction: canonicalTransactionsBackend.acceptOfferAndCreateTransaction,
    createTransactionFromAcceptedOffer: canonicalTransactionsBackend.createTransactionFromAcceptedOffer,
    loadTransactionForChat: canonicalTransactionsBackend.loadTransactionForChat,
    scheduleMeetup: canonicalTransactionsBackend.scheduleMeetup,
    confirmDelivery: canonicalTransactionsBackend.confirmDelivery,
    finalizeCompletedListing: canonicalTransactionsBackend.finalizeCompletedListing,
    disputeTransaction: canonicalTransactionsBackend.disputeTransaction,
    releaseExpiredReservation: canonicalTransactionsBackend.releaseExpiredReservation,
  });
}
