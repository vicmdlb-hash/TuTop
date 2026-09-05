export type NotificationPreferenceKey =
  | 'new_message'
  | 'offer_received'
  | 'offer_accepted'
  | 'counter_offer'
  | 'reservation_expiring'
  | 'meetup_reminder'
  | 'saved_search_match'
  | 'favorite_price_drop'
  | 'saved_item_available'
  | 'followed_seller_new_listing'
  | 'listing_saved_count'
  | 'weekly_digest'
  | 'safety_alert';

export type NotificationPriority = 'high' | 'normal' | 'low';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  new_message: true,
  offer_received: true,
  offer_accepted: true,
  counter_offer: true,
  reservation_expiring: true,
  meetup_reminder: true,
  saved_search_match: true,
  favorite_price_drop: true,
  saved_item_available: true,
  followed_seller_new_listing: false,
  listing_saved_count: false,
  weekly_digest: false,
  safety_alert: true,
};

export const NOTIFICATION_PRIORITY: Record<NotificationPreferenceKey, NotificationPriority> = {
  new_message: 'high',
  offer_received: 'high',
  offer_accepted: 'high',
  counter_offer: 'high',
  reservation_expiring: 'high',
  meetup_reminder: 'high',
  saved_search_match: 'normal',
  favorite_price_drop: 'normal',
  saved_item_available: 'normal',
  followed_seller_new_listing: 'low',
  listing_saved_count: 'low',
  weekly_digest: 'low',
  safety_alert: 'high',
};

export function normalizeNotificationPreferences(input?: Partial<NotificationPreferences>): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(input || {}) };
}

export function shouldDeliverNotification(key: NotificationPreferenceKey, input?: Partial<NotificationPreferences>) {
  return normalizeNotificationPreferences(input)[key];
}

export function enabledNotificationKeys(input?: Partial<NotificationPreferences>) {
  const preferences = normalizeNotificationPreferences(input);
  return (Object.keys(preferences) as NotificationPreferenceKey[]).filter((key) => preferences[key]);
}
