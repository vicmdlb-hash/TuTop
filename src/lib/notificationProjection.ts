import type { AppNotification } from '../types';

export function appNotificationKindFromOutbox(rawKind: unknown): AppNotification['kind'] {
  const kind = String(rawKind || '').trim();
  if (kind === 'new_message') return 'message';
  if (kind === 'offer_received' || kind === 'offer_accepted' || kind === 'counter_offer') return 'offer';
  if (kind === 'reservation_created' || kind === 'reservation_expired' || kind === 'reservation_expiring') return 'reservation';
  if (kind === 'meetup_scheduled' || kind === 'meetup_reminder' || kind === 'transaction_completed' || kind === 'transaction_cancelled' || kind === 'transaction_disputed') return 'delivery';
  if (kind === 'saved_search_match') return 'search';
  if (kind === 'safety_alert') return 'safety';
  if (kind === 'verification' || kind === 'verification_approved' || kind === 'verification_rejected') return 'verification';
  if (kind === 'weekly_bid' || kind === 'bid') return 'bid';
  return 'system';
}
