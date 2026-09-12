import type { Review } from '../types';
import { useAppStore } from '../store/useAppStore';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { reviewStatusBackend } from './reviewStatusBackend';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAlreadyExists(error: unknown) {
  return /ALREADY_EXISTS|already exists|409/i.test(messageOf(error));
}

if (nationalSchemaEnabled()) {
  useAppStore.setState({
    submitReview: (chatId: string, calificacion: Review['calificacion'], comentario?: string) => {
      const state = useAppStore.getState();
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat || !chat.entrega_confirmada) return false;
      if (state.reviews.some((review) => review.chat_id === chatId && review.evaluador_id === state.user.id)) return false;

      const evaluadoId = chat.comprador_id === state.user.id ? chat.vendedor_id : chat.comprador_id;
      const review: Review = {
        id: `${chatId}_${state.user.id}`,
        chat_id: chatId,
        evaluador_id: state.user.id,
        evaluado_id: evaluadoId,
        calificacion,
        comentario: comentario?.trim().slice(0, 500),
        fecha: new Date().toISOString(),
      };

      useAppStore.setState((current) => ({
        reviews: [review, ...current.reviews.filter((item) => item.id !== review.id)],
        syncError: null,
      }));

      void onlineBackend.submitReview(chat, calificacion, comentario)
        .then(() => reviewStatusBackend.remember(review))
        .catch(async (error) => {
          if (isAlreadyExists(error)) {
            const stored = await reviewStatusBackend.load(chatId, true).catch(() => null);
            if (stored) {
              useAppStore.setState((current) => ({
                reviews: [stored, ...current.reviews.filter((item) => item.id !== stored.id)],
                syncError: null,
              }));
              return;
            }
          }
          reviewStatusBackend.invalidate(chatId, state.user.id);
          useAppStore.setState((current) => ({
            reviews: current.reviews.filter((item) => item.id !== review.id),
            syncError: messageOf(error),
          }));
          console.error('[TuTop V2 review submit]', error);
        });

      return true;
    },
  });
}
