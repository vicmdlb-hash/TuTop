import { useEffect } from 'react';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';

const FOREGROUND_REFRESH_COOLDOWN_MS = 60_000;

export default function V2ListingsHydrator() {
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    if (!nationalSchemaEnabled() || !user.id) return;
    let active = true;
    let inFlight = false;
    let lastSuccessfulSync = 0;

    const sync = async (force = false) => {
      if (inFlight || !navigator.onLine) return;
      if (!force && Date.now() - lastSuccessfulSync < FOREGROUND_REFRESH_COOLDOWN_MS) return;
      inFlight = true;
      try {
        const products = await canonicalListingsBackend.loadMarketplaceProducts({
          campusId: user.campus_id || user.university?.campus_id,
          institutionId: user.institution_id || user.university?.institution_id,
          cityId: user.university?.city_id,
          limitPerScope: 30,
        });
        if (active) {
          lastSuccessfulSync = Date.now();
          useAppStore.setState({ products });
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
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user.id, user.campus_id, user.institution_id, user.university?.campus_id, user.university?.institution_id, user.university?.city_id]);

  return null;
}
