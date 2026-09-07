import { canonicalOffersBackend } from './canonicalOffersBackend';
import { canonicalTransactionsBackend } from './canonicalTransactionsBackend';
import { nationalBackend, nationalSchemaEnabled } from './nationalBackend';

// Transitional 0.9 adapter: callers keep the nationalBackend API while V2
// offer/reservation/completion/cancellation semantics live in canonical backends.
// The stable V1 path remains untouched because this bridge only overrides methods
// when VITE_TUTOP_SCHEMA_V2 is enabled at runtime.
if (nationalSchemaEnabled()) {
  Object.assign(nationalBackend, {
    createOffer: canonicalOffersBackend.createOffer,
    createCounterOffer: canonicalOffersBackend.createCounterOffer,
    acceptOfferAndCreateTransaction: canonicalTransactionsBackend.acceptOfferAndCreateTransaction,
    createTransactionFromAcceptedOffer: canonicalTransactionsBackend.createTransactionFromAcceptedOffer,
    loadTransactionForChat: canonicalTransactionsBackend.loadTransactionForChat,
    scheduleMeetup: canonicalTransactionsBackend.scheduleMeetup,
    confirmDelivery: canonicalTransactionsBackend.confirmDelivery,
    finalizeCompletedListing: canonicalTransactionsBackend.finalizeCompletedListing,
    disputeTransaction: canonicalTransactionsBackend.disputeTransaction,
    cancelTransaction: canonicalTransactionsBackend.cancelTransaction,
    requestMutualCancellation: canonicalTransactionsBackend.requestMutualCancellation,
    claimNoShow: canonicalTransactionsBackend.claimNoShow,
    releaseExpiredReservation: canonicalTransactionsBackend.releaseExpiredReservation,
  });
}
