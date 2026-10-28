import type { Product } from '../types';

// Public discovery requires BOTH moderation approval and active lifecycle.
// A cached approved item can later become paused, sold or archived.
export function isPublicDiscoveryProduct(product: Product, v2Enabled: boolean): boolean {
  return !v2Enabled || (product.moderation_status === 'approved' && product.estado === 'Activo');
}

// Seller-owned listings remain accessible within their own account context.
export function canViewerOpenListing(product: Product, viewerUid: string, v2Enabled: boolean): boolean {
  return !v2Enabled || isPublicDiscoveryProduct(product, true)
    || Boolean(viewerUid && product.vendedor_id === viewerUid);
}
