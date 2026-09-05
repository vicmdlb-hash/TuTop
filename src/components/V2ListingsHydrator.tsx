import { useEffect } from 'react';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';

export default function V2ListingsHydrator() {
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    if (!nationalSchemaEnabled() || !user.id) return;
    let active = true;
    let inFlight = false;

    const sync = async () => {
      if (inFlight || !navigator.onLine) return;
      inFlight = true;
      try {
        const products = await canonicalListingsBackend.loadMarketplaceProducts({
          campusId: user.campus_id || user.university?.campus_id,
          institutionId: user.institution_id || user.university?.institution_id,
          cityId: user.university?.city_id,
          limitPerScope: 30,
        });
        if (active) useAppStore.setState({ products });
      } catch (error) {
        console.warn('[TuTop V2 listings sync]', error);
      } finally {
        inFlight = false;
      }
    };

    void sync();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 30_000);
    const online = () => void sync();
    const visible = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user.id, user.campus_id, user.institution_id, user.university?.campus_id, user.university?.institution_id, user.university?.city_id]);

  return null;
}
