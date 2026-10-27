import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPublicDiscoveryProduct } from '../src/lib/publicDiscovery.ts';

// Runtime contract: in nationwide V2 discovery only approved listings may be
// discoverable by a buyer, including unknown/missing moderation states.
const statuses = ['approved', 'pending', 'review', 'rejected', 'flagged', 'suspended', '', undefined, null];
for (const status of statuses) {
  const product = { id: 'synthetic-listing', moderation_status: status };
  assert.equal(isPublicDiscoveryProduct(product, true), status === 'approved',
    'V2 public discovery must fail closed for ' + String(status));
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
console.log('PASS V2 buyer discovery: pending/review/rejected/flagged/unknown hidden in Feed and Explore');
