import { useEffect } from 'react';
import { getCachedApproxLocation, nearbyGeoCells, NEARBY_LOCATION_EVENT, type ApproxLocation, type ScopedApproxLocationEvent } from '../lib/nearbyMarketplace';
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
    // Comparing only the UID misses a fast A -> B -> A session change.
    // Invalidate every pending Nearby request as soon as the live owner changes.
    let currentOwnerUid = useAppStore.getState().user.id;
    // Track only records introduced by Nearby. Base records remain authoritative.
    let baseProductIds = new Set(useAppStore.getState().products.map((product) => product.id));
    let nearbyInjectedIds = new Set<string>();
    const unsubscribeOwner = useAppStore.subscribe((state) => {
      if (state.user.id === currentOwnerUid) return;
      currentOwnerUid = state.user.id;
      baseProductIds.clear();
      nearbyInjectedIds.clear();
      requestSerial += 1;
    });

    const hydrate = async (location: ApproxLocation, force = false) => {
      const serial = ++requestSerial;
      const requestUid = useAppStore.getState().user.id;
      if (!requestUid) return;
      const cells = nearbyGeoCells(location);
      if (!cells.length) return;
      try {
        const nearby = await canonicalListingsBackend.loadNearbyProducts({ geoCells: cells, limitPerCell: 10, force });
        if (!active || serial !== requestSerial || useAppStore.getState().user.id !== requestUid) return;
        const current = useAppStore.getState().products;
        const currentNearbyIds = new Set(nearby.map((product) => product.id));
        // A refreshed approved-only query may omit a newly moderated/deleted item.
        // Evict previous Nearby-only IDs without erasing authoritative base products.
        const retained = current.filter((product) =>
          !nearbyInjectedIds.has(product.id) || currentNearbyIds.has(product.id) || baseProductIds.has(product.id)
        );
        nearbyInjectedIds = new Set([...currentNearbyIds].filter((id) => !baseProductIds.has(id)));
        useAppStore.setState({ products: mergeProducts(retained, nearby) });
      } catch {
        // Nearby is additive. Existing campus/city/national snapshot remains usable.
      }
    };

    const hydrateCached = (force = false) => {
      const uid = useAppStore.getState().user.id;
      const cached = uid ? getCachedApproxLocation(uid) : null;
      if (cached) void hydrate(cached, force);
    };
    hydrateCached();

    const onLocation = (event: Event) => {
      const location = (event as CustomEvent<ScopedApproxLocationEvent>).detail;
      if (!location?.owner_uid || location.owner_uid !== useAppStore.getState().user.id) return;
      void hydrate(location);
    };
    window.addEventListener(NEARBY_LOCATION_EVENT, onLocation);
    const onBaseHydrated = () => {
      baseProductIds = new Set(useAppStore.getState().products.map((product) => product.id));
      nearbyInjectedIds.clear();
      hydrateCached(true);
    };
    window.addEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT, onBaseHydrated);
    return () => {
      active = false;
      requestSerial += 1;
      unsubscribeOwner();
      window.removeEventListener(NEARBY_LOCATION_EVENT, onLocation);
      window.removeEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT, onBaseHydrated);
    };
  }, []);

  return null;
}
