import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';
import { canActOnTransaction, transactionStatusForAction } from '../lib/marketplaceCore';
import type { DemandRequest, ListingVisibilityScope, MarketplaceTransaction, Offer, OfferStatus, Product, SavedSearch, UniversityIdentity } from '../types';

function nowIso() { return new Date().toISOString(); }
function localId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function patchWrite(client: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return {
    update: client.encodeDocumentForWrite(path, data),
    updateMask: { fieldPaths: Object.keys(data) },
  };
}

export function nationalSchemaEnabled() {
  return String(import.meta.env.VITE_TUTOP_SCHEMA_V2 || '').toLowerCase() === 'true';
}

class NationalMarketplaceBackend {
  private getClient() {
    const config = getFirebaseConfig();
    if (!config) throw new Error('FIREBASE_NOT_CONFIGURED');
    return new FirebaseRestClient(config);
  }

  private requireV2() {
    if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  }

  async updateUniversityIdentity(identity: UniversityIdentity, legacyFaculty: string) {
    this.requireV2();
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    if (!identity.institution_id) throw new Error('INSTITUTION_REQUIRED');
    await client.setDocument(`users/${uid}`, {
      facultad: legacyFaculty.trim().slice(0, 120), country_code: 'MX', state_code: identity.state_code,
      city_id: identity.city_id, city_name: identity.city_name, institution_id: identity.institution_id,
      institution_name: identity.institution_name, campus_id: identity.campus_id, campus_name: identity.campus_name,
      faculty_id: identity.faculty_id, faculty_name: identity.faculty_name, career_id: identity.career_id,
      career_name: identity.career_name, updated_at: nowIso(),
    }, { merge: true });
  }

