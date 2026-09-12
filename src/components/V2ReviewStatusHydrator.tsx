import { useEffect } from 'react';
import { reviewStatusBackend } from '../services/reviewStatusBackend';
import { reviewsLazyCutoverEnabled } from '../services/v2CostCutoverFlags';
import { useAppStore } from '../store/useAppStore';

export default function V2ReviewStatusHydrator() {
  const activeChatId = useAppStore((state) => state.activeChatId);
  const userId = useAppStore((state) => state.user.id);
  const cutoverEnabled = reviewsLazyCutoverEnabled();

  useEffect(() => {
    // Legacy snapshot mode already carries authored reviews. The point lookup is
    // enabled only after the explicit staging-only cutover removes those lists,
    // so disabled flags add zero Firestore reads.
    if (!cutoverEnabled || !activeChatId || !userId) return;
    let active = true;
    void reviewStatusBackend.load(activeChatId)
      .then((review) => {
        if (!active || !review) return;
        useAppStore.setState((state) => ({
          reviews: [review, ...state.reviews.filter((item) => item.id !== review.id)],
        }));
      })
      .catch((error) => console.warn('[TuTop V2 review status]', error));
    return () => { active = false; };
  }, [activeChatId, userId, cutoverEnabled]);

  return null;
}
