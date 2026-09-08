import { useEffect } from 'react';
import { reviewStrikeCountBackend } from '../services/reviewStrikeCountBackend';
import { reviewsLazyCutoverEnabled } from '../services/v2CostCutoverFlags';
import { useAppStore } from '../store/useAppStore';

export default function V2ReviewStrikeHydrator() {
  const userId = useAppStore((state) => state.user.id);
  const cutoverEnabled = reviewsLazyCutoverEnabled();

  useEffect(() => {
    // Exact migration guard: legacy snapshot mode already computes strikes from
    // its review documents, so this hydrator stays fully dormant until the
    // explicit staging-only reviews cutover is enabled. Once enabled, point
    // review hydration cannot accidentally disable strike COUNT.
    if (!userId || !cutoverEnabled) return;
    let active = true;
    void reviewStrikeCountBackend.load()
      .then((strikes) => {
        if (!active) return;
        useAppStore.setState((state) => ({
          user: state.user.id === userId ? { ...state.user, strikes } : state.user,
        }));
      })
      .catch((error) => {
        console.warn('[TuTop V2 review strike hydration]', error);
      });
    return () => { active = false; };
  }, [userId, cutoverEnabled]);

  return null;
}
