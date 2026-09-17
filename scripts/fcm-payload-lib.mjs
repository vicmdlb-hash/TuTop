export function fcmDataForNotification(item = {}) {
  const notificationId = String(item.id || '').trim();
  if (!notificationId) throw new Error('FCM_NOTIFICATION_ID_REQUIRED');

  return Object.fromEntries(
    Object.entries({
      notification_id: notificationId,
      kind: item.kind,
      listing_id: item.listing_id,
      saved_search_id: item.saved_search_id,
      transaction_id: item.transaction_id,
      chat_id: item.chat_id,
    })
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([key, value]) => [key, String(value)]),
  );
}
