import { OfferIdempotencyWindow, isAlreadyCommittedOfferError, isUncertainOfferWriteError } from '../lib/offerIdempotency';
import { assertFreshOfferExpiry } from '../lib/transactionRetry';
import { assertFirebaseRequestSessionCurrent, sameFirebaseSession, type FirebaseSessionIdentity } from '../lib/firebaseSharedSessionGuard';
import type { Offer, OfferStatus } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { commitWithRateLimit } from './rateLimit';
import { getFirebaseConfig } from './runtimeConfig';

const operations = new OfferIdempotencyWindow();
const DEFAULT_OFFER_TTL_MS = 24 * 60 * 60_000;
const OFFER_LIST_CACHE_TTL_MS = 30_000;
const offerListCache = new Map<string, { offers: Offer[]; expiresAt: number; session: FirebaseSessionIdentity }>();
const offerListInflight = new Map<string, { promise: Promise<Offer[]>; session: FirebaseSessionIdentity }>();

function nowIso() { return new Date().toISOString(); }
function defaultOfferExpiry() { return new Date(Date.now() + DEFAULT_OFFER_TTL_MS).toISOString(); }
function patchWrite(client: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return { update: client.encodeDocumentForWrite(path, data), updateMask: { fieldPaths: Object.keys(data) } };
}
function offerListCacheKey(uid: string, chatId: string) {
  // Encode both components so an attacker-controlled chat ID cannot collide
  // with another UID's cache entry, even when it contains delimiters.
  return `${encodeURIComponent(uid)}:${encodeURIComponent(chatId)}`;
}

function invalidateOfferList(chatId: string) {
  const suffix = `:${encodeURIComponent(chatId)}`;
  for (const key of offerListCache.keys()) {
    if (key.endsWith(suffix)) offerListCache.delete(key);
  }
  for (const key of offerListInflight.keys()) {
    if (key.endsWith(suffix)) offerListInflight.delete(key);
  }
}

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

// Defense in depth: reads used to prepare a commercial mutation may outlive
// logout, A→B switching, or same-UID re-login. Do not proceed from that stale
// snapshot. firebaseRest's network guard remains the authoritative last gate.
function assertOfferMutationSessionCurrent(
  client: FirebaseRestClient,
  requestSession: FirebaseSessionIdentity | null,
) {
  assertFirebaseRequestSessionCurrent(
    requestSession, client.currentSession, new FirebaseRestClient(getFirebaseConfig()).currentSession,
  );
}

async function assertOfferableListing(client: FirebaseRestClient, listingId: string, sellerId: string) {
  const listing = await client.getDocument<any>(`listings_v2/${listingId}`);
  if (!listing) throw new Error('LISTING_NOT_FOUND');
  if (listing.data.seller_id !== sellerId) throw new Error('SELLER_MISMATCH');
  if (listing.data.status !== 'active') throw new Error('LISTING_NOT_ACTIVE');
  if (listing.data.moderation_status !== 'approved') throw new Error('LISTING_NOT_APPROVED');
  // Client-side defense: a reserved listing is not offerable. Server rules and atomic race tests remain separate gates.
  if (listing.data.availability_status === 'reserved') throw new Error('LISTING_ALREADY_RESERVED');
  // Unknown or absent availability is not positive proof of an offerable
  // listing. A stale/partial listing must fail closed, not invite new offers.
  // Historical canonical records may omit this optional field. Preserve that
  // supported legacy case; explicit unknown/null states still fail closed.
  if (listing.data.availability_status !== undefined
    && listing.data.availability_status !== 'available') throw new Error('LISTING_AVAILABILITY_UNVERIFIED');
}

function assertOfferNotExpired(offer: Offer) {
  assertFreshOfferExpiry(offer.expires_at);
}

async function loadCurrentOffer(client: FirebaseRestClient, offerId: string) {
  const stored = await client.getDocument<any>(`offers/${offerId}`);
  if (!stored) throw new Error('OFFER_NOT_FOUND');
  return { id: stored.id, ...stored.data } as Offer;
}

async function assertCurrentPendingParent(client: FirebaseRestClient, parent: Offer, actorId: string) {
  const stored = await client.getDocument<any>(`offers/${parent.id}`);
  if (!stored) throw new Error('PARENT_OFFER_NOT_FOUND');
  const current = { id: stored.id, ...stored.data } as Offer;
  if (current.listing_id !== parent.listing_id || current.chat_id !== parent.chat_id || current.buyer_id !== parent.buyer_id || current.seller_id !== parent.seller_id) {
    throw new Error('PARENT_OFFER_MISMATCH');
  }
  if (current.status !== 'pending') throw new Error('OFFER_NOT_PENDING');
  if ((current.created_by || current.buyer_id) === actorId) throw new Error('COUNTERPARTY_REQUIRED');
  assertOfferNotExpired(current);
  return current;
}

