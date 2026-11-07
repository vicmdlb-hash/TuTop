import { useEffect } from 'react';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';

const FOREGROUND_REFRESH_COOLDOWN_MS = 60_000;
export const V2_LISTINGS_BASE_HYDRATED_EVENT = 'tutop:v2-listings-base-hydrated';

export default function V2ListingsHydrator() {
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    if (!nationalSchemaEnabled() || !user.id) return;
    let active = true;
    let inFlight = false;
    let lastSuccessfulSync = 0;
    // An in-flight response must never hydrate the next account. An epoch
    // prevents A → B → A from making an obsolete A response look current.
    let currentOwnerUid = user.id;
    let ownerEpoch = 0;
    const unsubscribeOwner = useAppStore.subscribe((state) => {
      if (state.user.id === currentOwnerUid) return;
      currentOwnerUid = state.user.id;
      ownerEpoch += 1;
    });

    const sync = async (force = false) => {
      if (inFlight || !navigator.onLine) return;
      if (!force && Date.now() - lastSuccessfulSync < FOREGROUND_REFRESH_COOLDOWN_MS) return;
      inFlight = true;
      const expectedUid = user.id;
      const expectedEpoch = ownerEpoch;
      try {
        const products = await canonicalListingsBackend.loadMarketplaceProducts({
          campusId: user.campus_id || user.university?.campus_id,
          institutionId: user.institution_id || user.university?.institution_id,
          cityId: user.university?.city_id,
          limitPerScope: 30,
        });
        if (active && ownerEpoch === expectedEpoch && useAppStore.getState().user.id === expectedUid) {
          lastSuccessfulSync = Date.now();
          useAppStore.setState({ products });
          window.dispatchEvent(new Event(V2_LISTINGS_BASE_HYDRATED_EVENT));
        }
      } catch (error) {
        console.warn('[TuTop V2 listings sync]', error);
      } finally {
        inFlight = false;
      }
    };

    // One initial read is enough while the user remains on the same foreground
    // session. Mutations that need immediate freshness already refresh explicitly.
    void sync(true);
    const online = () => void sync(true);
    const visible = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      unsubscribeOwner();
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user.id, user.campus_id, user.institution_id, user.university?.campus_id, user.university?.institution_id, user.university?.city_id]);

  return null;
}
