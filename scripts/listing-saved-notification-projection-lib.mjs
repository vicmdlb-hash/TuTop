import crypto from 'node:crypto';

export function deterministicListingSavedNotificationId(favoriteId, listingId, sellerUid) {
  return crypto.createHash('sha256')
    .update(['listing-saved', favoriteId, listingId, sellerUid].map((value) => String(value || '')).join(':'))
    .digest('hex')
    .slice(0, 40);
}

export function projectListingSavedNotifications({ favorites = [], listingsById = new Map(), preferencesByUid = new Map(), now = Date.now(), lookbackMs = 48 * 3600_000 }) {
  const cutoff = now - lookbackMs;
  const projected = [];

  for (const favorite of favorites) {
    const createdAt = Date.parse(String(favorite.created_at || ''));
    if (!createdAt || createdAt < cutoff) continue;
    const listingId = String(favorite.product_id || '');
    const likerUid = String(favorite.uid || '');
    const listing = listingsById.get(listingId);
    if (!listing || !listingId || !likerUid) continue;

    const sellerUid = String(listing.seller_id || '');
    if (!sellerUid || sellerUid === likerUid) continue;
    if (listing.status !== 'active' || listing.moderation_status !== 'approved') continue;

    const preferences = preferencesByUid.get(sellerUid) || {};
    if (preferences.listing_saved_count !== true) continue;

    projected.push({
      id: deterministicListingSavedNotificationId(favorite.id, listingId, sellerUid),
      recipient_uid: sellerUid,
      kind: 'listing_saved_count',
      title: 'Guardaron tu publicación',
      body: `Tu publicación “${String(listing.title || 'Artículo').slice(0, 90)}” recibió un nuevo guardado.`,
      listing_id: listingId,
      status: 'pending',
      attempts: 0,
      source_event_at: new Date(createdAt).toISOString(),
    });
  }

  const unique = new Map();
  for (const item of projected) unique.set(item.id, item);
  return [...unique.values()].sort((a,b)=>String(a.source_event_at).localeCompare(String(b.source_event_at)));
}
