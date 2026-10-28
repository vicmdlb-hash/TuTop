import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPublicDiscoveryProduct, canViewerOpenListing } from '../src/lib/publicDiscovery.ts';

const statuses = ['approved','pending','review','rejected','flagged','suspended','',undefined,null];
for (const status of statuses) {
  const product={id:'synthetic',vendedor_id:'seller-a',moderation_status:status,estado:'Activo'};
  assert.equal(isPublicDiscoveryProduct(product,true),status==='approved');
  assert.equal(canViewerOpenListing(product,'buyer-b',true),status==='approved');
  assert.equal(canViewerOpenListing(product,'seller-a',true),true);
  assert.equal(canViewerOpenListing(product,'',true),status==='approved');
}
for (const estado of ['Activo','Pausado','Vendido','Archivado','Reservado','',undefined]) {
  const product={id:'synthetic',vendedor_id:'seller-a',moderation_status:'approved',estado};
  assert.equal(isPublicDiscoveryProduct(product,true),estado==='Activo'||estado===undefined,
    'buyer list must exclude known inactive statuses');
  assert.equal(canViewerOpenListing(product,'buyer-b',true),estado==='Activo',
    'buyer direct ID requires active lifecycle');
  assert.equal(canViewerOpenListing(product,'seller-a',true),true,
    'seller retains private listing access');
}
assert.equal(isPublicDiscoveryProduct({moderation_status:'pending'},false),true);
const feed=fs.readFileSync('src/components/Feed.tsx','utf8');
const explore=fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
for (const [name,source] of [['Feed',feed],['Explore',explore]]) {
  assert(source.includes("import { isPublicDiscoveryProduct } from '../lib/publicDiscovery'"),name);
  assert(source.includes('filter((product) => isPublicDiscoveryProduct(product, nationalSchemaEnabled()))'),name);
  assert(source.includes('publicProducts'),name);
}
assert(feed.includes("product.moderation_status === 'pending' || product.moderation_status === 'review'"));
const store=fs.readFileSync('src/store/useAppStore.ts','utf8');
const detail=fs.readFileSync('src/components/ProductDetail.tsx','utf8');
assert(store.includes('canViewerOpenListing(product, state.user.id, nationalSchemaEnabled())'));
assert((store.match(/canViewerOpenListing\(product, state\.user\.id, nationalSchemaEnabled\(\)/g)||[]).length>=3);
assert(detail.includes('canViewerOpenListing(candidate, user.id, nationalSchemaEnabled())'));
assert(detail.includes('canViewerOpenListing(item, user.id, nationalSchemaEnabled())'));
const card=fs.readFileSync('src/components/ProductCard.tsx','utf8');
assert(card.includes("product.moderation_status === 'flagged' ? 'Marcada para revisión'"));
assert(detail.includes("product.moderation_status === 'flagged' ? 'Marcada para revisión"));
assert(feed.includes('myNeedsAttentionProducts.length'));
const canonical=fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const models=fs.readFileSync('src/types/index.ts','utf8');
assert(models.includes("'rejected' | 'flagged'"));
assert(canonical.includes("data.moderation_status === 'flagged' ? 'flagged'"));
console.log('PASS V2 moderation and lifecycle buyer guards; seller-owned private access remains');
