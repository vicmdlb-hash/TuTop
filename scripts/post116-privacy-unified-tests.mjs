import assert from 'node:assert/strict';
import fs from 'node:fs';
import { redactTopiRemoteText } from '../src/lib/topiPrivacy.ts';

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
const email = redactTopiRemoteText('Escríbeme a vendedor@example.com por favor');
assert.equal(email.text?.includes('vendedor@example.com'), false);
assert.ok(email.redactions.includes('email'));
const phone = redactTopiRemoteText('Mi WhatsApp: 246 123 4567');
assert.equal(phone.text?.includes('246 123 4567'), false);
assert.ok(phone.redactions.includes('phone'));
const otp = redactTopiRemoteText('Código de verificación: 839201');
assert.equal(otp.text?.includes('839201'), false);
assert.ok(otp.redactions.includes('otp'));
const productFacts = redactTopiRemoteText('Vendo iPhone 13 de 128 GB en $12,500, batería 88%');
assert.equal(productFacts.text, 'Vendo iPhone 13 de 128 GB en $12,500, batería 88%');

assert.match(assistant, /redactTopiRemoteText/);
assert.match(assistant, /safeDraftForRemote/);
assert.match(publish, /Antes del envío remoto se omiten emails, teléfonos y códigos sensibles evidentes/);
assert.match(publish, /La IA nunca publica por ti/);

console.log('PASS unified privacy: explicit listing consent + Topi PII redaction + UID-bound location cache + no implicit Feed geolocation');
