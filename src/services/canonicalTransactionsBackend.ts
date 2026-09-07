import { canActOnTransaction, transactionStatusForAction } from '../lib/marketplaceCore';
import type { MarketplaceTransaction, Offer, TransactionOutcomeCode } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { commitWithRateLimit } from './rateLimit';
import { getFirebaseConfig } from './runtimeConfig';

function nowIso() { return new Date().toISOString(); }
function patchWrite(client: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return { update: client.encodeDocumentForWrite(path, data), updateMask: { fieldPaths: Object.keys(data) } };
}
function reservationLockPath(listingId: string) { return `listing_reservation_locks/${listingId}`; }
function reservationLockWrite(client: FirebaseRestClient, transaction: MarketplaceTransaction) {
  const at = transaction.created_at;
  return {
    update: client.encodeDocumentForWrite(reservationLockPath(transaction.listing_id), {
      listing_id: transaction.listing_id,
      transaction_id: transaction.id,
      buyer_id: transaction.buyer_id,
      seller_id: transaction.seller_id,
      created_at: at,
      updated_at: at,
    }),
    currentDocument: { exists: false },
  };
}

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

async function assertActiveCanonicalListing(client: FirebaseRestClient, offer: Offer) {
  const listing = await client.getDocument<any>(`listings_v2/${offer.listing_id}`);
  if (!listing) throw new Error('LISTING_NOT_FOUND');
  if (listing.data.seller_id !== offer.seller_id) throw new Error('SELLER_MISMATCH');
  if (listing.data.status !== 'active') throw new Error('LISTING_NOT_ACTIVE');
  if (listing.data.moderation_status !== 'approved') throw new Error('LISTING_NOT_APPROVED');
}

function assertCancelable(transaction: MarketplaceTransaction, actor: string) {
  if (actor !== transaction.buyer_id && actor !== transaction.seller_id) throw new Error('PARTICIPANT_REQUIRED');
  if (!['reserved', 'meetup_scheduled'].includes(transaction.status)) throw new Error('TRANSACTION_NOT_CANCELLABLE');
  if (transaction.buyer_confirmed_at || transaction.seller_confirmed_at) throw new Error('CONFIRMED_TRANSACTION_NOT_CANCELLABLE');
}

async function terminalTransactionWrites(client: FirebaseRestClient, transaction: MarketplaceTransaction, patch: Record<string, unknown>) {
  const lock = await client.getDocument<any>(reservationLockPath(transaction.listing_id));
  if (lock && lock.data.transaction_id !== transaction.id) throw new Error('RESERVATION_LOCK_MISMATCH');
  return [
    patchWrite(client, `transactions_v2/${transaction.id}`, patch),
    ...(lock ? [{ delete: client.documentName(reservationLockPath(transaction.listing_id)) }] : []),
  ];
}

function normalizeReservationError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/ALREADY_EXISTS|already exists|409/i.test(message)) throw new Error('LISTING_ALREADY_RESERVED');
  throw error;
}

