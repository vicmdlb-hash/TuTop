import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isCurrentBackendHydration,isLiveAccountSnapshot} from '../src/lib/backendHydrationIdentity.ts';
const A='synthetic-a', B='synthetic-b';
assert.equal(isCurrentBackendHydration(A,A,A,3,3),true);
for(const [expected,live,snapshot,startEpoch,currentEpoch] of [
 [A,B,A,3,3],[A,A,B,3,3],[A,null,A,3,3],[A,A,A,3,4],
 ['',A,A,3,3],[A,A,undefined,3,3],[A,A,A,-1,0],
]) assert.equal(isCurrentBackendHydration(expected,live,snapshot,startEpoch,currentEpoch),false);
// Real shared UID predicate: bootstrap A is allowed with A's live token;
// A's completed request must never overwrite B or resurrect signed-out A.
assert.equal(isLiveAccountSnapshot('',A,A),true);
assert.equal(isLiveAccountSnapshot(A,A,A),true);
for(const [storeUid,sessionUid,snapshotUid] of [
  [B,B,A], [B,A,A], [A,B,B], [A,A,B],
  ['',null,A], ['',undefined,A], [A,null,A],
  ['',A,B], ['',A,''], ['', '',A],
]) assert.equal(isLiveAccountSnapshot(storeUid,sessionUid,snapshotUid),false,
  'stale or unauthenticated snapshot must not overwrite another account');