  async enrichListing(listingId: string, metadata: {
    country_code?: 'MX'; state_code?: string; city_id?: string; city_name?: string;
    institution_id?: string; campus_id?: string; faculty_id?: string; career_id?: string;
    visibility_scope?: ListingVisibilityScope; listing_kind?: 'offer'; shipping_available?: boolean; meeting_point_id?: string;
  }) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    await client.setDocument(`products/${listingId}`, { ...metadata, updated_at: nowIso() }, { merge: true });
  }

  async loadListingMetadata(limit = 200) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    const docs = await client.runQuery<any>('products', [], [{ field: 'fecha_creacion', direction: 'DESCENDING' }], limit);
    const map: Record<string, Partial<Product>> = {};
    for (const doc of docs) {
      const data = doc.data || {};
      map[doc.id] = {
        country_code: data.country_code, state_code: data.state_code, city_id: data.city_id, city_name: data.city_name,
        institution_id: data.institution_id, campus_id: data.campus_id, faculty_id: data.faculty_id, career_id: data.career_id,
        visibility_scope: data.visibility_scope, listing_kind: data.listing_kind, shipping_available: data.shipping_available, estado: data.estado,
      };
    }
    return map;
  }

  async createOffer(input: { listingId: string; chatId: string; sellerId: string; amountMxn: number; expiresAt?: string }) {
    this.requireV2();
    const client = this.getClient();
    const buyerId = client.currentSession?.uid;
    if (!buyerId) throw new Error('AUTH_REQUIRED');
    if (!Number.isFinite(input.amountMxn) || input.amountMxn < 1) throw new Error('INVALID_OFFER_AMOUNT');
    const offerId = localId('offer');
    const at = nowIso();
    const offer: Offer = {
      id: offerId, listing_id: input.listingId, chat_id: input.chatId, buyer_id: buyerId, seller_id: input.sellerId,
      created_by: buyerId, amount_mxn: Math.round(input.amountMxn * 100) / 100, status: 'pending',
      expires_at: input.expiresAt, created_at: at, updated_at: at,
    };
    const { id: _id, ...data } = offer;
    await client.commit([
      { update: client.encodeDocumentForWrite(`offers/${offerId}`, data), currentDocument: { exists: false } },
      patchWrite(client, `chats/${input.chatId}`, { current_offer_id: offerId, updated_at: at }),
    ]);
    return offer;
  }

  async createCounterOffer(parent: Offer, amountMxn: number, expiresAt?: string) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (actor !== parent.buyer_id && actor !== parent.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if ((parent.created_by || parent.buyer_id) === actor) throw new Error('COUNTERPARTY_REQUIRED');
    if (parent.status !== 'pending') throw new Error('OFFER_NOT_PENDING');
    if (!Number.isFinite(amountMxn) || amountMxn < 1) throw new Error('INVALID_OFFER_AMOUNT');
    const offerId = localId('offer');
    const at = nowIso();
    const counter: Offer = {
      id: offerId,
      listing_id: parent.listing_id,
      chat_id: parent.chat_id,
      buyer_id: parent.buyer_id,
      seller_id: parent.seller_id,
      created_by: actor,
      amount_mxn: Math.round(amountMxn * 100) / 100,
      status: 'pending',
      parent_offer_id: parent.id,
      expires_at: expiresAt || new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      created_at: at,
      updated_at: at,
    };
    const { id: _id, ...data } = counter;
    await client.commit([
      { update: client.encodeDocumentForWrite(`offers/${offerId}`, data), currentDocument: { exists: false } },
      patchWrite(client, `offers/${parent.id}`, { status: 'countered', counter_offer_id: offerId, updated_at: at }),
      patchWrite(client, `chats/${parent.chat_id}`, { current_offer_id: offerId, updated_at: at }),
    ]);
    return counter;
  }

  async listOffersForChat(chatId: string) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    const docs = await client.runQuery<any>('offers', [{ field: 'chat_id', op: 'EQUAL', value: chatId }], [{ field: 'created_at', direction: 'DESCENDING' }], 30);
    return docs.map((doc) => ({ id: doc.id, ...doc.data } as Offer));
  }

  async updateOffer(offerId: string, status: Extract<OfferStatus, 'accepted' | 'rejected' | 'countered' | 'withdrawn'>, counterOfferId?: string) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    await client.setDocument(`offers/${offerId}`, { status, ...(counterOfferId ? { counter_offer_id: counterOfferId } : {}), updated_at: nowIso() }, { merge: true });
  }

  async acceptOffer(offer: Offer) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (actor !== offer.buyer_id && actor !== offer.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if ((offer.created_by || offer.buyer_id) === actor) throw new Error('COUNTERPARTY_REQUIRED');
    await this.updateOffer(offer.id, 'accepted');
    return { ...offer, status: 'accepted' as const, updated_at: nowIso() };
  }

  async createTransactionFromAcceptedOffer(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (actor !== offer.seller_id) throw new Error('SELLER_REQUIRED');
    if (offer.status !== 'accepted') throw new Error('OFFER_NOT_ACCEPTED');
    const at = nowIso();
    const transactionId = `tx-${offer.id}`;
    const transaction: MarketplaceTransaction = {
      id: transactionId, listing_id: offer.listing_id, chat_id: offer.chat_id, buyer_id: offer.buyer_id, seller_id: offer.seller_id,
      accepted_offer_id: offer.id, agreed_amount_mxn: offer.amount_mxn, status: 'reserved',
      reservation_expires_at: new Date(Date.now() + reserveMinutes * 60_000).toISOString(), created_at: at, updated_at: at,
    };
    const { id: _id, ...data } = transaction;
    await client.commit([
      { update: client.encodeDocumentForWrite(`transactions_v2/${transactionId}`, data), currentDocument: { exists: false } },
      patchWrite(client, `chats/${offer.chat_id}`, { transaction_id: transactionId, current_offer_id: offer.id, updated_at: at }),
      patchWrite(client, `products/${offer.listing_id}`, { estado: 'Reservado', updated_at: at }),
    ]);
    return transaction;
  }

  async acceptOfferAndCreateTransaction(offer: Offer, reserveMinutes: 30 | 120 | 1440 = 120) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (actor !== offer.buyer_id && actor !== offer.seller_id) throw new Error('PARTICIPANT_REQUIRED');
    if ((offer.created_by || offer.buyer_id) === actor) throw new Error('COUNTERPARTY_REQUIRED');
    if (offer.status !== 'pending') throw new Error('OFFER_NOT_PENDING');

    if (actor !== offer.seller_id) {
      const accepted = await this.acceptOffer(offer);
      return { offer: accepted, transaction: null };
    }

    const at = nowIso();
    const accepted: Offer = { ...offer, status: 'accepted', updated_at: at };
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
    await client.commit([
      patchWrite(client, `offers/${offer.id}`, { status: 'accepted', updated_at: at }),
      { update: client.encodeDocumentForWrite(`transactions_v2/${transactionId}`, transactionData), currentDocument: { exists: false } },
      patchWrite(client, `chats/${offer.chat_id}`, { transaction_id: transactionId, current_offer_id: offer.id, updated_at: at }),
      patchWrite(client, `products/${offer.listing_id}`, { estado: 'Reservado', updated_at: at }),
    ]);
    return { offer: accepted, transaction };
  }

  async loadTransactionForChat(chatId: string) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    const docs = await client.runQuery<any>('transactions_v2', [{ field: 'chat_id', op: 'EQUAL', value: chatId }], [{ field: 'created_at', direction: 'DESCENDING' }], 5);
    if (!docs.length) return null;
    const doc = docs[0];
    return { id: doc.id, ...doc.data } as MarketplaceTransaction;
  }

  async scheduleMeetup(transaction: MarketplaceTransaction, meetingPointId: string, meetupAt: string) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (!canActOnTransaction(transaction, actor, 'schedule_meetup')) throw new Error('TRANSACTION_ACTION_DENIED');
    const meetupMs = Date.parse(meetupAt);
    if (!meetingPointId || !Number.isFinite(meetupMs) || meetupMs <= Date.now() || meetupMs > Date.now() + 30 * 86400000) throw new Error('INVALID_MEETUP');
    const at = nowIso();
    const next: MarketplaceTransaction = { ...transaction, status: 'meetup_scheduled', meeting_point_id: meetingPointId, meetup_at: new Date(meetupMs).toISOString(), updated_at: at };
    await client.setDocument(`transactions_v2/${transaction.id}`, {
      status: next.status, meeting_point_id: meetingPointId, meetup_at: next.meetup_at, updated_at: at,
    }, { merge: true });
    return next;
  }

  async confirmDelivery(transaction: MarketplaceTransaction) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (!canActOnTransaction(transaction, actor, 'confirm_delivery')) throw new Error('TRANSACTION_ACTION_DENIED');
    const at = nowIso();
    const status = transactionStatusForAction(transaction, actor, 'confirm_delivery') || transaction.status;
    const field = actor === transaction.buyer_id ? 'buyer_confirmed_at' : 'seller_confirmed_at';
    const next = { ...transaction, [field]: at, status, updated_at: at } as MarketplaceTransaction;
    const confirmationWrite = patchWrite(client, `transactions_v2/${transaction.id}`, { [field]: at, status, updated_at: at });
    if (status === 'completed' && actor === transaction.seller_id) {
      await client.commit([
        confirmationWrite,
        patchWrite(client, `products/${transaction.listing_id}`, { estado: 'Vendido', updated_at: at }),
      ]);
    } else {
      await client.commit([confirmationWrite]);
    }
    return next;
  }

  async finalizeCompletedListing(transaction: MarketplaceTransaction) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (actor !== transaction.seller_id) throw new Error('SELLER_REQUIRED');
    if (transaction.status !== 'completed' || !transaction.buyer_confirmed_at || !transaction.seller_confirmed_at) throw new Error('TRANSACTION_NOT_COMPLETED');
    const at = nowIso();
    await client.setDocument(`products/${transaction.listing_id}`, { estado: 'Vendido', updated_at: at }, { merge: true });
    return { ...transaction, updated_at: at };
  }

  async disputeTransaction(transaction: MarketplaceTransaction) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (!canActOnTransaction(transaction, actor, 'dispute')) throw new Error('TRANSACTION_ACTION_DENIED');
    const at = nowIso();
    const next = { ...transaction, status: 'disputed' as const, updated_at: at };
    await client.setDocument(`transactions_v2/${transaction.id}`, { status: 'disputed', updated_at: at }, { merge: true });
    return next;
  }

  async releaseExpiredReservation(transaction: MarketplaceTransaction) {
    this.requireV2();
    const client = this.getClient();
    const actor = client.currentSession?.uid;
    if (!actor) throw new Error('AUTH_REQUIRED');
    if (!canActOnTransaction(transaction, actor, 'expire')) throw new Error('RESERVATION_NOT_EXPIRED');
    const at = nowIso();
    await client.commit([
      patchWrite(client, `transactions_v2/${transaction.id}`, { status: 'expired', updated_at: at }),
      patchWrite(client, `products/${transaction.listing_id}`, { estado: 'Activo', updated_at: at }),
    ]);
    return { ...transaction, status: 'expired' as const, updated_at: at };
  }

  async createDemandRequest(input: Omit<DemandRequest, 'id' | 'buyer_id' | 'status' | 'created_at' | 'updated_at'>) {
    this.requireV2();
    const client = this.getClient();
    const buyerId = client.currentSession?.uid;
    if (!buyerId) throw new Error('AUTH_REQUIRED');
    const requestId = localId('wanted');
    const at = nowIso();
    const request: DemandRequest = { id: requestId, buyer_id: buyerId, ...input, status: 'active', created_at: at, updated_at: at };
    const { id: _id, ...data } = request;
    await client.setDocument(`demand_requests/${requestId}`, data, { exists: false });
    return request;
  }

  async saveSearch(input: Omit<SavedSearch, 'id' | 'owner_uid' | 'created_at' | 'updated_at'>) {
    this.requireV2();
    const client = this.getClient();
    const ownerUid = client.currentSession?.uid;
    if (!ownerUid) throw new Error('AUTH_REQUIRED');
    const searchId = localId('search');
    const at = nowIso();
    const saved: SavedSearch = { id: searchId, owner_uid: ownerUid, ...input, created_at: at, updated_at: at };
    const { id: _id, ...data } = saved;
    await client.setDocument(`saved_searches/${searchId}`, data, { exists: false });
    return saved;
  }
}

export const nationalBackend = new NationalMarketplaceBackend();
