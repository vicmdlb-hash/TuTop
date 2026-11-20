import type { Product } from '../types';

// The canonical V2 adapter supplies a lifecycle status. A missing status in
// a stale or malformed cached record must fail closed, not imply public access.
// Legacy V1 compatibility is handled only by the explicit !v2Enabled path.
export function isPublicDiscoveryProduct(product: Product, v2Enabled: boolean): boolean {
  return !v2Enabled || (product.moderation_status === 'approved'
    && product.estado === 'Activo');
}

export function canViewerOpenListing(product: Product, viewerUid: string, v2Enabled: boolean): boolean {
  return !v2Enabled || (product.estado === 'Activo' && isPublicDiscoveryProduct(product, true))
    || Boolean(viewerUid && product.vendedor_id === viewerUid);
}
