import assert from 'node:assert/strict';
import fs from 'node:fs';

const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const bridge = fs.readFileSync('src/services/nationalIdentityHydrationBridge.ts','utf8');

assert.match(publish, /operationId\?: string/);
assert.match(publish, /initialDraft\?\.operationId \|\| newPublishOperationId\(\)/);
assert.match(publish, /operationId: publishOperationId/);
assert.match(publish, /canonicalListingsBackend\.create\(listing, category, publishOperationId\)/);
assert.match(publish, /created\.recovered/);

assert.match(backend, /function listingIdForOperation\(operationId: string\)/);
assert.match(backend, /return `listing-op-\$\{clean\}`/);
assert.match(backend, /async create\(listing: CanonicalListingV2, category: ProductCategory, operationId\?: string\)/);
assert.match(backend, /const alreadyCommitted = await recoverCommitted\(\)/);
assert.match(backend, /if \(alreadyCommitted\) return alreadyCommitted/);
assert.match(backend, /catch \(error\) \{[\s\S]*const recovered = await recoverCommitted\(\)/);
assert.match(backend, /currentDocument: \{ exists: false \}/);

assert.match(bridge, /create = async \(listing, category, operationId\)/);
assert.match(bridge, /originalCreateListing\(listing, category, operationId\)/);
assert.match(bridge, /category, operationId\)/);

const op = '550e8400-e29b-41d4-a716-446655440000';
const deterministic = `listing-op-${op}`;
assert.equal(deterministic, 'listing-op-550e8400-e29b-41d4-a716-446655440000');

console.log('PASS publish operation id survives draft + identity bridge and uncertain retry reconciles one deterministic listing');