export const canonicalTransactionsBackend = {
  async acceptOfferAndCreateTransaction(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (actor !== offer.buyer_id && actor !== offer.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if ((offer.created_by || offer.buyer_id) === actor) throw new Error('COUNTERPARTY_REQUIRED');
    if (offer.status !== 'pending') throw new Error('OFFER_NOT_PENDING');
    await assertActiveCanonicalListing(client, offer);
    const at = nowIso();

    if (actor !== offer.seller_id) {
      await client.setDocument(`offers/${offer.id}`, { status: 'accepted', updated_at: at }, { merge: true });
      return { offer: { ...offer, status: 'accepted' as const, updated_at: at }, transaction: null };
    }

    const transactionId = `tx-${offer.id}`;
    const transaction: MarketplaceTransaction = {
      id: transactionId,
      listing_id: offer.listing_id,
      chat_id: offer.chat_id,
      buyer_id: offer.buyer_id,
      seller_id: offer.seller_id,
      accepted_offer_id: offer.id,
      agreed_amount_mxn: offer.amount_mxn,
      status: 'reserved',
      reservation_expires_at: new Date(Date.now() + reserveMinutes * 60_000).toISOString(),
      created_at: at,
      updated_at: at,
    };
    const { id: _id, ...transactionData } = transaction;
    try {
      await client.commit([
        patchWrite(client, `offers/${offer.id}`, { status: 'accepted', updated_at: at }),
        { update: client.encodeDocumentForWrite(`transactions_v2/${transactionId}`, transactionData), currentDocument: { exists: false } },
        reservationLockWrite(client, transaction),
        patchWrite(client, `chats/${offer.chat_id}`, { transaction_id: transactionId, current_offer_id: offer.id, updated_at: at }),
      ]);
    } catch (error) { normalizeReservationError(error); }
    return { offer: { ...offer, status: 'accepted' as const, updated_at: at }, transaction };
  },

  async createTransactionFromAcceptedOffer(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (actor !== offer.seller_id) throw new Error('SELLER_REQUIRED');
    if (offer.status !== 'accepted') throw new Error('OFFER_NOT_ACCEPTED');
    await assertActiveCanonicalListing(client, offer);
    const at = nowIso();
    const transactionId = `tx-${offer.id}`;
    const transaction: MarketplaceTransaction = {
      id: transactionId,
      listing_id: offer.listing_id,
      chat_id: offer.chat_id,
      buyer_id: offer.buyer_id,
      seller_id: offer.seller_id,
      accepted_offer_id: offer.id,
      agreed_amount_mxn: offer.amount_mxn,
      status: 'reserved',
      reservation_expires_at: new Date(Date.now() + reserveMinutes * 60_000).toISOString(),
      created_at: at,
      updated_at: at,
    };
    const { id: _id, ...transactionData } = transaction;
    try {
      await client.commit([
        { update: client.encodeDocumentForWrite(`transactions_v2/${transactionId}`, transactionData), currentDocument: { exists: false } },
        reservationLockWrite(client, transaction),
        patchWrite(client, `chats/${offer.chat_id}`, { transaction_id: transactionId, current_offer_id: offer.id, updated_at: at }),
      ]);
    } catch (error) { normalizeReservationError(error); }
    return transaction;
  },

  async loadTransactionForChat(chatId: string) {
    const client = getClient();
    const docs = await client.runQuery<any>('transactions_v2', [{ field: 'chat_id', op: 'EQUAL', value: chatId }], [{ field: 'created_at', direction: 'DESCENDING' }], 5);
    if (!docs.length) return null;
    return { id: docs[0].id, ...docs[0].data } as MarketplaceTransaction;
  },

  async scheduleMeetup(transaction: MarketplaceTransaction, meetingPointId: string, meetupAt: string) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (!canActOnTransaction(transaction, actor, 'schedule_meetup')) throw new Error('TRANSACTION_ACTION_DENIED');
    const meetupMs = Date.parse(meetupAt);
    if (!meetingPointId || !Number.isFinite(meetupMs) || meetupMs <= Date.now() || meetupMs > Date.now() + 30 * 86400000) throw new Error('INVALID_MEETUP');
    const at = nowIso();
    const next = { ...transaction, status: 'meetup_scheduled' as const, meeting_point_id: meetingPointId, meetup_at: new Date(meetupMs).toISOString(), updated_at: at };
    await client.setDocument(`transactions_v2/${transaction.id}`, { status: next.status, meeting_point_id: meetingPointId, meetup_at: next.meetup_at, updated_at: at }, { merge: true });
    return next;
  },

  async confirmDelivery(transaction: MarketplaceTransaction) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (!canActOnTransaction(transaction, actor, 'confirm_delivery')) throw new Error('TRANSACTION_ACTION_DENIED');
    const at = nowIso();
    const status = transactionStatusForAction(transaction, actor, 'confirm_delivery') || transaction.status;
    const field = actor === transaction.buyer_id ? 'buyer_confirmed_at' : 'seller_confirmed_at';
    const next = { ...transaction, [field]: at, status, updated_at: at } as MarketplaceTransaction;
    const confirmationWrite = patchWrite(client, `transactions_v2/${transaction.id}`, { [field]: at, status, updated_at: at });
    if (status === 'completed' && actor === transaction.seller_id) {
      const lock = await client.getDocument<any>(reservationLockPath(transaction.listing_id));
      if (lock && lock.data.transaction_id !== transaction.id) throw new Error('RESERVATION_LOCK_MISMATCH');
      await client.commit([
        confirmationWrite,
        patchWrite(client, `listings_v2/${transaction.listing_id}`, { status: 'sold_out', updated_at: at }),
        ...(lock ? [{ delete: client.documentName(reservationLockPath(transaction.listing_id)) }] : []),
      ]);
    } else await client.commit([confirmationWrite]);
    return next;
  },

  async finalizeCompletedListing(transaction: MarketplaceTransaction) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (actor !== transaction.seller_id) throw new Error('SELLER_REQUIRED');
    if (transaction.status !== 'completed' || !transaction.buyer_confirmed_at || !transaction.seller_confirmed_at) throw new Error('TRANSACTION_NOT_COMPLETED');
    const at = nowIso();
    const lock = await client.getDocument<any>(reservationLockPath(transaction.listing_id));
    if (lock && lock.data.transaction_id !== transaction.id) throw new Error('RESERVATION_LOCK_MISMATCH');
    await client.commit([
      patchWrite(client, `listings_v2/${transaction.listing_id}`, { status: 'sold_out', updated_at: at }),
      ...(lock ? [{ delete: client.documentName(reservationLockPath(transaction.listing_id)) }] : []),
    ]);
  },

  async disputeTransaction(transaction: MarketplaceTransaction) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (!canActOnTransaction(transaction, actor, 'dispute')) throw new Error('TRANSACTION_ACTION_DENIED');
    const at = nowIso();
    await client.setDocument(`transactions_v2/${transaction.id}`, { status: 'disputed', updated_at: at }, { merge: true });
    return { ...transaction, status: 'disputed' as const, updated_at: at };
  },

  async cancelTransaction(transaction: MarketplaceTransaction) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    assertCancelable(transaction, actor);
    const at = nowIso();
    const outcomeCode: TransactionOutcomeCode = actor === transaction.buyer_id ? 'buyer_cancelled' : 'seller_cancelled';
    const patch = { status: 'cancelled' as const, outcome_code: outcomeCode, outcome_actor_id: actor, outcome_recorded_at: at, updated_at: at };
    await client.commit(await terminalTransactionWrites(client, transaction, patch));
    return { ...transaction, ...patch } as MarketplaceTransaction;
  },

  async requestMutualCancellation(transaction: MarketplaceTransaction, institutionId: string) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    assertCancelable(transaction, actor);
    const listing = await client.getDocument<any>(`listings_v2/${transaction.listing_id}`);
    if (!listing || listing.data.institution_id !== institutionId) throw new Error('INSTITUTION_MISMATCH');
    const at = nowIso();
    const requestId = `${transaction.id}-${actor}`;
    await client.setDocument(`transaction_cancellation_requests/${requestId}`, {
      transaction_id: transaction.id,
      requester_uid: actor,
      kind: 'mutual_cancel',
      institution_id: institutionId,
      status: 'open',
      created_at: at,
      updated_at: at,
    }, { exists: false });
    return requestId;
  },

  async claimNoShow(transaction: MarketplaceTransaction, institutionId: string, reason = '') {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (actor !== transaction.buyer_id && actor !== transaction.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if (transaction.status !== 'meetup_scheduled' || !transaction.meetup_at) throw new Error('NO_SHOW_NOT_AVAILABLE');
    const meetupMs = Date.parse(transaction.meetup_at);
    if (!Number.isFinite(meetupMs) || Date.now() < meetupMs + 30 * 60_000) throw new Error('NO_SHOW_TOO_EARLY');
    const listing = await client.getDocument<any>(`listings_v2/${transaction.listing_id}`);
    if (!listing || listing.data.institution_id !== institutionId) throw new Error('INSTITUTION_MISMATCH');
    const accused = actor === transaction.buyer_id ? transaction.seller_id : transaction.buyer_id;
    const kind: TransactionOutcomeCode = accused === transaction.buyer_id ? 'buyer_no_show' : 'seller_no_show';
    const at = nowIso();
    const claimId = `${transaction.id}-${actor}`;
    await commitWithRateLimit(client, 'report_create', [
      {
        update: client.encodeDocumentForWrite(`transaction_outcome_claims/${claimId}`, {
          transaction_id: transaction.id,
          claimant_uid: actor,
          accused_uid: accused,
          kind,
          institution_id: institutionId,
          reason: reason.trim().slice(0, 500),
          status: 'open',
          created_at: at,
          updated_at: at,
        }),
        currentDocument: { exists: false },
      },
    ]);
    return claimId;
  },

  async releaseExpiredReservation(transaction: MarketplaceTransaction) {
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (!canActOnTransaction(transaction, actor, 'expire')) throw new Error('RESERVATION_NOT_EXPIRED');
    const at = nowIso();
    await client.commit(await terminalTransactionWrites(client, transaction, { status: 'expired', updated_at: at }));
    return { ...transaction, status: 'expired' as const, updated_at: at };
  },
};
