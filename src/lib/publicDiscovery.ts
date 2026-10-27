import type { Product } from '../types';

// Buyer-facing discovery must fail closed for V2. Seller-owned pending listings
// remain accessible through explicit seller contexts, never a public Feed.
export function isPublicDiscoveryProduct(product: Product, v2Enabled: boolean): boolean {
  return !v2Enabled || product.moderation_status === 'approved';
}

// A seller may inspect an unpublished listing only within their own account;
// buyers and anonymous users must not open V2 listings without approval.
export function canViewerOpenListing(product: Product, viewerUid: string, v2Enabled: boolean): boolean {
  return !v2Enabled || isPublicDiscoveryProduct(product, true)
    || Boolean(viewerUid && product.vendedor_id === viewerUid);
}
