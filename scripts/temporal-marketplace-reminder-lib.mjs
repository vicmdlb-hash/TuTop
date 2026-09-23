import crypto from 'node:crypto';

function asTime(value) {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function deterministicId(kind, transactionId, recipientUid, bucket) {
  return crypto.createHash('sha256')
    .update(['temporal', kind, transactionId, recipientUid, bucket].map((value) => String(value || '')).join(':'))
    .digest('hex')
    .slice(0, 40);
}

function notification({ kind, transaction, recipientUid, eventAt, bucket, title, body }) {
  return {
    id: deterministicId(kind, transaction.id, recipientUid, bucket),
    recipient_uid: recipientUid,
    kind,
    title,
    body,
    transaction_id: String(transaction.id),
    ...(transaction.chat_id ? { chat_id: String(transaction.chat_id) } : {}),
    ...(transaction.listing_id ? { listing_id: String(transaction.listing_id) } : {}),
    status: 'pending',
    attempts: 0,
    source_event_at: new Date(eventAt).toISOString(),
  };
}

export function projectTemporalMarketplaceReminders({
  transactions = [],
  preferencesByUid = new Map(),
  now = Date.now(),
  reservationWindowMs = 60 * 60_000,
  meetupWindowMs = 60 * 60_000,
}) {
  const projected = [];

  for (const tx of transactions) {
    const buyer = String(tx.buyer_id || '');
    const seller = String(tx.seller_id || '');
    if (!tx.id || !buyer || !seller || buyer === seller) continue;
    const recipients = [buyer, seller];

    if (tx.status === 'reserved') {
      const expiresAt = asTime(tx.reservation_expires_at);
      const remaining = expiresAt - now;
      if (expiresAt && remaining > 0 && remaining <= reservationWindowMs) {
        for (const recipient of recipients) {
          const preferences = preferencesByUid.get(recipient) || {};
          if (preferences.reservation_expiring === false) continue;
          const minutes = Math.max(1, Math.ceil(remaining / 60_000));
          projected.push(notification({
            kind: 'reservation_expiring',
            transaction: tx,
            recipientUid: recipient,
            eventAt: expiresAt,
            bucket: 'within-60m',
            title: 'La reservación está por vencer',
            body: `Quedan aproximadamente ${minutes} min. Abre TuTop para revisar la operación.`,
          }));
        }
      }
    }

    if (tx.status === 'meetup_scheduled') {
      const meetupAt = asTime(tx.meetup_at);
      const remaining = meetupAt - now;
      if (meetupAt && remaining > 0 && remaining <= meetupWindowMs) {
        for (const recipient of recipients) {
          const preferences = preferencesByUid.get(recipient) || {};
          if (preferences.meetup_reminder === false) continue;
          const minutes = Math.max(1, Math.ceil(remaining / 60_000));
          projected.push(notification({
            kind: 'meetup_reminder',
            transaction: tx,
            recipientUid: recipient,
            eventAt: meetupAt,
            bucket: 'within-60m',
            title: 'Tu encuentro de TuTop se acerca',
            body: `Faltan aproximadamente ${minutes} min para el encuentro acordado.`,
          }));
        }
      }
    }
  }

  const unique = new Map();
  for (const item of projected) unique.set(item.id, item);
  return [...unique.values()].sort((a,b)=>String(a.source_event_at).localeCompare(String(b.source_event_at)));
}
