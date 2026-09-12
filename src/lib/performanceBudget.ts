export const PERFORMANCE_BUDGET = {
  feed_page_size: 24,
  search_page_size: 24,
  chat_initial_messages: 50,
  chat_load_more_messages: 50,
  max_listing_photos_compat: 4,
  max_listing_photo_bytes_compat: 180_000,
  max_chat_image_bytes: 130_000,
  max_cached_feed_items: 80,
  max_cached_favorites: 300,
  max_offline_drafts: 20,
  network_retry_limit: 4,
} as const;

export type NetworkProfile = 'offline' | 'slow' | 'normal';

export function networkProfile(input: { online: boolean; effectiveType?: string; saveData?: boolean }): NetworkProfile {
  if (!input.online) return 'offline';
  if (input.saveData || ['slow-2g', '2g', '3g'].includes(input.effectiveType || '')) return 'slow';
  return 'normal';
}

export function feedPageSize(profile: NetworkProfile) {
  if (profile === 'offline') return 0;
  if (profile === 'slow') return 12;
  return PERFORMANCE_BUDGET.feed_page_size;
}

export function shouldPreloadSecondaryImages(profile: NetworkProfile) {
  return profile === 'normal';
}

export function retryableHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function networkRetryDelayMs(attempt: number) {
  const safe = Math.max(0, Math.min(PERFORMANCE_BUDGET.network_retry_limit, attempt));
  return Math.min(15_000, 750 * 2 ** safe);
}

export function shouldPaginateCollection(requestedCount: number, collection: 'feed' | 'search' | 'chat') {
  const threshold = collection === 'chat' ? PERFORMANCE_BUDGET.chat_initial_messages : PERFORMANCE_BUDGET.feed_page_size;
  return requestedCount > threshold;
}