async function recoverCommittedOffer(client: FirebaseRestClient, offerId: string, expected: {
  listingId: string;
  chatId: string;
  buyerId: string;
  sellerId: string;
  actorId: string;
  amountMxn: number;
  parentOfferId?: string;
}) {
  const stored = await client.getDocument<any>(`offers/${offerId}`);
  if (!stored) return null;
  const data = stored.data || {};
  const amount = Math.round(Number(data.amount_mxn) * 100) / 100;
  const expectedAmount = Math.round(expected.amountMxn * 100) / 100;
  const matches = data.listing_id === expected.listingId
    && data.chat_id === expected.chatId
    && data.buyer_id === expected.buyerId
    && data.seller_id === expected.sellerId
    && (data.created_by || data.buyer_id) === expected.actorId
    && amount === expectedAmount
    && String(data.parent_offer_id || '') === String(expected.parentOfferId || '');
  if (!matches) throw new Error('OFFER_IDEMPOTENCY_COLLISION');
  return { id: offerId, ...data } as Offer;
}

async function commitOfferWithRecovery(
  client: FirebaseRestClient,
  operation: { key: string; offerId: string },
  offer: Offer,
  writes: any[],
) {
  const expected = {
    listingId: offer.listing_id,
    chatId: offer.chat_id,
    buyerId: offer.buyer_id,
    sellerId: offer.seller_id,
    actorId: offer.created_by || offer.buyer_id,
    amountMxn: offer.amount_mxn,
    parentOfferId: offer.parent_offer_id,
  };
  try {
    await commitWithRateLimit(client, 'offer_create', writes);
    operations.markSuccess(operation.key);
    invalidateOfferList(offer.chat_id);
    return offer;
  } catch (error) {
    if (isAlreadyCommittedOfferError(error)) {
      const recovered = await recoverCommittedOffer(client, operation.offerId, expected);
      if (recovered) {
        operations.markSuccess(operation.key);
        invalidateOfferList(offer.chat_id);
        return recovered;
      }
    }
    if (isUncertainOfferWriteError(error)) operations.markUncertain(operation.key);
    else operations.forget(operation.key);
    throw error;
  }
}

