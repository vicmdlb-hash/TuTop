import { useEffect } from 'react';
import { reviewStatusBackend } from '../services/reviewStatusBackend';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';

export default function V2ReviewStatusHydrator() {
  const activeChatId = useAppStore((state) => state.activeChatId);
  const userId = useAppStore((state) => state.user.id);

  useEffect(() => {
    if (!nationalSchemaEnabled() || !activeChatId || !userId) return;
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
  }, [activeChatId, userId]);

  return null;
}
