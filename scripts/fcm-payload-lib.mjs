export function fcmDataForNotification(item = {}) {
  if (typeof item?.id !== 'string') throw new Error('FCM_NOTIFICATION_ID_INVALID');
  const notificationId = item.id.trim();
  if (!notificationId) throw new Error('FCM_NOTIFICATION_ID_REQUIRED');
  if (typeof item.recipient_uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.recipient_uid))
    throw new Error('FCM_RECIPIENT_UID_INVALID');

  return Object.fromEntries(
    Object.entries({
      notification_id: notificationId,
      recipient_uid: item.recipient_uid,
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
