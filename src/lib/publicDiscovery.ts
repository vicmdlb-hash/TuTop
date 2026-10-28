import type { Product } from '../types';

// The canonical V2 adapter always supplies a lifecycle status. Restrict
// listings that declare one to active only, including cached stale records.
// Unknown lifecycle objects remain a legacy compatibility case; direct-ID
// buyer navigation additionally requires the explicit active status below.
export function isPublicDiscoveryProduct(product: Product, v2Enabled: boolean): boolean {
  return !v2Enabled || (product.moderation_status === 'approved'
    && (product.estado === undefined || product.estado === 'Activo'));
}

export function canViewerOpenListing(product: Product, viewerUid: string, v2Enabled: boolean): boolean {
  return !v2Enabled || (product.estado === 'Activo' && isPublicDiscoveryProduct(product, true))
    || Boolean(viewerUid && product.vendedor_id === viewerUid);
}
