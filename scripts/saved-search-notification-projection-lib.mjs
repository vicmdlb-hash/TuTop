import crypto from 'node:crypto';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function asTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

export function savedSearchMatchesCanonicalListing(search, listing) {
  if (!search?.notifications_enabled) return { eligible: false, reason: 'notifications_disabled' };
  if (listing?.status !== 'active' || listing?.moderation_status !== 'approved') return { eligible: false, reason: 'listing_not_active_or_approved' };
  if (String(search.owner_uid || '') === String(listing.seller_id || '')) return { eligible: false, reason: 'own_listing' };

  if (search.category && slug(search.category) !== slug(listing.category_id)) return { eligible: false, reason: 'category_mismatch' };
  if (typeof search.max_price_mxn === 'number' && Number(listing.price_mxn) > search.max_price_mxn) return { eligible: false, reason: 'price_above_limit' };

  const query = normalize(search.query);
  if (query) {
    const attributes = listing.attributes && typeof listing.attributes === 'object'
      ? Object.values(listing.attributes).flat().map(String).join(' ')
      : '';
    const haystack = normalize(`${listing.title || ''} ${listing.description || ''} ${listing.category_id || ''} ${attributes}`);
    const terms = query.split(/\s+/).filter(Boolean);
    if (!terms.every((term) => haystack.includes(term))) return { eligible: false, reason: 'query_mismatch' };
  }

  if (search.campus_id && listing.campus_id !== search.campus_id) return { eligible: false, reason: 'campus_mismatch' };
  if (!search.campus_id && search.institution_id && listing.institution_id !== search.institution_id) return { eligible: false, reason: 'institution_mismatch' };
  if (search.visibility_scope === 'campus' && (!search.campus_id || listing.campus_id !== search.campus_id)) return { eligible: false, reason: 'scope_campus_mismatch' };
  if (search.visibility_scope === 'institution' && (!search.institution_id || listing.institution_id !== search.institution_id)) return { eligible: false, reason: 'scope_institution_mismatch' };
  if (search.visibility_scope === 'national' && listing.visibility_scope !== 'national') return { eligible: false, reason: 'scope_national_mismatch' };

  return { eligible: true, reason: 'matched' };
}

export function deterministicSavedSearchNotificationId(searchId, listingId, recipientUid) {
  return crypto.createHash('sha256')
    .update(['saved-search',searchId,listingId,recipientUid].map((value)=>String(value || '')).join(':'))
    .digest('hex')
    .slice(0,40);
}

export function projectSavedSearchNotifications({ searches = [], listings = [], preferencesByUid = new Map(), now = Date.now(), lookbackMs = 48 * 3600_000 }) {
  const cutoff = now - lookbackMs;
  const projected = [];

  for (const listing of listings) {
    const eventTime = asTime(listing.published_at || listing.created_at || listing.updated_at);
    if (!eventTime || eventTime < cutoff) continue;

    for (const search of searches) {
      const decision = savedSearchMatchesCanonicalListing(search, listing);
      if (!decision.eligible) continue;
      const preferences = preferencesByUid.get(String(search.owner_uid || '')) || {};
      if (preferences.saved_search_match === false) continue;

      const price = Number(listing.price_mxn);
      const body = Number.isFinite(price)
        ? `${String(listing.title || 'Nueva publicación').slice(0,90)} · $${price.toLocaleString('es-MX')} MXN`
        : String(listing.title || 'Nueva publicación').slice(0,120);

      projected.push({
        id: deterministicSavedSearchNotificationId(search.id, listing.id, search.owner_uid),
        recipient_uid: String(search.owner_uid),
        kind: 'saved_search_match',
        title: 'Nueva coincidencia para tu búsqueda',
        body,
        listing_id: String(listing.id),
        saved_search_id: String(search.id),
        status: 'pending',
        attempts: 0,
        source_event_at: new Date(eventTime).toISOString(),
      });
    }
  }

  const unique = new Map();
  for (const item of projected) unique.set(item.id,item);
  return [...unique.values()].sort((a,b)=>String(a.source_event_at).localeCompare(String(b.source_event_at)));
}
