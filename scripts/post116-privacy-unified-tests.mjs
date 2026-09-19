import assert from 'node:assert/strict';
import fs from 'node:fs';

const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts','utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const feed = fs.readFileSync('src/components/Feed.tsx','utf8');
const explore = fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx','utf8');
const hydrator = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
const permissions = fs.readFileSync('src/lib/permissionCenter091.ts','utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx','utf8');
const assistant = fs.readFileSync('src/services/assistantProvider.ts','utf8');

assert.match(nearby, /type PersistedApproxLocation = ApproxLocation & \{ owner_uid: string \}/);
assert.match(nearby, /getCachedApproxLocation\(ownerUid: string/);
assert.match(nearby, /!parsed\.owner_uid \|\| parsed\.owner_uid !== ownerUid/);
assert.match(nearby, /saveApproxLocation\(location: ApproxLocation, ownerUid: string\)/);
assert.match(nearby, /clearApproxLocation\(ownerUid\?: string\)/);
assert.match(nearby, /ownerUid\?: string/);

assert.match(publish, /getCachedApproxLocation\(user\.id\)/);
assert.match(publish, /ownerUid: user\.id/);
assert.match(publish, /const location = locationOptIn \? approxLocation : null/);
assert.doesNotMatch(publish, /approxLocation \|\| await requestApproxLocation/);

assert.match(explore, /getCachedApproxLocation\(user\.id\)/);
assert.match(explore, /ownerUid: user\.id/);
assert.match(feed, /getCachedApproxLocation\(user\.id\)/);
assert.match(feed, /ownerUid: user\.id/);
assert.doesNotMatch(feed, /void requestApproxLocation\(\)\.then/);
assert.match(card, /getCachedApproxLocation\(user\.id\)/);
assert.match(hydrator, /getCachedApproxLocation\(uid\)/);

assert.doesNotMatch(permissions, /getCachedApproxLocation/);
assert.match(permissions, /únicamente cuando la activas para tu cuenta/);
assert.match(gate, /clearApproxLocation\(currentUid \|\| undefined\)/);

// Preserve #47 privacy truth while importing #58's UID-scoped cache.
assert.match(assistant, /redactTopiRemoteText/);
assert.match(assistant, /safeDraftForRemote/);
assert.match(publish, /Antes del envío remoto se omiten emails, teléfonos y códigos sensibles evidentes/);
assert.match(publish, /La IA nunca publica por ti/);

console.log('PASS unified privacy: explicit listing consent + Topi PII redaction + UID-bound location cache + no implicit Feed geolocation');
