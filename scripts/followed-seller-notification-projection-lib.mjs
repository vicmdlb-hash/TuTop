import crypto from 'node:crypto';

function time(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function stableId(parts) {
  return crypto.createHash('sha256').update(parts.map((value)=>String(value || '')).join(':')).digest('hex').slice(0,40);
}

export function projectFollowedSellerNotifications({ follows = [], listings = [], preferencesByUid = new Map(), now = Date.now(), lookbackMs = 48 * 3600_000 }) {
  const cutoff = now - lookbackMs;
  const followsBySeller = new Map();
  for (const follow of follows) {
    const sellerId = String(follow.seller_id || '');
    const followerUid = String(follow.follower_uid || '');
    if (!follow.id || !sellerId || !followerUid || sellerId === followerUid) continue;
    const list = followsBySeller.get(sellerId) || [];
    list.push(follow);
    followsBySeller.set(sellerId, list);
  }

  const projected = [];
  for (const listing of listings) {
    const sellerId = String(listing.seller_id || '');
    const listingId = String(listing.id || '');
    const createdAt = time(listing.published_at || listing.created_at);
    if (!sellerId || !listingId || !createdAt || createdAt < cutoff) continue;
    if (listing.status !== 'active' || listing.moderation_status !== 'approved') continue;
    for (const follow of followsBySeller.get(sellerId) || []) {
      const followerUid = String(follow.follower_uid || '');
      const followedAt = time(follow.created_at);
      if (!followedAt || createdAt < followedAt) continue;
      const preferences = preferencesByUid.get(followerUid) || {};
      if (preferences.followed_seller_new_listing !== true) continue;
      projected.push({
        id: stableId(['followed-seller-new-listing', follow.id, listingId]),
        recipient_uid: followerUid,
        kind: 'followed_seller_new_listing',
        title: 'Un vendedor que sigues publicó algo',
        body: `“${String(listing.title || 'Nueva publicación').slice(0,100)}” ya está disponible en TuTop.`,
        listing_id: listingId,
        status: 'pending',
        attempts: 0,
        source_event_at: new Date(createdAt).toISOString(),
      });
    }
  }
  const unique = new Map();
  for (const item of projected) unique.set(item.id,item);
  return [...unique.values()].sort((a,b)=>String(a.source_event_at).localeCompare(String(b.source_event_at)));
}
