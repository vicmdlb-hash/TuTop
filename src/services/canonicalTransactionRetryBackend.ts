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

function assertSameOffer(stored: Offer, expected: Offer) {
  if (stored.id !== expected.id
    || stored.listing_id !== expected.listing_id
    || stored.chat_id !== expected.chat_id
    || stored.buyer_id !== expected.buyer_id
    || stored.seller_id !== expected.seller_id
    || Number(stored.amount_mxn) !== Number(expected.amount_mxn)
    || String(stored.parent_offer_id || '') !== String(expected.parent_offer_id || '')) {
    throw new Error('OFFER_MISMATCH');
  }
}

function assertNotExpired(offer: Offer) {
  const expiresAt = offer.expires_at ? Date.parse(offer.expires_at) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) throw new Error('OFFER_EXPIRED');
}

async function loadStoredOffer(expected: Offer, requiredStatus: 'pending' | 'accepted') {
  const client = getClient();
  const stored = await client.getDocument<any>(`offers/${expected.id}`);
  if (!stored) throw new Error('OFFER_NOT_FOUND');
  const offer = { id: stored.id, ...stored.data } as Offer;
  assertSameOffer(offer, expected);
  if (offer.status !== requiredStatus) throw new Error(requiredStatus === 'pending' ? 'OFFER_NOT_PENDING' : 'OFFER_NOT_ACCEPTED');
  assertNotExpired(offer);
  return offer;
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
    const storedOffer = await loadStoredOffer(offer, 'pending');
    try {
      return await canonicalTransactionsBackend.acceptOfferAndCreateTransaction(storedOffer, reserveMinutes);
    } catch (error) {
      const transaction = await recoverExistingTransaction(storedOffer, error);
      return {
        offer: { ...storedOffer, status: 'accepted' as const, updated_at: transaction.updated_at },
        transaction,
      };
    }
  },

  async createTransactionFromAcceptedOffer(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    const storedOffer = await loadStoredOffer(offer, 'accepted');
    try {
      return await canonicalTransactionsBackend.createTransactionFromAcceptedOffer(storedOffer, reserveMinutes);
    } catch (error) {
      return recoverExistingTransaction(storedOffer, error);
    }
  },
};
