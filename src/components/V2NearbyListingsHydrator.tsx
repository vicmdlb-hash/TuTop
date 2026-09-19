import { useEffect } from 'react';
import { getCachedApproxLocation, nearbyGeoCells, NEARBY_LOCATION_EVENT, type ApproxLocation } from '../lib/nearbyMarketplace';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { useAppStore } from '../store/useAppStore';
import type { Product } from '../types';
import { V2_LISTINGS_BASE_HYDRATED_EVENT } from './V2ListingsHydrator';

function timestamp(product: Product) {
  const value = Date.parse(product.updated_at || product.fecha_creacion || '');
  return Number.isFinite(value) ? value : 0;
}

function mergeProducts(current: Product[], nearby: Product[]) {
  const byId = new Map<string, Product>();
  for (const product of [...nearby, ...current]) {
    const previous = byId.get(product.id);
    if (!previous || timestamp(product) >= timestamp(previous)) byId.set(product.id, product);
  }
  return [...byId.values()];
}

export default function V2NearbyListingsHydrator() {
  useEffect(() => {
    let active = true;
    let requestSerial = 0;

    const hydrate = async (location: ApproxLocation, force = false) => {
      const serial = ++requestSerial;
      const cells = nearbyGeoCells(location);
      if (!cells.length) return;
      try {
        const nearby = await canonicalListingsBackend.loadNearbyProducts({ geoCells: cells, limitPerCell: 10, force });
        if (!active || serial !== requestSerial) return;
        const current = useAppStore.getState().products;
        useAppStore.setState({ products: mergeProducts(current, nearby) });
      } catch {
        // Nearby is additive. Existing campus/city/national snapshot remains usable.
      }
    };

    const hydrateCached = (force = false) => {
      const cached = getCachedApproxLocation();
      if (cached) void hydrate(cached, force);
    };
    hydrateCached();

    const onLocation = (event: Event) => {
      const location = (event as CustomEvent<ApproxLocation>).detail;
      if (location) void hydrate(location);
    };
    window.addEventListener(NEARBY_LOCATION_EVENT, onLocation);
    const onBaseHydrated = () => hydrateCached(true);
    window.addEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT, onBaseHydrated);
    return () => {
      active = false;
      requestSerial += 1;
      window.removeEventListener(NEARBY_LOCATION_EVENT, onLocation);
      window.removeEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT, onBaseHydrated);
    };
  }, []);

  return null;
}
