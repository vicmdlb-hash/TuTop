import { useEffect } from 'react';
import { reviewStrikeCountBackend } from '../services/reviewStrikeCountBackend';
import { useAppStore } from '../store/useAppStore';

export default function V2ReviewStrikeHydrator() {
  const userId = useAppStore((state) => state.user.id);
  const reviewCount = useAppStore((state) => state.reviews.length);

  useEffect(() => {
    // Migration guard: while the legacy snapshot still contains review docs,
    // those docs remain the source of truth for strikes and this component adds
    // zero duplicate aggregation reads. Once V2 snapshot reviews become empty,
    // exact 30-day strikes hydrate through COUNT instead.
    if (!userId || reviewCount > 0) return;
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
  }, [userId, reviewCount]);

  return null;
}
