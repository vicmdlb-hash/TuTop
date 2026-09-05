import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';
import type { DemandRequest, ListingVisibilityScope, Offer, OfferStatus, SavedSearch, UniversityIdentity } from '../types';

function nowIso() { return new Date().toISOString(); }
function localId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
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
      facultad: legacyFaculty.trim().slice(0, 120),
      country_code: 'MX',
      state_code: identity.state_code,
      city_id: identity.city_id,
      city_name: identity.city_name,
      institution_id: identity.institution_id,
      institution_name: identity.institution_name,
      campus_id: identity.campus_id,
      campus_name: identity.campus_name,
      faculty_id: identity.faculty_id,
      faculty_name: identity.faculty_name,
      career_id: identity.career_id,
      career_name: identity.career_name,
      updated_at: nowIso(),
    }, { merge: true });
  }

  async enrichListing(listingId: string, metadata: {
    country_code?: 'MX'; state_code?: string; city_id?: string; city_name?: string;
    institution_id?: string; campus_id?: string; faculty_id?: string; career_id?: string;
    visibility_scope?: ListingVisibilityScope; listing_kind?: 'offer'; shipping_available?: boolean;
    meeting_point_id?: string;
  }) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    await client.setDocument(`products/${listingId}`, { ...metadata, updated_at: nowIso() }, { merge: true });
  }

  async createOffer(input: { listingId: string; chatId: string; sellerId: string; amountMxn: number; expiresAt?: string; parentOfferId?: string }) {
    this.requireV2();
    const client = this.getClient();
    const buyerId = client.currentSession?.uid;
    if (!buyerId) throw new Error('AUTH_REQUIRED');
    if (!Number.isFinite(input.amountMxn) || input.amountMxn < 1) throw new Error('INVALID_OFFER_AMOUNT');
    const offerId = localId('offer');
    const at = nowIso();
    const offer: Offer = {
      id: offerId,
      listing_id: input.listingId,
      chat_id: input.chatId,
      buyer_id: buyerId,
      seller_id: input.sellerId,
      amount_mxn: Math.round(input.amountMxn * 100) / 100,
      status: 'pending',
      parent_offer_id: input.parentOfferId,
      expires_at: input.expiresAt,
      created_at: at,
      updated_at: at,
    };
    const { id: _id, ...data } = offer;
    await client.setDocument(`offers/${offerId}`, data, { exists: false });
    return offer;
  }

  async updateOffer(offerId: string, status: Extract<OfferStatus, 'accepted' | 'rejected' | 'countered' | 'withdrawn'>, counterOfferId?: string) {
    this.requireV2();
    const client = this.getClient();
    if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
    await client.setDocument(`offers/${offerId}`, {
      status,
      ...(counterOfferId ? { counter_offer_id: counterOfferId } : {}),
      updated_at: nowIso(),
    }, { merge: true });
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
