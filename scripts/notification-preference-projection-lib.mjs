export const NOTIFICATION_KIND_TO_PREFERENCE = Object.freeze({
  new_message: 'new_message',
  offer_received: 'offer_received',
  offer_accepted: 'offer_accepted',
  counter_offer: 'counter_offer',
  reservation_expiring: 'reservation_expiring',
  meetup_scheduled: 'meetup_reminder',
  meetup_reminder: 'meetup_reminder',
  saved_search_match: 'saved_search_match',
  favorite_price_drop: 'favorite_price_drop',
  saved_item_available: 'saved_item_available',
  followed_seller_new_listing: 'followed_seller_new_listing',
  listing_saved_count: 'listing_saved_count',
  weekly_digest: 'weekly_digest',
  safety_alert: 'safety_alert',
});

export const DEFAULT_DISABLED_NOTIFICATION_PREFERENCES = Object.freeze([
  'followed_seller_new_listing',
  'listing_saved_count',
  'weekly_digest',
]);

export function notificationPreferenceKeyForKind(kind) {
  return NOTIFICATION_KIND_TO_PREFERENCE[String(kind || '').trim()] || null;
}

export function notificationPreferenceAllows(kind, rawPreferences = {}) {
  const key = notificationPreferenceKeyForKind(kind);
  if (!key) return true;
  if (typeof rawPreferences?.[key] === 'boolean') return rawPreferences[key];
  return !DEFAULT_DISABLED_NOTIFICATION_PREFERENCES.includes(key);
}
