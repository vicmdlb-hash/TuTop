import assert from 'node:assert/strict';
import fs from 'node:fs';

const screen=fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const listings=fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const rate=fs.readFileSync('src/services/rateLimit.ts','utf8');

assert.match(screen,/parsedPrice <= 1_000_000/);
assert.match(screen,/Number\.isInteger\(parsedQuantity\)/);
assert.match(screen,/parsedQuantity >= 1 && parsedQuantity <= 99/);
assert.match(screen,/quantity: parsedQuantity/);
assert.match(screen,/step="1"/);

assert.match(listings,/LISTING_PRICE_INVALID/);
assert.match(listings,/listing\.price_mxn > 1_000_000/);
assert.match(listings,/LISTING_QUANTITY_INVALID/);
assert.match(listings,/Number\.isInteger\(listing\.quantity\)/);

const createStart=listings.indexOf('async create(listing: CanonicalListingV2');
assert.ok(createStart>=0,'canonical listing create missing');
const createEnd=listings.indexOf('\n  async loadMine',createStart);
const createBlock=listings.slice(createStart,createEnd);
assert.match(createBlock,/created_at: _clientCreatedAt/);
assert.match(createBlock,/updated_at: _clientUpdatedAt/);
assert.match(createBlock,/published_at: _clientPublishedAt/);
assert.match(createBlock,/fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME'/);
assert.match(createBlock,/fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME'/);
assert.match(createBlock,/fieldPath: 'published_at', setToServerValue: 'REQUEST_TIME'/);
assert.doesNotMatch(createBlock,/created_at: new Date\(listing\.created_at\)/);
assert.doesNotMatch(createBlock,/updated_at: new Date\(listing\.updated_at\)/);

assert.match(rate,/setToServerValue: 'REQUEST_TIME'/);
assert.match(rate,/fieldPath: 'updated_at'/);
assert.match(rate,/fieldPath: 'window_start'/);
assert.doesNotMatch(rate,/updated_at: at/);

console.log('PASS publication UI blocks quantity/price values rejected by Firestore');
console.log('PASS canonical backend fails fast on invalid quantity/price');
console.log('PASS listing publication uses Firestore REQUEST_TIME, not device wall clock');
console.log('PASS listing rate-limit uses Firestore REQUEST_TIME, not device wall clock');
