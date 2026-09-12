import type { Product } from '../types';

export type BundleStatus = 'draft' | 'offered' | 'accepted' | 'rejected' | 'expired' | 'completed';

export type BundleDraft = {
  seller_id: string;
  buyer_id: string;
  listing_ids: string[];
  normal_total_mxn: number;
  offer_total_mxn: number;
  status: BundleStatus;
};

export function buildBundleDraft(input: { products: Product[]; buyer_id: string; offer_total_mxn?: number }): BundleDraft {
  if (input.products.length < 2) throw new Error('A bundle requires at least two listings.');
  const sellerIds = new Set(input.products.map((product) => product.vendedor_id));
  if (sellerIds.size !== 1) throw new Error('All bundle listings must belong to the same seller.');
  const seller_id = input.products[0].vendedor_id;
  if (seller_id === input.buyer_id) throw new Error('Buyer cannot bundle their own listings.');
  if (input.products.some((product) => product.estado !== 'Activo')) throw new Error('Only active listings can enter a new bundle.');
  const normal_total_mxn = input.products.reduce((sum, product) => sum + product.precio_mxn, 0);
  const offer_total_mxn = input.offer_total_mxn ?? normal_total_mxn;
  if (!Number.isFinite(offer_total_mxn) || offer_total_mxn <= 0 || offer_total_mxn > normal_total_mxn) {
    throw new Error('Bundle offer must be positive and cannot exceed normal total.');
  }
  return {
    seller_id,
    buyer_id: input.buyer_id,
    listing_ids: [...new Set(input.products.map((product) => product.id))],
    normal_total_mxn,
    offer_total_mxn,
    status: 'draft',
  };
}

export function bundleDiscountPercent(bundle: Pick<BundleDraft, 'normal_total_mxn' | 'offer_total_mxn'>) {
  if (bundle.normal_total_mxn <= 0) return 0;
  return Math.max(0, Math.round((1 - bundle.offer_total_mxn / bundle.normal_total_mxn) * 100));
}
