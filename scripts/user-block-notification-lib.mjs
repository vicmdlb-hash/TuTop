const PRIVATE_KINDS = new Set(['new_message','offer_received','counter_offer','offer_accepted']);

export function directUserPair(notification, chat) {
  if (!PRIVATE_KINDS.has(String(notification?.kind || ''))) return null;
  const recipient = String(notification?.recipient_uid || '').trim();
  const buyer = String(chat?.buyer_id || chat?.comprador_id || '').trim();
  const seller = String(chat?.seller_id || chat?.vendedor_id || '').trim();
  if (!recipient || !buyer || !seller || buyer === seller) return { deny: true };
  if (recipient !== buyer && recipient !== seller) return { deny: true };
  if (notification.chat_id && String(notification.chat_id) !== String(chat.id)) return { deny: true };
  return { buyer, seller };
}

export async function shouldSuppressBlockedDirectNotification(notification, chat, isBlockedEdge) {
  const pair = directUserPair(notification, chat);
  if (pair == null) return false;
  if (pair.deny) return true;
  return Boolean(await isBlockedEdge(pair.buyer,pair.seller) || await isBlockedEdge(pair.seller,pair.buyer));
}
