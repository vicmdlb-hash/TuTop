import type { AppNotification, AppTab } from '../types';

export type InAppNotificationDestination =
  | { kind: 'chat'; chatId: string }
  | { kind: 'product'; productId: string }
  | { kind: 'transaction'; transactionId: string }
  | { kind: 'tab'; tab: AppTab }
  | { kind: 'none' };

export function inAppNotificationDestination(notification: AppNotification): InAppNotificationDestination {
  if (notification.chat_id) return { kind: 'chat', chatId: notification.chat_id };
  if (notification.product_id) return { kind: 'product', productId: notification.product_id };
  if (notification.transaction_id) return { kind: 'transaction', transactionId: notification.transaction_id };
  if (notification.saved_search_id || notification.kind === 'search') return { kind: 'tab', tab: 'feed' };
  if (notification.offer_id || notification.kind === 'offer' || notification.kind === 'reservation' || notification.kind === 'delivery' || notification.kind === 'bid') {
    return { kind: 'tab', tab: 'inbox' };
  }
  if (notification.kind === 'verification') return { kind: 'tab', tab: 'profile' };
  return { kind: 'none' };
}
