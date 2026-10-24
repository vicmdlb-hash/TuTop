import type { Product } from '../types';

// Buyer-facing discovery must fail closed for V2. Seller-owned pending listings
// remain accessible through explicit seller contexts, never a public Feed.
export function isPublicDiscoveryProduct(product: Product, v2Enabled: boolean): boolean {
  return !v2Enabled || product.moderation_status === 'approved';
}
