import { categorySafetyRequirements, classifyMarketplaceItem } from '../lib/marketplaceGovernance.ts';
import { listingV2HasNoLegacyDescriptionPacking, validCanonicalVideoUri, type CanonicalListingV2, type ListingDeliveryMethod } from '../lib/listingSchemaV2.ts';
import { CAMPUSES, FACULTIES, INSTITUTIONS } from '../lib/universityNetwork.ts';
import { MARKETPLACE_CATEGORIES, normalizeCategory } from '../lib/productAssistant.ts';
import type { DeliveryMethod, MeetingPoint, Product, ProductCategory, ProductStatus } from '../types/index.ts';
import { FirebaseRestClient, type FirestoreDocument, type QueryFilter } from './firebaseRest.ts';
import { nationalSchemaEnabled } from './nationalBackend.ts';
import { commitWithRateLimit } from './rateLimit.ts';
import { getFirebaseConfig } from './runtimeConfig.ts';

const SELLER_NAME_CACHE_TTL_MS = 10 * 60_000;
const NEARBY_CACHE_TTL_MS = 60_000;
const sellerNameCache = new Map<string, { name: string; expiresAt: number }>();
const sellerNameInflight = new Map<string, Promise<string>>();
const nearbyCache = new Map<string, { products: Product[]; expiresAt: number }>();

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

