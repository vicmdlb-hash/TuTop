import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPublicDiscoveryProduct, canViewerOpenListing } from '../src/lib/publicDiscovery.ts';

// Runtime contract: in nationwide V2 discovery only approved listings may be
// discoverable by a buyer, including unknown/missing moderation states.
const statuses = ['approved', 'pending', 'review', 'rejected', 'flagged', 'suspended', '', undefined, null];
for (const status of statuses) {
  const product = { id: 'synthetic-listing', vendedor_id: 'seller-a', moderation_status: status };
  assert.equal(isPublicDiscoveryProduct(product, true), status === 'approved',
    'V2 public discovery must fail closed for ' + String(status));
  assert.equal(canViewerOpenListing(product, 'buyer-b', true), status === 'approved',
    'V2 buyer must never open unapproved listing by direct ID');
  assert.equal(canViewerOpenListing(product, 'seller-a', true), true,
    'V2 seller must retain access to own unapproved listing');
  assert.equal(canViewerOpenListing(product, '', true), status === 'approved',
    'empty/anonymous viewer UID must not establish ownership');
}
// Historical V1 remains unchanged; gating V1 requires a product decision.
assert.equal(isPublicDiscoveryProduct({ moderation_status: 'pending' }, false), true);

const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const explore = fs.readFileSync('src/components/ExploreScreen.tsx', 'utf8');
for (const [name, source] of [['Feed', feed], ['Explore', explore]]) {
  assert(source.includes("import { isPublicDiscoveryProduct } from '../lib/publicDiscovery'"),
    name + ': shared moderation gate required');
  assert(source.includes('filter((product) => isPublicDiscoveryProduct(product, nationalSchemaEnabled()))'),
    name + ': buyer-facing list must use shared moderation gate');
  assert(source.includes('publicProducts'), name + ': must consume filtered products');
}
assert(feed.includes("product.moderation_status === 'pending' || product.moderation_status === 'review'"),
  'pending products remain seller-only and must not be represented as published');
const store = fs.readFileSync('src/store/useAppStore.ts', 'utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx', 'utf8');
assert(store.includes('canViewerOpenListing(product, state.user.id, nationalSchemaEnabled())'),
  'openProduct/contactProduct/bidProduct must guard direct-ID access in V2');
assert((store.match(/canViewerOpenListing\(product, state\.user\.id, nationalSchemaEnabled\(\)\)/g) || []).length >= 3,
  'three buyer entrypoints must be guarded');
assert(detail.includes('canViewerOpenListing(candidate, user.id, nationalSchemaEnabled())'),
  'detail must hide revoked/unapproved listing before rendering effects');
assert(detail.includes('canViewerOpenListing(item, user.id, nationalSchemaEnabled())'),
  'related listings must not leak unapproved products');
const card = fs.readFileSync('src/components/ProductCard.tsx', 'utf8');
assert(card.includes("product.moderation_status === 'flagged' ? 'Marcada para revisión'"),
  'flagged listing must not appear as an unqualified public offer to its seller');
assert(detail.includes("product.moderation_status === 'flagged' ? 'Marcada para revisión"),
  'seller detail must expose flagged moderation state');
assert(feed.includes('myNeedsAttentionProducts.length'),
  'seller overview must count rejected/flagged listings separately');
console.log('PASS V2 buyer listing boundary and seller moderation states: approved/pending/rejected/flagged');
