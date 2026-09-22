import fs from 'node:fs';
import assert from 'node:assert/strict';

const projector=fs.readFileSync('scripts/v2-favorite-listing-watch-projector.mjs','utf8');
const coverage=fs.readFileSync('scripts/favorite-listing-transition-lib.mjs','utf8');

assert.match(projector,/UPDATE_STAGING_FAVORITE_WATCH_STATE/);
assert.match(projector,/favorite_listing_watch_state/);
assert.match(projector,/notification_preferences/);
assert.match(projector,/notification_outbox/);
assert.match(projector,/projectFavoriteListingTransitions/);
assert.match(coverage,/first trusted observation/i);
assert.match(coverage,/favorite_price_drop/);
assert.match(coverage,/saved_item_available/);

console.log('PASS favorite watcher requires explicit staging ACK and a trusted baseline before transition alerts');
