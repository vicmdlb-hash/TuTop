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
    const label = `${positiveRate}% cumplió · ${sellerReviews.length} ${sellerReviews.length === 1 ? 'reseña' : 'reseñas'}`;
    return {
      reviewCount: sellerReviews.length,
      positiveReviews,
      positiveRate,
      completedSales,
      hasEvidence,
      label,
      detail: `${positiveReviews} de ${sellerReviews.length} experiencias evaluadas terminaron con valoración positiva.`,
    };
  }

  if (completedSales) {
    const label = `${completedSales} ${completedSales === 1 ? 'entrega confirmada' : 'entregas confirmadas'}`;
    return {
      reviewCount: 0,
      positiveReviews: 0,
      positiveRate: null,
      completedSales,
      hasEvidence,
      label,
      detail: 'Historial basado en entregas confirmadas; todavía no hay reseñas suficientes para mostrar un porcentaje.',
    };
  }

  return {
    reviewCount: 0,
    positiveReviews: 0,
    positiveRate: null,
    completedSales: 0,
    hasEvidence: false,
    label: 'Sin historial todavía',
    detail: 'Este vendedor aún no tiene reseñas ni entregas confirmadas en TuTop.',
  };
}
