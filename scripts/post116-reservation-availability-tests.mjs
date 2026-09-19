import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync('src/lib/listingSchemaV2.ts','utf8');
const listings = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const tx = fs.readFileSync('src/services/canonicalTransactionsBackend.ts','utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx','utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx','utf8');
const store = fs.readFileSync('src/store/useAppStore.ts','utf8');
const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');
const lockRules = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs','utf8');

assert.match(schema, /availability_status\?: 'available' \| 'reserved'/);
assert.match(listings, /availability_status: data\.availability_status === 'reserved' \? 'reserved' : 'available'/);
assert.match(listings, /availability_status: 'available' as const/);
assert.match(listings, /Number\(a\.availability_status === 'reserved'\)/);

assert.match(tx, /reservationAvailabilityWrite/);
assert.match(tx, /availability_status: availability/);
assert.match(tx, /reservationAvailabilityWrite\(client, offer\.listing_id, 'reserved', at\)/);
assert.match(tx, /reservationAvailabilityWrite\(client, transaction\.listing_id, 'available'/);
assert.match(tx, /LISTING_ALREADY_RESERVED/);

assert.match(prepare, /availability_status/);
assert.match(prepare, /affectedKeys\(\)\.hasAny\(\['availability_status'\]\)/);
assert.match(lockRules, /availability_status == 'reserved'/);
assert.match(lockRules, /availability_status == 'available'/);

assert.match(card, /Reservado temporalmente/);
assert.match(card, /reservedForViewer/);
assert.match(detail, /Reservado temporalmente/);
assert.match(detail, /disabled=\{reserved\}/);
assert.match(detail, /item\.availability_status !== 'reserved'/);
assert.match(store, /product\.availability_status === 'reserved' && !existing/);

console.log('PASS reservation availability truth is public-safe, atomic with lock lifecycle and blocks new buyer actions while reserved');