function canonicalStatus(status: ProductStatus): CanonicalListingV2['status'] {
  if (status === 'Pausado') return 'paused';
  if (status === 'Vendido' || status === 'Agotado') return 'sold_out';
  if (status === 'Archivado') return 'archived';
  return 'active';
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

async function sellerNameFor(client: FirebaseRestClient, uid: string) {
  const cached = sellerNameCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  const inflight = sellerNameInflight.get(uid);
  if (inflight) return inflight;

  const request = client.getDocument<{ nombre?: string }>(`users/${uid}`)
    .then((profile) => String(profile?.data?.nombre || 'Estudiante'))
    .catch(() => 'Estudiante')
    .then((name) => {
      sellerNameCache.set(uid, { name, expiresAt: Date.now() + SELLER_NAME_CACHE_TTL_MS });
      return name;
    })
    .finally(() => sellerNameInflight.delete(uid));
  sellerNameInflight.set(uid, request);
  return request;
}

export function canonicalListingToProduct(doc: FirestoreDocument<CanonicalListingV2>, sellerName = 'Estudiante'): Product {
  const data = doc.data;
  const photos = Array.isArray(data.photo_urls) ? data.photo_urls.filter(Boolean).slice(0, 4) : [];
  const videos = Array.isArray(data.video_urls) ? data.video_urls.filter(validCanonicalVideoUri).slice(0, 1) : [];
  const product: Product & { video_urls?: string[] } = {
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
    ...(videos.length ? { video_urls: videos } : {}),
    estado: legacyStatus(data.status),
    es_top: false,
    jerarquia_top: 0,
    puja_ucoins: 0,
    likes: 0,
    fecha_creacion: data.published_at || data.created_at,
    updated_at: data.updated_at,
  };
  return product;
}

export function validateCanonicalListingPolicy(listing: CanonicalListingV2, category: ProductCategory) {
  if (!listingV2HasNoLegacyDescriptionPacking(listing)) throw new Error('LISTING_V2_SCHEMA_INCOMPLETE');
  if (!Number.isFinite(listing.price_mxn) || listing.price_mxn <= 0 || listing.price_mxn > 1_000_000) throw new Error('LISTING_PRICE_INVALID');
  if (!Number.isInteger(listing.quantity) || listing.quantity < 1 || listing.quantity > 99) throw new Error('LISTING_QUANTITY_INVALID');
  if (listing.video_urls && (listing.video_urls.length > 1 || !listing.video_urls.every(validCanonicalVideoUri))) {
    throw new Error('LISTING_VIDEO_REFERENCE_INVALID');
  }
  const policy = classifyMarketplaceItem({ category, title: listing.title, description: listing.description });
  if (policy.classification === 'prohibited') throw new Error(`PROHIBITED_LISTING:${policy.reasons.join(',')}`);
  const requirements = categorySafetyRequirements(category);
  const missing = requirements.required.filter((key) => !hasValue(listing.attributes[key]));
  if (missing.length) throw new Error(`RESTRICTED_FLOW_MISSING:${missing.join(',')}`);
  const exposed = requirements.forbiddenPublic.filter((key) => hasValue(listing.attributes[key]));
  if (exposed.length) throw new Error(`PRIVATE_FIELD_EXPOSED:${exposed.join(',')}`);
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

async function productsForDocuments(client: FirebaseRestClient, docs: FirestoreDocument<CanonicalListingV2>[]) {
  const sellerIds = [...new Set(docs.map((doc) => doc.data.seller_id).filter(Boolean))];
  const names = new Map<string, string>();
  await Promise.all(sellerIds.map(async (uid) => names.set(uid, await sellerNameFor(client, uid))));
  return docs
    .map((doc) => canonicalListingToProduct(doc, names.get(doc.data.seller_id) || 'Estudiante'))
    .sort((a, b) => Date.parse(b.updated_at || b.fecha_creacion) - Date.parse(a.updated_at || a.fecha_creacion));
}

export const canonicalListingsBackend = {
  async create(listing: CanonicalListingV2, category: ProductCategory) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    if (listing.seller_id !== uid) throw new Error('SELLER_MISMATCH');
    validateCanonicalListingPolicy(listing, category);
    const id = localId();
    const {
      created_at: _clientCreatedAt,
      updated_at: _clientUpdatedAt,
      published_at: _clientPublishedAt,
      ...serverTimedListing
    } = listing;
    const payload = {
      ...serverTimedListing,
      moderation_status: 'pending' as const,
    };
    const updateTransforms = [
      { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' as const },
      { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' as const },
      ...(listing.published_at ? [{ fieldPath: 'published_at', setToServerValue: 'REQUEST_TIME' as const }] : []),
    ];
    await commitWithRateLimit(client, 'listing_create', [
      {
        update: client.encodeDocumentForWrite(`listings_v2/${id}`, payload),
        updateTransforms,
        currentDocument: { exists: false },
      },
    ]);
    nearbyCache.clear();
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
    return productsForDocuments(client, [...byId.values()]);
  },

  async loadNearbyProducts(input: { geoCells: string[]; limitPerCell?: number }) {
    const cells = [...new Set(input.geoCells.filter((cell) => /^g1:\d+:\d+$/.test(cell)))].slice(0, 9).sort();
    if (!cells.length) return [] as Product[];
    const limit = Math.max(4, Math.min(15, input.limitPerCell || 10));
    const client = getClient();
    const uid = client.currentSession!.uid;
    const cacheKey = `${uid}#${cells.join('|')}#${limit}`;
    const cached = nearbyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.products;

    const approvedPromise = Promise.all(cells.map((cell) => queryApproved(client, 'attributes.geo_cell', cell, limit)));
    const minePromise = this.loadMine(Math.min(50, Math.max(limit * 3, 20)));
    const [sets, mine] = await Promise.all([approvedPromise, minePromise]);
    const ownNearby = mine.filter((doc) => {
      const cell = String(doc.data.attributes?.geo_cell || '');
      return doc.data.seller_id === uid && doc.data.status === 'active' && cells.includes(cell);
    });

    const byId = new Map<string, FirestoreDocument<CanonicalListingV2>>();
    for (const doc of [...sets.flat(), ...ownNearby]) byId.set(doc.id, doc);
    const products = await productsForDocuments(client, [...byId.values()]);
    nearbyCache.set(cacheKey, { products, expiresAt: Date.now() + NEARBY_CACHE_TTL_MS });
    return products;
  },

  async updateProduct(listingId: string, updates: Partial<Product>) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const current = await client.getDocument<CanonicalListingV2>(`listings_v2/${listingId}`);
    if (!current) throw new Error('LISTING_NOT_FOUND');
    if (current.data.seller_id !== uid) throw new Error('SELLER_REQUIRED');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    let contentChanged = false;
    if (updates.titulo !== undefined) { patch.title = updates.titulo.trim().slice(0, 120); contentChanged = true; }
    if (updates.descripcion !== undefined) { patch.description = updates.descripcion.trim().slice(0, 3000); contentChanged = true; }
    if (updates.precio_mxn !== undefined) patch.price_mxn = Math.max(0, Math.min(1_000_000, Number(updates.precio_mxn)));
    if (updates.stock !== undefined) patch.quantity = Math.max(1, Math.min(99, Math.round(Number(updates.stock))));
    if (updates.categoria !== undefined) { patch.category_id = slug(updates.categoria); contentChanged = true; }
    if (updates.condicion !== undefined) { patch.condition = updates.condicion; contentChanged = true; }
    if (updates.attributes !== undefined) { patch.attributes = updates.attributes; contentChanged = true; }
    if (updates.precio_negociable !== undefined) patch.negotiable = Boolean(updates.precio_negociable);
    if (updates.estado !== undefined) patch.status = canonicalStatus(updates.estado);
    if (contentChanged && current.data.moderation_status !== 'pending') patch.moderation_status = 'pending';

    const next = { ...current.data, ...patch, updated_at: new Date().toISOString() } as CanonicalListingV2;
    validateCanonicalListingPolicy(next, updates.categoria || categoryLabel(current.data.category_id));
    await client.setDocument(`listings_v2/${listingId}`, patch, { merge: true });
    nearbyCache.clear();
  },

  async setStatus(listingId: string, status: CanonicalListingV2['status']) {
    const client = getClient();
    await client.setDocument(`listings_v2/${listingId}`, { status, updated_at: new Date() }, { merge: true });
    nearbyCache.clear();
  },
};