import type { ListingVisibilityScope, Product } from '../types/index.ts';
import { canonicalListingStatusFromLegacy, type CanonicalListingStatus } from './marketplaceGovernance.ts';

export type ListingDeliveryMethod = 'campus_meetup' | 'pickup' | 'local_delivery' | 'shipping';

export type CanonicalListingV2 = {
  schema_version: 2;
  seller_id: string;
  institution_id: string;
  campus_id: string;
  city_id?: string;
  faculty_id?: string;
  career_id?: string;
  community_id?: string;
  category_id: string;
  subcategory_id?: string;
  title: string;
  description: string;
  attributes: Record<string, string | number | boolean | string[]>;
  price_mxn: number;
  negotiable: boolean;
  quantity: number;
  condition?: string;
  delivery_methods: ListingDeliveryMethod[];
  meeting_point_ids: string[];
  shipping_available: boolean;
  photo_urls: string[];
  status: CanonicalListingStatus;
  moderation_status: 'pending' | 'approved' | 'rejected' | 'flagged';
  visibility_scope: ListingVisibilityScope;
  published_at?: string;
  created_at: string;
  updated_at: string;
};

export type ListingMigrationResult = {
  listing: CanonicalListingV2 | null;
  blockers: string[];
  warnings: string[];
};

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanAttributes(value: Product['attributes']) {
  const output: CanonicalListingV2['attributes'] = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (!/^[a-zA-Z0-9_]{1,60}$/.test(key)) continue;
    if (typeof item === 'string') output[key] = item.slice(0, 300);
    else if (typeof item === 'number' && Number.isFinite(item)) output[key] = item;
    else if (typeof item === 'boolean') output[key] = item;
    else if (Array.isArray(item)) output[key] = item.map(String).slice(0, 20).map((entry) => entry.slice(0, 120));
  }
  return output;
}

export function legacyProductToListingV2(product: Product, now = new Date().toISOString()): ListingMigrationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const institution_id = product.institution_id?.trim() || '';
  const campus_id = product.campus_id?.trim() || '';
  if (!institution_id) blockers.push('missing_institution_id');
  if (!campus_id) blockers.push('missing_campus_id');
  if (!product.vendedor_id) blockers.push('missing_seller_id');
  if (!product.titulo?.trim()) blockers.push('missing_title');
  if (!Number.isFinite(product.precio_mxn) || product.precio_mxn < 0) blockers.push('invalid_price');

  const photos = (product.imagenes_url?.length ? product.imagenes_url : [product.imagen_url]).filter(Boolean).slice(0, 4);
  if (!photos.length) blockers.push('missing_photo');
  if (!product.faculty_id && product.facultad) warnings.push('legacy_faculty_name_without_faculty_id');
  if (product.estado === 'Reservado') warnings.push('legacy_reserved_mapped_to_active_listing_transaction_owns_reservation');

  if (blockers.length) return { listing: null, blockers, warnings };

  const shipping = Boolean(product.shipping_available);
  const delivery_methods: ListingDeliveryMethod[] = ['campus_meetup'];
  if (shipping) delivery_methods.push('shipping');

  return {
    listing: {
      schema_version: 2,
      seller_id: product.vendedor_id,
      institution_id,
      campus_id,
      city_id: product.city_id,
      faculty_id: product.faculty_id,
      career_id: product.career_id,
      category_id: slug(product.categoria),
      subcategory_id: product.subcategoria ? slug(product.subcategoria) : undefined,
      title: product.titulo.trim().slice(0, 120),
      description: (product.descripcion || '').trim().slice(0, 3000),
      attributes: cleanAttributes(product.attributes),
      price_mxn: Math.max(0, product.precio_mxn),
      negotiable: true,
      quantity: Math.max(1, Math.min(99, product.stock || 1)),
      condition: typeof product.attributes?.condition === 'string' ? product.attributes.condition.slice(0, 80) : undefined,
      delivery_methods,
      meeting_point_ids: product.meeting_point_id ? [product.meeting_point_id] : [],
      shipping_available: shipping,
      photo_urls: photos,
      status: canonicalListingStatusFromLegacy(product.estado),
      moderation_status: product.moderation_status || 'approved',
      visibility_scope: product.visibility_scope || 'institution',
      published_at: product.estado === 'Activo' ? product.fecha_creacion : undefined,
      created_at: product.fecha_creacion || now,
      updated_at: now,
    },
    blockers,
    warnings,
  };
}

export function listingV2HasNoLegacyDescriptionPacking(listing: CanonicalListingV2) {
  return Boolean(
    listing.institution_id
    && listing.campus_id
    && listing.category_id
    && listing.delivery_methods.length
    && typeof listing.attributes === 'object'
    && !('facultad' in listing)
    && !('punto_encuentro' in listing)
  );
}
