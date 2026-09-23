import crypto from 'node:crypto';

function finitePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function listingAvailability(listing) {
  const raw = String(listing?.availability_status || '').trim();
  if (raw === 'available' || raw === 'reserved') return raw;
  const state = String(listing?.status || listing?.estado || '').trim().toLowerCase();
  if (state === 'active' || state === 'activo') return 'available';
  if (state === 'reserved' || state === 'reservado') return 'reserved';
  return 'unavailable';
}

function stableId(parts) {
  return crypto.createHash('sha256').update(parts.map((value)=>String(value ?? '')).join(':')).digest('hex').slice(0,40);
}

export function projectFavoriteListingTransitions({
  favorites = [],
  listingsById = new Map(),
  statesByFavoriteId = new Map(),
  preferencesByUid = new Map(),
  observedAt = new Date().toISOString(),
}) {
  const notifications = [];
  const stateWrites = [];

  for (const favorite of favorites) {
    const favoriteId = String(favorite?.id || '').trim();
    const ownerUid = String(favorite?.uid || '').trim();
    const listingId = String(favorite?.product_id || '').trim();
    if (!favoriteId || !ownerUid || !listingId) continue;

    const listing = listingsById.get(listingId);
    if (!listing) continue;

    const currentPrice = finitePrice(listing.price_mxn);
    const currentAvailability = listingAvailability(listing);
    const currentState = {
      favorite_id: favoriteId,
      owner_uid: ownerUid,
      listing_id: listingId,
      last_price_mxn: currentPrice,
      last_availability_status: currentAvailability,
      observed_at: observedAt,
    };
    const prior = statesByFavoriteId.get(favoriteId) || null;

    // The first trusted observation creates a baseline only. It must not
    // pretend a historical transition that was never observed.
    if (!prior || String(prior.owner_uid || '') !== ownerUid || String(prior.listing_id || '') !== listingId) {
      stateWrites.push({ id: favoriteId, data: currentState, reason: prior ? 'identity_reset' : 'baseline' });
      continue;
    }

    const preferences = preferencesByUid.get(ownerUid) || {};
    const priorPrice = finitePrice(prior.last_price_mxn);
    const priorAvailability = String(prior.last_availability_status || 'unavailable');

    if (
      preferences.favorite_price_drop !== false
      && priorPrice != null
      && currentPrice != null
      && currentPrice < priorPrice
    ) {
      notifications.push({
        id: stableId(['favorite-price-drop', favoriteId, priorPrice, currentPrice]),
        recipient_uid: ownerUid,
        kind: 'favorite_price_drop',
        title: 'Bajó el precio de un favorito',
        body: `“${String(listing.title || 'Un artículo guardado').slice(0,90)}” bajó de $${priorPrice.toLocaleString('es-MX')} a $${currentPrice.toLocaleString('es-MX')} MXN.`,
        listing_id: listingId,
        status: 'pending',
        attempts: 0,
        source_event_at: observedAt,
      });
    }

    if (
      preferences.saved_item_available !== false
      && priorAvailability !== 'available'
      && currentAvailability === 'available'
    ) {
      notifications.push({
        id: stableId(['saved-item-available', favoriteId, priorAvailability, currentAvailability]),
        recipient_uid: ownerUid,
        kind: 'saved_item_available',
        title: 'Un favorito volvió a estar disponible',
        body: `“${String(listing.title || 'Un artículo guardado').slice(0,100)}” aparece disponible otra vez.`,
        listing_id: listingId,
        status: 'pending',
        attempts: 0,
        source_event_at: observedAt,
      });
    }

    const changed = priorPrice !== currentPrice || priorAvailability !== currentAvailability;
    if (changed) stateWrites.push({ id: favoriteId, data: currentState, reason: 'transition_observed' });
  }

  const unique = new Map();
  for (const item of notifications) unique.set(item.id,item);
  return { notifications:[...unique.values()], stateWrites };
}