const appStore = fs.readFileSync('src/store/useAppStore.ts','utf8');
assert(appStore.includes("import { isLiveAccountSnapshot } from '../lib/backendHydrationIdentity';"));
assert(appStore.includes('if (!isLiveAccountSnapshot(state.user.id, onlineBackend.session?.uid, snapshot.user.id)) return state;'));
// Every optimistic rollback has an originating account; late A failures
// cannot mutate the B view for a shared listing/chat on one device.
for (const [start,end] of [
  ['  updateProduct: (id, updates) => {','  removeProduct:'],
  ['  sendMessage: (chatId, text) => {','  sendImageMessage:'],
  ['  sendImageMessage: (chatId, imageUrl) => {','  markChatRead:'],
  ['  markChatRead: (chatId) => {','  confirmDelivery:'],
]) {
  const section = appStore.split(start)[1]?.split(end)[0];
  assert(section, `missing mutation ${start}`);
  assert(section.includes('const actorUid = '), `missing actor snapshot ${start}`);
  assert(section.includes('if (get().user.id !== actorUid) return;'), `unguarded late error ${start}`);
  assert(section.indexOf('if (get().user.id !== actorUid) return;') < section.indexOf('reportSyncError(set, error);'),
    `late error must not render into another account ${start}`);
}
// The legacy/base store is used outside the V2 connected bridge.
// A failed old send must remove only its message, not restore the prior chat object.
for(const [start,end] of [
  ['  sendMessage: (chatId, text) => {','  sendImageMessage:'],
  ['  sendImageMessage: (chatId, imageUrl) => {','  markChatRead:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section?.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
  assert(section.includes('mensajes: item.mensajes.filter((candidate) => candidate.id !== message.id)'));
  assert(!section.includes('item.id === chatId ? chat : item'), 'whole-chat rollback can lose later messages');
}
// An old failed mark-read must not replace the chat object or newer messages.
const markRead=appStore.split('  markChatRead: (chatId) => {')[1]?.split('  confirmDelivery:')[0];
assert(markRead);
assert(markRead.includes('const mutationKey = `${actorUid}:${chatId}`;'));
assert(markRead.includes('chatReadMutationVersion.get(mutationKey) !== version'));
assert(markRead.includes('{ ...chat, sin_leer: before.sin_leer }'));
assert(!markRead.includes('chat.id === chatId ? before : chat'), 'whole-chat read rollback discards new messages');
// Confirmation failures must not resurrect an older chat object or another account.
const confirm=appStore.split('  confirmDelivery: (chatId) => {')[1]?.split('  submitReview:')[0];
assert(confirm?.includes('const actorUid = state.user.id;'));
assert(confirm.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
assert(confirm.includes('if (get().user.id !== actorUid) return;'));
assert(confirm.includes('item.confirmaciones_entrega === confirmations'));
assert(confirm.includes('entrega_confirmada: chat.entrega_confirmada'));
assert(!confirm.includes('item.id === chatId ? chat : item'), 'failed confirmation must preserve later chat messages');
// Reviews must be participant-only and stale A errors must never affect B.
const review=appStore.split('  submitReview: (chatId, calificacion, comentario) => {')[1]?.split('  bidProduct:')[0];
assert(review?.includes('const actorUid = state.user.id;'));
assert(review.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
assert(review.includes('if (get().user.id !== actorUid) return;'));
assert(review.includes('current.reviews.filter((item) => item.id !== review.id)'));
// Creating a product/chat in A cannot display its async error or rollback B.
for(const [start,end] of [
  ['  addProduct: (product) => {','  publishProduct:'],
  ['  addChat: (chat) => {','  updateChat:'],
  ['  contactProduct: (productId) => {','  openChat:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section?.includes('const actorUid = '), `actor missing ${start}`);
  assert(section.includes('if (get().user.id !== actorUid) return;'), `late A callback is unsafe: ${start}`);
}
const addChat=appStore.split('  addChat: (chat) => {')[1]?.split('  updateChat:')[0];
assert(addChat.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
const contact=appStore.split('  contactProduct: (productId) => {')[1]?.split('  openChat:')[0];
assert(contact.includes('if (!actorUid || !product || product.vendedor_id === actorUid'));
// Failed product mutations must never roll back a newer edit on the same listing.
const productEdit=appStore.split('  updateProduct: (id, updates) => {')[1]?.split('  removeProduct:')[0];
assert(appStore.includes('const productMutationVersion = new Map<string, number>();'));
assert(productEdit?.includes('const mutationKey = `${actorUid}:${id}`;'));
assert(productEdit.includes('productMutationVersion.set(mutationKey, version)'));
assert(productEdit.includes('if (get().user.id !== actorUid) return;'));
assert(productEdit.includes('if (productMutationVersion.get(mutationKey) !== version) return;'));
assert(productEdit.indexOf('productMutationVersion.get(mutationKey) !== version') < productEdit.indexOf('if (before) set('));
// Late publish/bid responses may settle, but must not show A's error on B.
for(const [start,end] of [
  ['  publishProduct: async (product, bidAmount = 0) => {','  updateProduct:'],
  ['  bidProduct: async (productId, amount) => {','  toggleFavorite:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section?.includes('const actorUid = '), `missing actor ${start}`);
  assert(section.includes('if (get().user.id === actorUid) reportSyncError(set, error);'), `late error after session switch ${start}`);
  assert(section.includes('return get().user.id === actorUid;'), `late success after session switch ${start}`);
}
// A's successful callback may resolve after B signs in. Prevent the callback
// from loading (and then applying) B's snapshot, even if hydrateOnline itself
// checks that the returned snapshot belongs to the current session.
for(const [start,end] of [
  ['  publishProduct: async (product, bidAmount = 0) => {','  updateProduct:'],
  ['  sendMessage: (chatId, text) => {','  sendImageMessage:'],
  ['  sendImageMessage: (chatId, imageUrl) => {','  markChatRead:'],
  ['  confirmDelivery: (chatId) => {','  submitReview:'],
  ['  submitReview: (chatId, calificacion, comentario) => {','  bidProduct:'],
  ['  bidProduct: async (productId, amount) => {','  toggleFavorite:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section, `missing async reload ${start}`);
  const reload=section.indexOf('const snapshot = await onlineBackend.loadSnapshot();');
  const hydrate=section.indexOf('get().hydrateOnline(snapshot);',reload);
  assert(reload>=0 && hydrate>reload, `missing guarded reload ${start}`);
  assert(section.lastIndexOf('if (get().user.id !== actorUid)',reload)>=0, `old account can reload B ${start}`);
  assert(section.slice(reload,hydrate).includes('if (get().user.id !== actorUid) return'), `old account can hydrate B ${start}`);
}
const source=fs.readFileSync('src/components/BackendGate.tsx','utf8');
assert.match(source,/const expectedEpoch = authEpoch\.current/);
assert.match(source,/const snapshot = await onlineBackend\.loadSnapshot\(\);[\s\S]*if \(!stillCurrent\(snapshot\.user\.id\)\) return;[\s\S]*hydrateOnline\(snapshot\)/);
assert.match(source,/const verified = await verifiedEmailBetaAuth\.refreshVerificationStatus\(\);\s*if \(!stillCurrent\(expectedUid\)\) return;/);
assert.match(source,/authEpoch\.current \+= 1;[\s\S]*const currentUid/);
assert.match(source,/syncQueued\.current = true/);
assert.match(source,/syncQueued\.current = false;[\s\S]*Promise\.resolve\(\)\.then\(\(\) => sync\(true\)\)/);

// Backend-level account isolation, independent from mounted React hydrators.
// All Firestore read results and seller-name lookups may outlive logout,
// A→B, and same UID re-login with a new credential witness.
const listingBackend = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const sessionHelper = listingBackend.split('function assertListingReadSessionCurrent(')[1]?.split('function hasValue(',1)[0];
assert(sessionHelper?.includes('assertFirebaseRequestSessionCurrent(requestSession, client.currentSession,'),
  'listing read helper must check the original and current request session');
assert(sessionHelper.includes('new FirebaseRestClient(getFirebaseConfig()).currentSession'),
  'listing read helper must also check persisted current session');
const readSections = [
  ['loadMine(', 'loadMarketplaceProducts(', 'const documents = await client.runQuery', 'return documents;'],
  ['loadMarketplaceProducts(', 'loadNearbyProducts(', 'const products = await productsForDocuments', 'return products;'],
  ['loadNearbyProducts(', 'updateProduct(', 'const products = await productsForDocuments', 'nearbyCache.set(cacheKey'],
];
for (const [start, end, awaited, completion] of readSections) {
  const section = listingBackend.split('  async ' + start)[1]?.split('  async ' + end)[0];
  assert(section?.includes('const requestSession = client.currentSession;'), 'missing read session witness: ' + start);
  const awaitIndex = section.indexOf(awaited);
  const checkIndex = section.indexOf('assertListingReadSessionCurrent(client, requestSession);');
  const completeIndex = section.indexOf(completion);
  assert(awaitIndex >= 0 && checkIndex > awaitIndex && completeIndex > checkIndex,
    'stale listing data must be rejected after the final await and before return/cache: ' + start);
}

console.log('PASS stale Firebase snapshot A cannot hydrate UI for B or after logout; queued B retry is not silently dropped');


// SYNTHETIC LISTING READ-SESSION INTEGRATION. Execute actual compiled backend
// against deferred Firestore reads, without Firebase network or real identities.
const { compileTypescriptFixture } = await import('./typescript-fixture-compiler.mjs');
const { runInNewContext } = await import('node:vm');
const { assertFirebaseRequestSessionCurrent, sameFirebaseSession } =
  await import('../src/lib/firebaseSharedSessionGuard.ts');
const compiledListings = compileTypescriptFixture('src/services/canonicalListingsBackend.ts');
const fakeA = { uid: 'synthetic-a', idToken: 'synthetic-a-token', refreshToken: 'synthetic-a-refresh' };
const fakeB = { uid: 'synthetic-b', idToken: 'synthetic-b-token', refreshToken: 'synthetic-b-refresh' };
const fakeRelogin = { ...fakeA, idToken: 'synthetic-a-token-new', refreshToken: 'synthetic-a-refresh-new' };
let liveSession = fakeA;
const pendingListingReads = [];
class SyntheticFirestoreClient {
  constructor() { this.currentSession = liveSession; }
  runQuery() { return new Promise((resolve) => pendingListingReads.push(resolve)); }
}
const deps = {
  '../lib/marketplaceGovernance.ts': {
    categorySafetyRequirements: () => ({ required: [], forbiddenPublic: [] }),
    classifyMarketplaceItem: () => ({ classification: 'allowed', reasons: [] }),
  },
  '../lib/listingSchemaV2.ts': { listingV2HasNoLegacyDescriptionPacking: () => true, validCanonicalVideoUri: () => true },
  '../lib/universityNetwork.ts': { CAMPUSES: [], FACULTIES: [], INSTITUTIONS: [] },
  '../lib/productAssistant.ts': { MARKETPLACE_CATEGORIES: [], normalizeCategory: (v) => v },
  '../lib/nearbyMarketplace.ts': { validNearbyGeoCell: () => true, validListingApproxLocationAttributes: () => true },
  '../lib/firebaseSharedSessionGuard': { assertFirebaseRequestSessionCurrent, sameFirebaseSession },
  '../lib/firebaseSharedSessionGuard.ts': { assertFirebaseRequestSessionCurrent, sameFirebaseSession },
  './firebaseRest.ts': { FirebaseRestClient: SyntheticFirestoreClient },
  './nationalBackend.ts': { nationalSchemaEnabled: () => true },
  './rateLimit.ts': { commitWithRateLimit: async () => {} },
  './runtimeConfig.ts': { getFirebaseConfig: () => ({}) },
};
const exportsForListing = {};
runInNewContext(compiledListings, {
  exports: exportsForListing, module: { exports: exportsForListing },
  require(specifier) {
    assert(Object.hasOwn(deps, specifier), 'unexpected real I/O import: ' + specifier);
    return deps[specifier];
  },
  Date, Math, Promise, Map, Set, Number, String, JSON, console,
}, { timeout: 3500 });
const syntheticListings = exportsForListing.canonicalListingsBackend;
assert(syntheticListings, 'compiled canonical listings methods must be available');
function resolveListingReads(expected) {
  assert.equal(pendingListingReads.length, expected, 'fixture should query only expected Firestore reads');
  pendingListingReads.splice(0).forEach((resolve) => resolve([]));
}
const staleMine = syntheticListings.loadMine();
resolveListingReads(1);
liveSession = fakeB;
await assert.rejects(staleMine, /AUTH_SESSION_CHANGED/, 'A private listings cannot return after B signs in');

liveSession = fakeA;
const staleMarket = syntheticListings.loadMarketplaceProducts();
resolveListingReads(2); // national approved query and current seller's private listings
liveSession = fakeRelogin; // same UID does not make the old request valid
await assert.rejects(staleMarket, /AUTH_SESSION_CHANGED/, 'A re-login must reject an old market snapshot');

liveSession = fakeA;
const staleNearby = syntheticListings.loadNearbyProducts({geoCells:['g1:90:81']});
resolveListingReads(2); // approved listings and own private listings
liveSession = fakeB;
await assert.rejects(staleNearby, /AUTH_SESSION_CHANGED/, 'stale nearby results must not populate the cache');
liveSession = fakeRelogin;
const newNearby = syntheticListings.loadNearbyProducts({geoCells:['g1:90:81']});
resolveListingReads(2); // stale A result was not cached
assert.equal((await newNearby).length, 0);
const sameSessionCacheHit = await syntheticListings.loadNearbyProducts({geoCells:['g1:90:81']});
assert.equal(sameSessionCacheHit.length, 0);
assert.equal(pendingListingReads.length,0,'same authenticated session may reuse its Nearby cache');
liveSession = fakeA;
const freshSessionMiss = syntheticListings.loadNearbyProducts({geoCells:['g1:90:81']});
resolveListingReads(2); // same UID, different credentials: cache must miss
assert.equal((await freshSessionMiss).length,0);

console.log('PASS listing backend read results fail closed before returning/caching after A→B or A→logout→A');
console.log('PASS synthetic deferred Firestore reads reject old A sessions and Nearby cache is session-scoped');
