import type { Chat, Review } from '../types';

export type SellerReputationEvidence = {
  reviewCount: number;
  positiveReviews: number;
  positiveRate: number | null;
  completedSales: number;
  hasEvidence: boolean;
  label: string;
  detail: string;
};

export function sellerReputationEvidence(
  sellerId: string,
  reviews: Pick<Review, 'evaluado_id' | 'calificacion'>[],
  chats: Pick<Chat, 'vendedor_id' | 'entrega_confirmada'>[],
): SellerReputationEvidence {
  const sellerReviews = reviews.filter((review) => review.evaluado_id === sellerId);
  const positiveReviews = sellerReviews.filter((review) => review.calificacion === 'positive').length;
  const positiveRate = sellerReviews.length ? Math.round((positiveReviews / sellerReviews.length) * 100) : null;
  const completedSales = chats.filter((chat) => chat.vendedor_id === sellerId && chat.entrega_confirmada).length;
  const hasEvidence = sellerReviews.length > 0 || completedSales > 0;

  if (sellerReviews.length) {
    const label = `${positiveRate}% en evidencia visible · ${sellerReviews.length} ${sellerReviews.length === 1 ? 'reseña' : 'reseñas'}`;
    return {
      reviewCount: sellerReviews.length,
      positiveReviews,
      positiveRate,
      completedSales,
      hasEvidence,
      label,
      detail: `${positiveReviews} de ${sellerReviews.length} reseñas visibles para esta sesión son positivas. Esto no representa necesariamente la reputación pública completa.`,
    };
  }

  if (completedSales) {
    const label = `${completedSales} ${completedSales === 1 ? 'entrega visible' : 'entregas visibles'}`;
    return {
      reviewCount: 0,
      positiveReviews: 0,
      positiveRate: null,
      completedSales,
      hasEvidence,
      label,
      detail: 'Evidencia visible en tus conversaciones actuales; no se presenta como reputación pública completa.',
    };
  }

  return {
    reviewCount: 0,
    positiveReviews: 0,
    positiveRate: null,
    completedSales: 0,
    hasEvidence: false,
    label: 'Sin evidencia visible',
    detail: 'No hay evidencia visible suficiente en esta sesión para calcular una reputación. TuTop no inventa puntuaciones.',
  };
}
