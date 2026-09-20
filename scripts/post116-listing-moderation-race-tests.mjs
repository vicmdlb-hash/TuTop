import assert from 'node:assert/strict';
import fs from 'node:fs';

const rest = fs.readFileSync('src/services/firebaseRest.ts', 'utf8');
const listings = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
const hardener = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');
const governance = fs.readFileSync('tests/firestore.v2.governance.test.mjs', 'utf8');

assert.match(rest, /options: \{ merge\?: boolean; exists\?: boolean; updateTime\?: string \}/);
assert.match(rest, /currentDocument\.updateTime/);
assert.match(rest, /FIRESTORE_PRECONDITION_CONFLICT/);

assert.match(listings, /snapshot\.updateTime \? \{ updateTime: snapshot\.updateTime \} : \{\}/);
assert.match(listings, /error\?\.payload\?\.error\?\.status === 'FAILED_PRECONDITION'/);
assert.match(listings, /const fresh = await client\.getDocument<CanonicalListingV2>/);
assert.match(listings, /if \(contentChanged\) patch\.moderation_status = 'pending'/);

assert.match(hardener, /seller sensitive edit must return canonical listing to pending regardless of stale client snapshot/);
assert.match(hardener, /affectedKeys\(\)\.hasAny\(\['category_id','subcategory_id','title','description','attributes','condition','delivery_methods','meeting_point_ids','shipping_available','photo_urls','video_urls','visibility_scope'\]\)/);

assert.match(governance, /race-listing/);
assert.match(governance, /assertFails\(updateDoc\(doc\(seller, 'listings_v2\/race-listing'\)/);
assert.match(governance, /moderation_status: 'pending'/);
assert.match(governance, /price_mxn: 425/);

console.log('PASS listing moderation race: updateTime precondition + fresh retry + rules/emulator defense-in-depth');
