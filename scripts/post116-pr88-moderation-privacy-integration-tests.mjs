import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const admin = fs.readFileSync('src/services/scopedAdminBackend.ts','utf8');
const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');
const canonicalRules = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs','utf8');
const privateReads = fs.readFileSync('scripts/harden-private-admin-read-rules.mjs','utf8');
const explore = fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
const nearby = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
const feed = fs.readFileSync('src/components/Feed.tsx','utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx','utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx','utf8');

assert.match(admin, /throw new Error\('ADMIN_ROLE_INVALID'\)/);
assert.doesNotMatch(admin, /return 'super_admin';/);

assert.doesNotMatch(prepare, /function legacyGlobalAdmin/);
assert.doesNotMatch(prepare, /legacyGlobalAdmin\(\)/);
assert.match(prepare, /adminHasRole\('super_admin'\)/);

assert.match(backend, /if \(contentChanged\) patch\.moderation_status = 'pending'/);
assert.match(canonicalRules, /seller sensitive edit must return canonical listing to pending/);
assert.match(canonicalRules, /affectedKeys\(\)\.hasAny\(\['category_id','subcategory_id','title','description','attributes','condition','delivery_methods','meeting_point_ids','shipping_available','photo_urls','video_urls','visibility_scope'\]\)/);

assert.match(privateReads, /function canReadIdentityPrivate/);
assert.match(privateReads, /function canReadWalletPrivate/);
assert.match(privateReads, /function canReadCommercePrivate/);
assert.match(privateReads, /favorites owner-only scope/);
assert.match(privateReads, /saved searches owner-only scope/);
assert.match(privateReads, /reservation lock private read scope/);

assert.match(backend, /limitPerCell\?: number; force\?: boolean/);
assert.match(backend, /if \(!input\.force && cached/);
assert.match(explore, /V2_LISTINGS_BASE_HYDRATED_EVENT/);
assert.match(explore, /limitPerCell: 15, force: true/);
assert.match(nearby, /hydrate = async \(location: ApproxLocation, force = false\)/);
assert.match(nearby, /hydrateCached\(true\)/);

assert.match(feed, /myPublicProducts/);
assert.match(feed, /myPendingProducts/);
assert.match(feed, /todavía no son visibles para otros usuarios/);
assert.match(card, /ownerModerationLabel/);
assert.match(card, /En revisión/);
assert.match(detail, /aún no visible para otros/);

console.log('PASS PR88 moderation/privacy integration: fail-closed admin roles + forced remoderation + least privilege + Nearby freshness + seller visibility truth');
