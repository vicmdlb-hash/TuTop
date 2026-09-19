import fs from 'node:fs';
import assert from 'node:assert/strict';

const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts','utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const hydrator = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
const explore = fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
const feed = fs.readFileSync('src/components/Feed.tsx','utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx','utf8');
const permissions = fs.readFileSync('src/lib/permissionCenter091.ts','utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx','utf8');

assert.match(nearby, /type PersistedApproxLocation = ApproxLocation & \{ owner_uid: string \}/);
assert.match(nearby, /getCachedApproxLocation\(ownerUid: string/);
assert.match(nearby, /!parsed\.owner_uid \|\| parsed\.owner_uid !== ownerUid/);
assert.match(nearby, /saveApproxLocation\(location: ApproxLocation, ownerUid: string\)/);
assert.match(nearby, /clearApproxLocation\(ownerUid\?: string\)/);

assert.match(publish, /getCachedApproxLocation\(user\.id\)/);
assert.match(publish, /ownerUid: user\.id/);
assert.doesNotMatch(publish, /approxLocation \|\| await requestApproxLocation/);
assert.match(publish, /const location = approxLocation;/);

assert.match(hydrator, /useAppStore\.getState\(\)\.user\.id/);
assert.match(hydrator, /getCachedApproxLocation\(uid\)/);

assert.match(explore, /getCachedApproxLocation\(user\.id\)/);
assert.match(explore, /ownerUid: user\.id/);
assert.match(feed, /getCachedApproxLocation\(user\.id\)/);
assert.match(feed, /ownerUid: user\.id/);
assert.doesNotMatch(feed, /void requestApproxLocation\(\)\.then/);
assert.match(feed, /Location is opt-in/);
assert.match(card, /getCachedApproxLocation\(user\.id\)/);

assert.doesNotMatch(permissions, /getCachedApproxLocation/);
assert.match(permissions, /Publicar no la solicita automáticamente/);

assert.match(gate, /clearApproxLocation\(currentUid \|\| undefined\)/);

console.log('PASS location cache is UID-bound and legacy unscoped cache is rejected');
console.log('PASS Publish never requests location as a side effect');
console.log('PASS logout/Nearby respect account-bound location state');
console.log('Post116 location privacy hardening contract: PASS');
