export type MarketplaceEventName =
  | 'listing_created'
  | 'offer_created'
  | 'offer_accepted'
  | 'reservation_created'
  | 'meetup_scheduled'
  | 'delivery_confirmed'
  | 'transaction_completed'
  | 'transaction_disputed'
  | 'report_created'
  | 'moderation_resolved'
  | 'saved_search_matched';

export type MarketplaceEvent = {
  name: MarketplaceEventName;
  actor_uid?: string;
  listing_id?: string;
  offer_id?: string;
  transaction_id?: string;
  institution_id?: string;
  campus_id?: string;
  scope?: string;
  occurred_at: string;
};

const allowedKeys = new Set([
  'name','actor_uid','listing_id','offer_id','transaction_id','institution_id','campus_id','scope','occurred_at',
]);

export function sanitizeMarketplaceEvent(input: Record<string, unknown>): MarketplaceEvent {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowedKeys.has(key) && value !== undefined && value !== null) output[key] = value;
  }
  return output as MarketplaceEvent;
}

export function isMarketplaceEventSafe(input: Record<string, unknown>) {
  const forbidden = ['telefono','phone','email','institutional_email','image_data','credential','comentario','message','description'];
  return forbidden.every((key) => !(key in input));
}