export const canonicalOffersBackend = {
  async listOffersForChat(chatId: string, force = false) {
    const cleanChatId = chatId.trim();
    if (!cleanChatId) throw new Error('CHAT_ID_REQUIRED');
    // Never return cached private chat offers without checking authentication.
    const client = getClient();
    const requestSession = client.currentSession;
    const key = offerListCacheKey(requestSession!.uid, cleanChatId);
    const assertCurrent = () => assertFirebaseRequestSessionCurrent(
      requestSession, client.currentSession, new FirebaseRestClient(getFirebaseConfig()).currentSession,
    );
    const cached = offerListCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()
      && sameFirebaseSession(cached.session, requestSession)) {
      assertCurrent();
      return cached.offers.map((offer) => ({ ...offer }));
    }
    const inflight = offerListInflight.get(key);
    if (!force && inflight && sameFirebaseSession(inflight.session, requestSession)) {
      assertCurrent();
      return inflight.promise;
    }

    const request = client.runQuery<any>('offers', [{ field: 'chat_id', op: 'EQUAL', value: cleanChatId }], [{ field: 'created_at', direction: 'DESCENDING' }], 30)
      .then((docs) => {
        assertCurrent();
        if (offerListInflight.get(key)?.promise !== request) throw new Error('STALE_OFFER_READ');
        return docs.map((doc) => ({ id: doc.id, ...doc.data } as Offer));
      })
      .then((offers) => {
        assertCurrent();
        if (offerListInflight.get(key)?.promise !== request) throw new Error('STALE_OFFER_READ');
        offerListCache.set(key, { offers, expiresAt: Date.now() + OFFER_LIST_CACHE_TTL_MS, session: requestSession! });
        return offers.map((offer) => ({ ...offer }));
      })
      .finally(() => {
        if (offerListInflight.get(key)?.promise === request) offerListInflight.delete(key);
      });
    offerListInflight.set(key, { promise: request, session: requestSession! });
    return request;
  },

  async updateOffer(offerId: string, status: Extract<OfferStatus, 'accepted' | 'rejected' | 'countered' | 'withdrawn'>, counterOfferId?: string) {
    const client = getClient();
    const requestSession = client.currentSession;
    const actor = requestSession!.uid;
    const current = await loadCurrentOffer(client, offerId);
    assertOfferMutationSessionCurrent(client, requestSession);
    if (actor !== current.buyer_id && actor !== current.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if (current.status !== 'pending') throw new Error('OFFER_NOT_PENDING');
    assertOfferNotExpired(current);
    const creator = current.created_by || current.buyer_id;

    if (status === 'rejected') {
      if (creator === actor) throw new Error('COUNTERPARTY_REQUIRED');
    } else if (status === 'withdrawn') {
      if (creator !== actor) throw new Error('OFFER_CREATOR_REQUIRED');
    } else {
      throw new Error('GENERIC_OFFER_STATUS_DISABLED');
    }

    const at = nowIso();
    await client.setDocument(`offers/${offerId}`, { status, ...(counterOfferId ? { counter_offer_id: counterOfferId } : {}), updated_at: at }, { merge: true });
    invalidateOfferList(current.chat_id);
    return { ...current, status, ...(counterOfferId ? { counter_offer_id: counterOfferId } : {}), updated_at: at } as Offer;
  },

  async createOffer(input: { listingId: string; chatId: string; sellerId: string; amountMxn: number; expiresAt?: string }) {
    assertFreshOfferExpiry(input.expiresAt);
    const client = getClient();
    const requestSession = client.currentSession;
    const buyerId = requestSession!.uid;
    if (buyerId === input.sellerId) throw new Error('SELF_OFFER_DENIED');
    if (!Number.isFinite(input.amountMxn) || input.amountMxn < 1 || input.amountMxn > 1_000_000) throw new Error('INVALID_OFFER_AMOUNT');
    await assertOfferableListing(client, input.listingId, input.sellerId);
    assertOfferMutationSessionCurrent(client, requestSession);
    const amountMxn = Math.round(input.amountMxn * 100) / 100;
    const operation = operations.begin({
      actorId: buyerId,
      listingId: input.listingId,
      chatId: input.chatId,
      sellerId: input.sellerId,
      amountMxn,
    });
    const at = nowIso();
    const offer: Offer = {
      id: operation.offerId,
      listing_id: input.listingId,
      chat_id: input.chatId,
      buyer_id: buyerId,
      seller_id: input.sellerId,
      created_by: buyerId,
      amount_mxn: amountMxn,
      status: 'pending',
      expires_at: input.expiresAt || defaultOfferExpiry(),
      created_at: at,
      updated_at: at,
    };
    const { id: _id, ...data } = offer;
    return commitOfferWithRecovery(client, operation, offer, [
      { update: client.encodeDocumentForWrite(`offers/${operation.offerId}`, data), currentDocument: { exists: false } },
      patchWrite(client, `chats/${input.chatId}`, { current_offer_id: operation.offerId, updated_at: at }),
    ]);
  },

  async createCounterOffer(parent: Offer, amountMxn: number, expiresAt?: string) {
    assertFreshOfferExpiry(expiresAt);
    const client = getClient();
    const requestSession = client.currentSession;
    const actor = requestSession!.uid;
    if (actor !== parent.buyer_id && actor !== parent.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if (!Number.isFinite(amountMxn) || amountMxn < 1 || amountMxn > 1_000_000) throw new Error('INVALID_OFFER_AMOUNT');
    const currentParent = await assertCurrentPendingParent(client, parent, actor);
    assertOfferMutationSessionCurrent(client, requestSession);
    await assertOfferableListing(client, currentParent.listing_id, currentParent.seller_id);
    assertOfferMutationSessionCurrent(client, requestSession);
    const normalizedAmount = Math.round(amountMxn * 100) / 100;
    const operation = operations.begin({
      actorId: actor,
      listingId: currentParent.listing_id,
      chatId: currentParent.chat_id,
      sellerId: currentParent.seller_id,
      amountMxn: normalizedAmount,
      parentOfferId: currentParent.id,
    });
    const at = nowIso();
    const counter: Offer = {
      id: operation.offerId,
      listing_id: currentParent.listing_id,
      chat_id: currentParent.chat_id,
      buyer_id: currentParent.buyer_id,
      seller_id: currentParent.seller_id,
      created_by: actor,
      amount_mxn: normalizedAmount,
      status: 'pending',
      parent_offer_id: currentParent.id,
      expires_at: expiresAt || defaultOfferExpiry(),
      created_at: at,
      updated_at: at,
    };
    const { id: _id, ...data } = counter;
    return commitOfferWithRecovery(client, operation, counter, [
      { update: client.encodeDocumentForWrite(`offers/${operation.offerId}`, data), currentDocument: { exists: false } },
      patchWrite(client, `offers/${currentParent.id}`, { status: 'countered', counter_offer_id: operation.offerId, updated_at: at }),
      patchWrite(client, `chats/${currentParent.chat_id}`, { current_offer_id: operation.offerId, updated_at: at }),
    ]);
  },
};
