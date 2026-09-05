export type SellerCrmSnapshot = {
  active_listings: number;
  views: number;
  saves: number;
  chats: number;
  offers: number;
  completed_deliveries: number;
  median_response_minutes: number | null;
  stale_listing_count: number;
  saved_this_week: number;
};

export type SellerCrmMetrics = SellerCrmSnapshot & {
  conversion_chat_to_delivery: number | null;
  save_to_chat_rate: number | null;
  offer_to_delivery_rate: number | null;
};

function rate(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : null;
}

export function sellerCrmMetrics(snapshot: SellerCrmSnapshot): SellerCrmMetrics {
  return {
    ...snapshot,
    conversion_chat_to_delivery: rate(snapshot.completed_deliveries, snapshot.chats),
    save_to_chat_rate: rate(snapshot.chats, snapshot.saves),
    offer_to_delivery_rate: rate(snapshot.completed_deliveries, snapshot.offers),
  };
}

export type SellerRecommendation = {
  code: string;
  priority: 'low' | 'medium' | 'high';
  message: string;
};

export function sellerRecommendations(snapshot: SellerCrmSnapshot): SellerRecommendation[] {
  const recommendations: SellerRecommendation[] = [];
  if (snapshot.stale_listing_count > 0) {
    recommendations.push({ code: 'stale_listing', priority: 'medium', message: `${snapshot.stale_listing_count} publicación(es) llevan demasiado tiempo activas. Revisa precio, portada o disponibilidad.` });
  }
  if (snapshot.saved_this_week >= 5 && snapshot.offers === 0) {
    recommendations.push({ code: 'saved_no_offer', priority: 'medium', message: `${snapshot.saved_this_week} personas guardaron tus productos esta semana. Considera una oferta manual sin spam.` });
  }
  if (snapshot.median_response_minutes !== null && snapshot.median_response_minutes > 60) {
    recommendations.push({ code: 'slow_response', priority: 'high', message: 'Tu respuesta mediana supera 60 minutos. Responder antes puede mejorar la conversión.' });
  }
  if (snapshot.views >= 100 && snapshot.chats === 0) {
    recommendations.push({ code: 'views_no_chat', priority: 'high', message: 'Tienes muchas vistas pero ningún chat. Revisa foto principal, título, precio y claridad de entrega.' });
  }
  if (!recommendations.length) {
    recommendations.push({ code: 'healthy', priority: 'low', message: 'Tu embudo no muestra un bloqueo evidente en este momento.' });
  }
  return recommendations;
}
