export type CampusLiquiditySnapshot = {
  active_sellers: number;
  active_listings: number;
  useful_interactions_7d: number;
  listings_with_useful_interaction_7d: number;
  searches: number;
  searches_without_result: number;
  chats_started: number;
  offers_created: number;
  agreements: number;
  completed_transactions: number;
  no_shows: number;
  reports: number;
};

export type FunnelMetrics = {
  search_zero_result_rate: number | null;
  view_to_chat_rate?: number | null;
  chat_to_offer_rate: number | null;
  offer_to_agreement_rate: number | null;
  agreement_to_completion_rate: number | null;
  no_show_rate: number | null;
  reports_per_1000_completed: number | null;
  useful_interaction_7d_rate: number | null;
};

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function marketplaceFunnel(snapshot: CampusLiquiditySnapshot): FunnelMetrics {
  return {
    search_zero_result_rate: safeRate(snapshot.searches_without_result, snapshot.searches),
    chat_to_offer_rate: safeRate(snapshot.offers_created, snapshot.chats_started),
    offer_to_agreement_rate: safeRate(snapshot.agreements, snapshot.offers_created),
    agreement_to_completion_rate: safeRate(snapshot.completed_transactions, snapshot.agreements),
    no_show_rate: safeRate(snapshot.no_shows, snapshot.agreements),
    reports_per_1000_completed: snapshot.completed_transactions > 0 ? (snapshot.reports / snapshot.completed_transactions) * 1000 : null,
    useful_interaction_7d_rate: safeRate(snapshot.listings_with_useful_interaction_7d, snapshot.active_listings),
  };
}

export type CampusLiquidityStage = 'seed' | 'building' | 'campaign_ready' | 'liquid';

export function campusLiquidityStage(snapshot: CampusLiquiditySnapshot): CampusLiquidityStage {
  const sellers = snapshot.active_sellers;
  const listings = snapshot.active_listings;
  const usefulRate = marketplaceFunnel(snapshot).useful_interaction_7d_rate || 0;
  if (sellers >= 200 && listings >= 500 && usefulRate >= 40) return 'liquid';
  if (sellers >= 100 && listings >= 300) return 'campaign_ready';
  if (sellers >= 30 && listings >= 100) return 'building';
  return 'seed';
}

export function shouldRunLargeCampusCampaign(snapshot: CampusLiquiditySnapshot) {
  return campusLiquidityStage(snapshot) === 'campaign_ready' || campusLiquidityStage(snapshot) === 'liquid';
}

export const MARKETPLACE_NORTH_STAR = '% de publicaciones que reciben una interacción útil dentro de 7 días';

export const NATIONAL_MARKETPLACE_METRICS = [
  'activation',
  'listing_completed',
  'active_listings_by_campus',
  'search_zero_result_rate',
  'view_to_chat',
  'chat_to_offer',
  'offer_to_agreement',
  'agreement_to_completion',
  'time_to_first_response',
  'time_to_first_sale',
  'no_show_rate',
  'reports_per_1000_transactions',
  'd30_retention',
  'useful_interaction_7d_rate',
  'needs_satisfied_rate',
] as const;
