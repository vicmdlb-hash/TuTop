import { isRecoverableTransactionRetryError, transactionMatchesOfferRetry } from '../lib/transactionRetry';
import type { MarketplaceTransaction, Offer } from '../types';
import { canonicalTransactionsBackend } from './canonicalTransactionsBackend';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { getFirebaseConfig } from './runtimeConfig';

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

async function recoverExistingTransaction(offer: Offer, originalError: unknown) {
  if (!isRecoverableTransactionRetryError(originalError)) throw originalError;
  const client = getClient();
  const transactionId = `tx-${offer.id}`;
  let existing;
  try {
    existing = await client.getDocument<any>(`transactions_v2/${transactionId}`);
  } catch {
    throw originalError;
  }
  if (!existing || !transactionMatchesOfferRetry(existing.data, {
    listingId: offer.listing_id,
    chatId: offer.chat_id,
    buyerId: offer.buyer_id,
    sellerId: offer.seller_id,
    offerId: offer.id,
    amountMxn: offer.amount_mxn,
  })) throw originalError;
  return { id: existing.id, ...existing.data } as MarketplaceTransaction;
}

export const canonicalTransactionRetryBackend = {
  async acceptOfferAndCreateTransaction(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    try {
      return await canonicalTransactionsBackend.acceptOfferAndCreateTransaction(offer, reserveMinutes);
    } catch (error) {
      const transaction = await recoverExistingTransaction(offer, error);
      return {
        offer: { ...offer, status: 'accepted' as const, updated_at: transaction.updated_at },
        transaction,
      };
    }
  },

  async createTransactionFromAcceptedOffer(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    try {
      return await canonicalTransactionsBackend.createTransactionFromAcceptedOffer(offer, reserveMinutes);
    } catch (error) {
      return recoverExistingTransaction(offer, error);
    }
  },
};
