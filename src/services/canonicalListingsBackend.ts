import { categorySafetyRequirements, classifyMarketplaceItem } from '../lib/marketplaceGovernance.ts';
import { listingV2HasNoLegacyDescriptionPacking, type CanonicalListingV2 } from '../lib/listingSchemaV2.ts';
import type { ProductCategory } from '../types/index.ts';
import { FirebaseRestClient } from './firebaseRest.ts';
import { nationalSchemaEnabled } from './nationalBackend.ts';
import { getFirebaseConfig } from './runtimeConfig.ts';

function localId() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `listing-${random}`;
}

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

export function validateCanonicalListingPolicy(listing: CanonicalListingV2, category: ProductCategory) {
  if (!listingV2HasNoLegacyDescriptionPacking(listing)) throw new Error('LISTING_V2_SCHEMA_INCOMPLETE');
  const policy = classifyMarketplaceItem({ category, title: listing.title, description: listing.description });
  if (policy.classification === 'prohibited') throw new Error(`PROHIBITED_LISTING:${policy.reasons.join(',')}`);
  const requirements = categorySafetyRequirements(category);
  const missing = requirements.required.filter((key) => !hasValue(listing.attributes[key]));
  if (missing.length) throw new Error(`RESTRICTED_FLOW_MISSING:${missing.join(',')}`);
  const exposed = requirements.forbiddenPublic.filter((key) => hasValue(listing.attributes[key]));
  if (exposed.length) throw new Error(`PRIVATE_FIELD_EXPOSED:${exposed.join(',')}`);
  if (listing.visibility_scope === 'national' && !listing.shipping_available) throw new Error('NATIONAL_SHIPPING_REQUIRED');
  if (listing.status === 'active' && !listing.published_at) throw new Error('PUBLISHED_AT_REQUIRED');
  return policy;
}

export const canonicalListingsBackend = {
  async create(listing: CanonicalListingV2, category: ProductCategory) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    if (listing.seller_id !== uid) throw new Error('SELLER_MISMATCH');
    validateCanonicalListingPolicy(listing, category);
    const id = localId();
    const payload = {
      ...listing,
      moderation_status: 'pending' as const,
      created_at: new Date(listing.created_at),
      updated_at: new Date(listing.updated_at),
      ...(listing.published_at ? { published_at: new Date(listing.published_at) } : {}),
    };
    await client.setDocument(`listings_v2/${id}`, payload, { exists: false });
    return { id, ...listing, moderation_status: 'pending' as const };
  },

  async loadMine(limit = 50) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    return client.runQuery<CanonicalListingV2>('listings_v2', [{ field: 'seller_id', op: 'EQUAL', value: uid }], [{ field: 'updated_at', direction: 'DESCENDING' }], Math.max(1, Math.min(100, limit)));
  },

  async setStatus(listingId: string, status: CanonicalListingV2['status']) {
    const client = getClient();
    if (status === 'reserved') throw new Error('RESERVATION_BELONGS_TO_TRANSACTION');
    await client.setDocument(`listings_v2/${listingId}`, { status, updated_at: new Date() }, { merge: true });
  },
};
