import { categorySafetyRequirements, classifyMarketplaceItem } from '../lib/marketplaceGovernance.ts';
import { listingV2HasNoLegacyDescriptionPacking, type CanonicalListingV2, type ListingDeliveryMethod } from '../lib/listingSchemaV2.ts';
import { CAMPUSES, FACULTIES, INSTITUTIONS } from '../lib/universityNetwork.ts';
import { MARKETPLACE_CATEGORIES, normalizeCategory } from '../lib/productAssistant.ts';
import type { DeliveryMethod, MeetingPoint, Product, ProductCategory, ProductStatus } from '../types/index.ts';
import { FirebaseRestClient, type FirestoreDocument, type QueryFilter } from './firebaseRest.ts';
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

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function categoryLabel(categoryId: string): ProductCategory {
  return MARKETPLACE_CATEGORIES.find((category) => slug(category) === categoryId) || normalizeCategory(categoryId);
}

function legacyStatus(status: CanonicalListingV2['status']): ProductStatus {
  if (status === 'paused') return 'Pausado';
  if (status === 'sold_out') return 'Vendido';
  if (status === 'archived') return 'Archivado';
  return 'Activo';
}

function legacyDelivery(method: ListingDeliveryMethod): DeliveryMethod {
  if (method === 'pickup') return 'Recoge conmigo';
  if (method === 'local_delivery') return 'Envío local';
  if (method === 'shipping') return 'Acordamos por chat';
  return 'Punto TuTop';
}

function contextLabel(data: CanonicalListingV2) {
  const faculty = FACULTIES.find((item) => item.id === data.faculty_id)?.name;
  if (faculty) return faculty;
  const campus = CAMPUSES.find((item) => item.id === data.campus_id)?.name;
  if (campus) return campus;
  return INSTITUTIONS.find((item) => item.id === data.institution_id)?.short_name || 'Red universitaria';
}

export function canonicalListingToProduct(doc: FirestoreDocument<CanonicalListingV2>, sellerName = 'Estudiante'): Product {
  const data = doc.data;
  const photos = Array.isArray(data.photo_urls) ? data.photo_urls.filter(Boolean).slice(0, 8) : [];
  return {
    id: doc.id,
    vendedor_id: data.seller_id,
    vendedor_nombre: sellerName,
    titulo: data.title,
    descripcion: data.description || undefined,
    precio_mxn: Number(data.price_mxn || 0),
    precio_negociable: data.negotiable,
    stock: Math.max(1, Number(data.quantity || 1)),
    categoria: categoryLabel(data.category_id),
    subcategoria: data.subcategory_id,
    condicion: data.condition as Product['condicion'],
    attributes: data.attributes || {},
    facultad: contextLabel(data),
    country_code: 'MX',
    city_id: data.city_id,
    institution_id: data.institution_id,
    campus_id: data.campus_id,
    faculty_id: data.faculty_id,
    career_id: data.career_id,
    visibility_scope: data.visibility_scope,
    listing_kind: 'offer',
    moderation_status: data.moderation_status === 'flagged' ? 'review' : data.moderation_status === 'approved' ? 'approved' : data.moderation_status === 'rejected' ? 'rejected' : 'pending',
    punto_encuentro: 'Coordinar por Chat' as MeetingPoint,
    metodos_entrega: data.delivery_methods.map(legacyDelivery),
    shipping_available: data.shipping_available,
    imagen_url: photos[0] || '',
    imagenes_url: photos,
    estado: legacyStatus(data.status),
    es_top: false,
    jerarquia_top: 0,
    puja_ucoins: 0,
    likes: 0,
    fecha_creacion: data.published_at || data.created_at,
    updated_at: data.updated_at,
  };
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

async function queryApproved(client: FirebaseRestClient, field: string, value: string, limit: number) {
  const filters: QueryFilter[] = [
    { field: 'status', op: 'EQUAL', value: 'active' },
    { field: 'moderation_status', op: 'EQUAL', value: 'approved' },
    { field, op: 'EQUAL', value },
  ];
  return client.runQuery<CanonicalListingV2>('listings_v2', filters, [{ field: 'updated_at', direction: 'DESCENDING' }], limit);
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

  async loadMarketplaceProducts(input: { campusId?: string; institutionId?: string; cityId?: string; limitPerScope?: number } = {}) {
    const client = getClient();
    const limit = Math.max(5, Math.min(50, input.limitPerScope || 30));
    const queries: Array<Promise<FirestoreDocument<CanonicalListingV2>[]>> = [];
    if (input.campusId) queries.push(queryApproved(client, 'campus_id', input.campusId, limit));
    if (input.institutionId) queries.push(queryApproved(client, 'institution_id', input.institutionId, limit));
    if (input.cityId) queries.push(queryApproved(client, 'city_id', input.cityId, limit));
    queries.push(queryApproved(client, 'visibility_scope', 'national', limit));
    const minePromise = this.loadMine(Math.min(30, limit));
    const [sets, mine] = await Promise.all([Promise.all(queries), minePromise]);
    const byId = new Map<string, FirestoreDocument<CanonicalListingV2>>();
    for (const doc of [...sets.flat(), ...mine]) byId.set(doc.id, doc);
    const docs = [...byId.values()];
    const sellerIds = [...new Set(docs.map((doc) => doc.data.seller_id).filter(Boolean))];
    const names = new Map<string, string>();
    await Promise.all(sellerIds.map(async (uid) => {
      const profile = await client.getDocument<{ nombre?: string }>(`users/${uid}`).catch(() => null);
      names.set(uid, String(profile?.data?.nombre || 'Estudiante'));
    }));
    return docs
      .map((doc) => canonicalListingToProduct(doc, names.get(doc.data.seller_id) || 'Estudiante'))
      .sort((a, b) => Date.parse(b.updated_at || b.fecha_creacion) - Date.parse(a.updated_at || a.fecha_creacion));
  },

  async setStatus(listingId: string, status: CanonicalListingV2['status']) {
    const client = getClient();
    await client.setDocument(`listings_v2/${listingId}`, { status, updated_at: new Date() }, { merge: true });
  },
};
