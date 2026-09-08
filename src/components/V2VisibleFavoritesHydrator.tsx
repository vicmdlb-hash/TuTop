import { useEffect, useMemo } from 'react';
import { favoritesVisibleCutoverEnabled } from '../services/v2CostCutoverFlags';
import { visibleFavoritesBackend } from '../services/visibleFavoritesBackend';
import { useAppStore } from '../store/useAppStore';

export default function V2VisibleFavoritesHydrator() {
  const userId = useAppStore((state) => state.user.id);
  const products = useAppStore((state) => state.products);
  const productIds = useMemo(() => products.map((product) => product.id).filter(Boolean), [products]);
  const signature = productIds.join('|');

  useEffect(() => {
    if (!favoritesVisibleCutoverEnabled() || !userId || !productIds.length) return;
    let active = true;
    const startVersions = new Map(productIds.map((productId) => [productId, visibleFavoritesBackend.currentVersion(productId)]));
    void visibleFavoritesBackend.load(productIds)
      .then((serverFavorites) => {
        if (!active) return;
        const server = new Set(serverFavorites);
        const visible = new Set(productIds);
        useAppStore.setState((state) => {
          const current = new Set(state.favorites);
          const next = new Set(state.favorites.filter((id) => !visible.has(id)));
          for (const productId of productIds) {
            const changedDuringLoad = visibleFavoritesBackend.currentVersion(productId) !== startVersions.get(productId);
            const shouldKeep = changedDuringLoad ? current.has(productId) : server.has(productId);
            if (shouldKeep) next.add(productId);
          }
          return { favorites: [...next] };
        });
      })
      .catch((error) => console.warn('[TuTop visible favorites hydration]', error));
    return () => { active = false; };
  }, [userId, signature]);

  return null;
}
