import crypto from 'node:crypto';

export function deterministicMarketplaceNotificationId(kind, eventId, recipientUid, state = '') {
  const input = ['marketplace', kind, eventId, recipientUid, state].map((v) => String(v || '')).join(':');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 40);
}

function asTime(value) {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function counterpart(chat, actor) {
  const participants = Array.isArray(chat?.participants)
    ? chat.participants.map(String).filter(Boolean)
    : [chat?.buyer_id || chat?.comprador_id, chat?.seller_id || chat?.vendedor_id].map(String).filter(Boolean);
  const unique = [...new Set(participants)];
  if (unique.length !== 2 || !unique.includes(String(actor))) return null;
  return unique.find((uid) => uid !== String(actor)) || null;
}

function baseNotification({ id, recipientUid, kind, title, body, eventTime, chatId, listingId, transactionId }) {
  return {
    id,
    recipient_uid: recipientUid,
    kind,
    title: cleanText(title, 90),
    body: cleanText(body, 180),
    ...(chatId ? { chat_id: String(chatId) } : {}),
    ...(listingId ? { listing_id: String(listingId) } : {}),
    ...(transactionId ? { transaction_id: String(transactionId) } : {}),
    status: 'pending',
    attempts: 0,
    source_event_at: new Date(eventTime || Date.now()).toISOString(),
  };
}

export function projectMarketplaceNotifications({ chats = [], messages = [], offers = [], transactions = [], now = Date.now(), lookbackMs = 48 * 3600_000 }) {
  const cutoff = now - lookbackMs;
  const chatById = new Map(chats.map((chat) => [String(chat.id), chat]));
  const projected = [];

  for (const message of messages) {
    const eventTime = asTime(message.created_at);
    if (!eventTime || eventTime < cutoff) continue;
    const chatId = String(message.chat_id || '');
    const chat = chatById.get(chatId);
    const sender = String(message.sender_id || '');
    const recipient = counterpart(chat, sender);
    if (!chat || !sender || !recipient) continue;
    const eventId = `${chatId}/${message.id}`;
    projected.push(baseNotification({
      id: deterministicMarketplaceNotificationId('new_message', eventId, recipient),
      recipientUid: recipient,
      kind: 'new_message',
      title: 'Nuevo mensaje en TuTop',
      body: cleanText(message.text || (message.image_url ? '📷 Foto' : 'Nuevo mensaje'), 120),
      eventTime,
      chatId,
      listingId: chat.product_id || chat.producto_id,
    }));
  }

  for (const offer of offers) {
    const eventTime = asTime(offer.updated_at || offer.created_at);
    if (!eventTime || eventTime < cutoff) continue;
    const actor = String(offer.created_by || offer.buyer_id || '');
    const buyer = String(offer.buyer_id || '');
    const seller = String(offer.seller_id || '');
    if (!actor || !buyer || !seller || buyer === seller || ![buyer, seller].includes(actor)) continue;

    let kind = offer.parent_offer_id ? 'counter_offer' : 'offer_received';
    let recipient = actor === buyer ? seller : buyer;
    let title = kind === 'counter_offer' ? 'Recibiste una contraoferta' : 'Recibiste una oferta';
    let body = Number.isFinite(Number(offer.amount_mxn)) ? `$${Number(offer.amount_mxn).toLocaleString('es-MX')} MXN` : 'Abre TuTop para revisarla.';
    let state = 'pending';

    if (offer.status === 'accepted') {
      kind = 'offer_accepted';
      recipient = actor;
      title = 'Tu oferta fue aceptada';
      body = 'Continúa con la reservación en TuTop.';
      state = 'accepted';
    } else if (offer.status !== 'pending' && offer.status !== 'countered') continue;

    projected.push(baseNotification({
      id: deterministicMarketplaceNotificationId(kind, offer.id, recipient, state),
      recipientUid: recipient,
      kind,
      title,
      body,
      eventTime,
      chatId: offer.chat_id,
      listingId: offer.listing_id,
    }));
  }

  const transactionTitles = {
    reserved: ['reservation_created', 'Publicación reservada'],
    meetup_scheduled: ['meetup_scheduled', 'Encuentro programado'],
    disputed: ['transaction_disputed', 'La operación requiere atención'],
    completed: ['transaction_completed', 'Operación completada'],
    cancelled: ['transaction_cancelled', 'Operación cancelada'],
    expired: ['reservation_expired', 'La reservación expiró'],
  };
  for (const tx of transactions) {
    const eventTime = asTime(tx.updated_at || tx.created_at);
    if (!eventTime || eventTime < cutoff) continue;
    const descriptor = transactionTitles[String(tx.status || '')];
    if (!descriptor) continue;
    const buyer = String(tx.buyer_id || '');
    const seller = String(tx.seller_id || '');
    if (!buyer || !seller || buyer === seller) continue;
    const [kind, title] = descriptor;
    for (const recipient of [buyer, seller]) {
      projected.push(baseNotification({
        id: deterministicMarketplaceNotificationId(kind, tx.id, recipient, tx.status),
        recipientUid: recipient,
        kind,
        title,
        body: 'Abre TuTop para ver el estado de la operación.',
        eventTime,
        chatId: tx.chat_id,
        listingId: tx.listing_id,
        transactionId: tx.id,
      }));
    }
  }

  const unique = new Map();
  for (const item of projected) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => String(a.source_event_at).localeCompare(String(b.source_event_at)));
}
