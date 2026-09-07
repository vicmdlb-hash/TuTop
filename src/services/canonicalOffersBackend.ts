import { OfferIdempotencyWindow, isAlreadyCommittedOfferError, isUncertainOfferWriteError } from '../lib/offerIdempotency';
import type { Offer } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { commitWithRateLimit } from './rateLimit';
import { getFirebaseConfig } from './runtimeConfig';

const operations = new OfferIdempotencyWindow();
const DEFAULT_OFFER_TTL_MS = 24 * 60 * 60_000;
const OFFER_LIST_CACHE_TTL_MS = 30_000;
const offerListCache = new Map<string, { offers: Offer[]; expiresAt: number }>();
const offerListInflight = new Map<string, Promise<Offer[]>>();

function nowIso() { return new Date().toISOString(); }
function defaultOfferExpiry() { return new Date(Date.now() + DEFAULT_OFFER_TTL_MS).toISOString(); }
function patchWrite(client: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return { update: client.encodeDocumentForWrite(path, data), updateMask: { fieldPaths: Object.keys(data) } };
}
function invalidateOfferList(chatId: string) {
  offerListCache.delete(chatId);
  offerListInflight.delete(chatId);
}

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

async function assertOfferableListing(client: FirebaseRestClient, listingId: string, sellerId: string) {
  const listing = await client.getDocument<any>(`listings_v2/${listingId}`);
  if (!listing) throw new Error('LISTING_NOT_FOUND');
  if (listing.data.seller_id !== sellerId) throw new Error('SELLER_MISMATCH');
  if (listing.data.status !== 'active') throw new Error('LISTING_NOT_ACTIVE');
  if (listing.data.moderation_status !== 'approved') throw new Error('LISTING_NOT_APPROVED');
}

async function assertCurrentPendingParent(client: FirebaseRestClient, parent: Offer, actorId: string) {
  const stored = await client.getDocument<any>(`offers/${parent.id}`);
  if (!stored) throw new Error('PARENT_OFFER_NOT_FOUND');
  const data = stored.data || {};
  if (data.listing_id !== parent.listing_id || data.chat_id !== parent.chat_id || data.buyer_id !== parent.buyer_id || data.seller_id !== parent.seller_id) {
    throw new Error('PARENT_OFFER_MISMATCH');
  }
  if (data.status !== 'pending') throw new Error('OFFER_NOT_PENDING');
  if ((data.created_by || data.buyer_id) === actorId) throw new Error('COUNTERPARTY_REQUIRED');
  const expiresAt = typeof data.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) throw new Error('OFFER_EXPIRED');
  return { id: parent.id, ...data } as Offer;
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
    const cached = offerListCache.get(cleanChatId);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.offers.map((offer) => ({ ...offer }));
    const inflight = offerListInflight.get(cleanChatId);
    if (!force && inflight) return inflight;

    const client = getClient();
    const request = client.runQuery<any>('offers', [{ field: 'chat_id', op: 'EQUAL', value: cleanChatId }], [{ field: 'created_at', direction: 'DESCENDING' }], 30)
      .then((docs) => docs.map((doc) => ({ id: doc.id, ...doc.data } as Offer)))
      .then((offers) => {
        offerListCache.set(cleanChatId, { offers, expiresAt: Date.now() + OFFER_LIST_CACHE_TTL_MS });
        return offers.map((offer) => ({ ...offer }));
      })
      .finally(() => offerListInflight.delete(cleanChatId));
    offerListInflight.set(cleanChatId, request);
    return request;
  },

  async createOffer(input: { listingId: string; chatId: string; sellerId: string; amountMxn: number; expiresAt?: string }) {
    const client = getClient();
    const buyerId = client.currentSession!.uid;
    if (buyerId === input.sellerId) throw new Error('SELF_OFFER_DENIED');
    if (!Number.isFinite(input.amountMxn) || input.amountMxn < 1) throw new Error('INVALID_OFFER_AMOUNT');
    await assertOfferableListing(client, input.listingId, input.sellerId);
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
    const client = getClient();
    const actor = client.currentSession!.uid;
    if (actor !== parent.buyer_id && actor !== parent.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if (!Number.isFinite(amountMxn) || amountMxn < 1) throw new Error('INVALID_OFFER_AMOUNT');
    const currentParent = await assertCurrentPendingParent(client, parent, actor);
    await assertOfferableListing(client, currentParent.listing_id, currentParent.seller_id);
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
