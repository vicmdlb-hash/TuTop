import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

// Run the actual cache/event implementation in a synthetic web runtime.
const js = compileTypescriptFixture('src/lib/nearbyMarketplace.ts');
const backing = new Map();
const events = [];
const listeners = new Map();
const localStorage = {
  getItem:k=>backing.get(k)??null,
  setItem:(k,v)=>backing.set(k,v),
  removeItem:k=>backing.delete(k),
};
const window = {
  dispatchEvent(ev) { events.push(ev); (listeners.get(ev.type)||[]).forEach(fn=>fn(ev)); },
  addEventListener(type, fn) { listeners.set(type,[...(listeners.get(type)||[]),fn]); },
};
class SyntheticCustomEvent {
  constructor(type, options) { this.type=type;this.detail=options.detail; }
}
const pendingPositions = [];
const navigator = { geolocation:{
  getCurrentPosition(success) { pendingPositions.push(success); }
}};
const module = {exports:{}};
vm.runInNewContext(js,{
  module,exports:module.exports,require(name){
    assert.equal(name,'../services/nativeDeviceCapabilities');
    return {isNativeDeviceRuntime:()=>false};
  },localStorage,window,CustomEvent:SyntheticCustomEvent,navigator,
  Date,Math,JSON,Number,String,Promise,Set,console,URLSearchParams,
},{timeout:2500});
const lib = module.exports;
const A='synthetic-user-A', B='synthetic-user-B';
const key='tutop.approx-location.v1';
const loc=lib.toApproxLocation(19.314,-98.251);
assert(loc);
backing.set(key,JSON.stringify(loc)); // legacy unscoped cache cannot cross to anyone
assert.equal(lib.getCachedApproxLocation(A),null);
assert.equal(backing.has(key),false,'legacy unscoped location must be physically purged');
assert.equal(lib.getCachedApproxLocation(B),null);
lib.saveApproxLocation(loc,A);
assert.equal(JSON.parse(backing.get(key)).owner_uid,A);
assert.equal(events.at(-1).detail.owner_uid,A,'event must be identity scoped');
assert.equal(lib.getCachedApproxLocation(B),null,'B cannot use cached A location');
assert.equal(backing.has(key),true,'a different UID must not erase A-owned location');
assert.equal(lib.getCachedApproxLocation(A).latitude,19.31);

let acceptedForB=0;
window.addEventListener(lib.NEARBY_LOCATION_EVENT, ev=>{
 if(ev.detail?.owner_uid===B) acceptedForB++;
});
lib.saveApproxLocation(loc,A);
window.dispatchEvent(new SyntheticCustomEvent(lib.NEARBY_LOCATION_EVENT,{detail:loc}));
assert.equal(acceptedForB,0,'old/unscoped event must not be delivered as B');

// Emulate A location request followed by logout (even with absent cache).
let currentUid=A;
const late=lib.requestApproxLocation({ownerUid:A,requestPermission:true,
  isOwnerActive:()=>currentUid===A});
assert.equal(pendingPositions.length,1);
lib.clearApproxLocation(A); // cancels pending A even if another user now owns storage
currentUid=B;
lib.saveApproxLocation(loc,B);
const beforeLateEvents=events.length;
pendingPositions[0]({coords:{latitude:19.318,longitude:-98.257}});
assert.equal(await late,null,'late request after logout cannot return A position');
assert.equal(events.length,beforeLateEvents,'late A request must not emit location');
assert.equal(lib.getCachedApproxLocation(A),null,'late A must not restore cache');
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.25,'A cannot overwrite B cache');
assert.equal(acceptedForB,1,'B should accept its own event');

// A->B can also happen through a shared-session change without clear().
// The live UID predicate must reject the stale account's late response.
const noLogout=lib.requestApproxLocation({ownerUid:A,requestPermission:true,
  isOwnerActive:()=>currentUid===A});
assert.equal(pendingPositions.length,2);
pendingPositions[1]({coords:{latitude:19.31,longitude:-98.25}});
assert.equal(await noLogout,null,'different live owner must reject stale result');
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.25);

// Current B is allowed to obtain and use its own approximate location.
const active=lib.requestApproxLocation({ownerUid:B,requestPermission:true,
  isOwnerActive:()=>currentUid===B});
assert.equal(pendingPositions.length,3);
pendingPositions[2]({coords:{latitude:19.318,longitude:-98.257}});
assert((await active)?.latitude===19.32);
assert.equal(events.at(-1).detail.owner_uid,B);
assert.equal(acceptedForB,2);
lib.clearApproxLocation(A);
assert.equal(lib.getCachedApproxLocation(B)?.longitude,-98.26,'A cleanup cannot erase B location');
lib.clearApproxLocation(B);
assert.equal(lib.getCachedApproxLocation(B),null);

// A direct caller or legacy device cache must not leak full GPS precision.
const precise = { ...loc, latitude: 19.314159265, longitude: -98.251234567 };
lib.saveApproxLocation(precise,A);
const sanitized = JSON.parse(backing.get(key));
assert.equal(sanitized.latitude,19.31,'persistent latitude must be coarse');
assert.equal(sanitized.longitude,-98.25,'persistent longitude must be coarse');
assert.equal(events.at(-1).detail.latitude,19.31,'location events must be coarse');
assert.equal(events.at(-1).detail.longitude,-98.25,'location events must not disclose GPS precision');
assert.equal(lib.getCachedApproxLocation(A)?.latitude,19.31);
backing.set(key,JSON.stringify({ ...precise, owner_uid:A }));
assert.equal(lib.getCachedApproxLocation(A),null,'matching UID must not restore a precise legacy cache');
assert.equal(backing.has(key),false,'unsafe precise cache must be purged');
backing.set(key,JSON.stringify({ ...loc, owner_uid:A, latitude:'19.31' }));
assert.equal(lib.getCachedApproxLocation(A),null,'cached coordinates must be numeric');
assert.equal(backing.has(key),false,'malformed cached coordinate must be removed');
const previousEventCount=events.length;
lib.saveApproxLocation({ ...loc, latitude: Number.NaN },A);
assert.equal(backing.has(key),false,'invalid coordinates must never persist');
assert.equal(events.length,previousEventCount,'invalid coordinates must never emit an event');

// A cache must not retain expired location data merely because it is unreadable.
backing.set(key,JSON.stringify({ ...loc, owner_uid:A, captured_at:new Date(Date.now() - 7 * 60 * 60_000).toISOString() }));
assert.equal(lib.getCachedApproxLocation(A),null,'expired owner cache must not restore');
assert.equal(backing.has(key),false,'expired location must be purged from localStorage');
backing.set(key,'{invalid-json');
assert.equal(lib.getCachedApproxLocation(A),null,'malformed cache must be rejected');
assert.equal(backing.has(key),false,'malformed cache must not remain on a shared device');

// Only the declared approximate-location fields may reach local storage or
// cross-component events, even from a JS caller with extra runtime fields.
const privateLocation = {
  ...loc,
  latitude: 19.314159265,
  longitude: -98.251234567,
  owner_uid: B,
  exact_address: 'synthetic private address',
  authToken: 'SYNTHETIC_NEVER_STORE',
};
lib.saveApproxLocation(privateLocation,A);
const storedPrivate = JSON.parse(backing.get(key));
assert.deepEqual(Object.keys(storedPrivate).sort(),
  ['captured_at','latitude','longitude','owner_uid','source'].sort(),
  'location persistence must allowlist fields only');
assert.equal(storedPrivate.owner_uid,A,'caller must not overwrite cache ownership');
assert.equal(storedPrivate.exact_address,undefined);
assert.equal(storedPrivate.authToken,undefined);
assert.equal(events.at(-1).detail.authToken,undefined,'event must not expose arbitrary token');
assert.equal(events.at(-1).detail.exact_address,undefined,'event must not expose precise address');
assert.equal(events.at(-1).detail.owner_uid,A);
backing.set(key,JSON.stringify({ ...loc, owner_uid:A, exact_address:'legacy private detail' }));
assert.equal(lib.getCachedApproxLocation(A),null,'legacy cache extra keys must fail closed');
assert.equal(backing.has(key),false,'legacy cache extra keys must be purged');
const beforeStaleEvents=events.length;
lib.saveApproxLocation({ ...loc, captured_at:new Date(Date.now() - 7 * 60 * 60_000).toISOString() },A);
assert.equal(backing.has(key),false,'stale direct saves must not recreate cache');
lib.saveApproxLocation({ ...loc, captured_at:new Date(Date.now() + 60_000).toISOString() },A);
assert.equal(backing.has(key),false,'future direct saves must not create cache');
lib.saveApproxLocation({ ...loc, captured_at:'not-a-time' },A);
assert.equal(backing.has(key),false,'invalid timestamp must not create cache');
assert.equal(events.length,beforeStaleEvents,'invalid or stale direct saves must not broadcast events');
lib.saveApproxLocation({ ...loc, source:'unapproved' },A);
assert.equal(JSON.parse(backing.get(key)).source,'device','unknown source should not survive');
lib.clearApproxLocation(A);

// Full consumer contracts prevent cross-account UI dispatch and stale async hydration.
for(const path of ['src/components/ProductCard.tsx','src/components/ExploreScreen.tsx']){
 const src=fs.readFileSync(path,'utf8');
 assert.match(src,/detail\?\.owner_uid === user\.id|detail\?\.owner_uid !== user\.id/);
 assert.match(src,/\[user\.id\]/);
 assert.match(src,/set(?:ViewerLocation|Location)\(getCachedApproxLocation\(user\.id\)\)/);
}
const feed=fs.readFileSync('src/components/Feed.tsx','utf8');
const explore=fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
assert.match(feed,/isOwnerActive:\s*\(\) => useAppStore\.getState\(\)\.user\.id === requestUid/);
assert.match(feed,/setSearchHistory\(readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.searchHistory, user\.id, 6\)\)/);
assert.match(explore,/isOwnerActive:\s*\(\) => useAppStore\.getState\(\)\.user\.id === requestUid/);
assert.match(explore,/if \(useAppStore\.getState\(\)\.user\.id !== requestUid\) return;/);
assert.match(explore,/setLocationBusy\(false\);/);
assert.match(explore,/setNearbyBusy\(false\);/);
const publish=fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
assert.match(publish,/ownerUid: requestUid, isOwnerActive: stillCurrent/);
// Permission or a cached coordinate is not per-listing consent. Require an
// explicit opt-in at the listing-write call site and sanitize the final payload.
assert.match(publish,/const location = locationOptIn \? approxLocation : null;/);
assert.match(publish,/attributes: \{ \.\.\.normalizedAttributes, \.\.\.locationAttributes\(location\) \}/);
const fineLocation = { ...loc, latitude: 19.314159265, longitude: -98.251234567 };
const optedOutPayload = lib.locationAttributes(null);
assert.equal(Object.keys(optedOutPayload).length, 0, 'no consent must attach zero location attributes');
const optedInPayload = lib.locationAttributes(fineLocation);
assert.equal(optedInPayload.approx_latitude, 19.31, 'listing payload must not attach precise latitude');
assert.equal(optedInPayload.approx_longitude, -98.25, 'listing payload must not attach precise longitude');
assert.equal(optedInPayload.geo_cell, lib.geoCellForLocation(fineLocation));
assert.equal(Object.keys(lib.locationAttributes({ ...loc, latitude: Infinity })).length, 0,
  'malformed location cannot be serialized into a listing');

assert.match(publish,/locationRequestSerial\.current === requestSerial/);
assert.match(publish,/useAppStore\.getState\(\)\.user\.id === requestUid/);
assert.match(publish,/if \(!stillCurrent\(\)\) return;/);
assert.match(publish,/const removeListingLocation = \(\) => \{\s*locationRequestSerial\.current \+= 1;/);
assert.match(publish,/useEffect\(\(\) => \(\) => \{ locationRequestSerial\.current \+= 1; \}, \[user\.id\]\)/);
// Run the real V2 public moderation filter and verify buyer/seller separation.
const filterJs = compileTypescriptFixture('src/lib/publicDiscovery.ts');
const filterModule = { exports: {} };
vm.runInNewContext(filterJs, { module: filterModule, exports: filterModule.exports }, { timeout: 2500 });
const publicFilter = filterModule.exports.isPublicDiscoveryProduct;
for (const status of ['pending', 'review', 'rejected', undefined]) {
  assert.equal(publicFilter({ moderation_status: status }, true), false, 'V2 discovery rejects nonapproved status');
}
assert.equal(publicFilter({ moderation_status: 'approved' }, true), true);
assert.equal(publicFilter({ moderation_status: undefined }, false), true, 'legacy catalog remains compatible');
const feedDiscovery = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const exploreDiscovery = fs.readFileSync('src/components/ExploreScreen.tsx', 'utf8');
assert.match(feedDiscovery, /const publicProducts = useMemo/);
assert.match(feedDiscovery, /const list = publicProducts.filter/);
assert.match(feedDiscovery, /const myPendingProducts = mySellerProducts.filter/);
assert.match(exploreDiscovery, /const publicProducts = useMemo/);
assert.match(exploreDiscovery, /return publicProducts\s+\.filter/);
// Public seller profile must share the fail-closed V2 visibility guard,
// not accidentally expose owner's pending listings through a public overlay.
const sellerPublicProfile = fs.readFileSync('src/components/SellerPublicProfile.tsx', 'utf8');
assert.match(sellerPublicProfile, /import \{ isPublicDiscoveryProduct \} from '\.\.\/lib\/publicDiscovery'/);
assert.match(sellerPublicProfile, /product\.vendedor_id === sellerId && product\.estado === 'Activo' && isPublicDiscoveryProduct\(product, nationalSchemaEnabled\(\)\)/);
const sellerInventory = [
  { vendedor_id: 'seller-A', estado: 'Activo', moderation_status: 'approved', id: 'approved-public' },
  { vendedor_id: 'seller-A', estado: 'Activo', moderation_status: 'pending', id: 'own-pending' },
  { vendedor_id: 'seller-A', estado: 'Activo', moderation_status: 'review', id: 'review' },
  { vendedor_id: 'seller-A', estado: 'Activo', moderation_status: 'rejected', id: 'rejected' },
  { vendedor_id: 'seller-B', estado: 'Activo', moderation_status: 'approved', id: 'other-seller' },
  { vendedor_id: 'seller-A', estado: 'Inactivo', moderation_status: 'approved', id: 'inactive' },
];
const publicSellerIds = sellerInventory.filter((product) =>
  product.vendedor_id === 'seller-A' && product.estado === 'Activo' && publicFilter(product, true)
).map((product) => product.id);
assert.deepEqual(publicSellerIds, ['approved-public'], 'only approved active current seller listings can appear on public profile');
assert.equal(sellerInventory.filter((product) => product.vendedor_id === 'seller-A' && product.estado === 'Activo').length, 4,
  'private seller inventory remains separate and is not deleted');


const h=fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
assert.match(h,/location\.owner_uid !== useAppStore\.getState\(\)\.user\.id/);
assert.match(h,/useAppStore\.getState\(\)\.user\.id !== requestUid/);

const exploreFreshness=fs.readFileSync('src/components/ExploreScreen.tsx','utf8');
assert.match(exploreFreshness,/document\.addEventListener\('visibilitychange', onForeground\)/);
assert.match(exploreFreshness,/window\.addEventListener\('focus', onForeground\)/);
assert.match(exploreFreshness,/Date\.now\(\) - lastRequested < 60_000/);
assert.match(exploreFreshness,/setNearbyProducts\(\[\]\);[\s\S]*setNearbyRefreshKey\(\(current\) => current \+ 1\)/);
assert.match(exploreFreshness,/document\.removeEventListener\('visibilitychange', onForeground\)/);
// Execute the real mounted Nearby hydrator against a controlled async A -> B -> A race.
// A UID-only comparison passes incorrectly when the same account signs back in.
const hydratorJs = compileTypescriptFixture('src/components/V2NearbyListingsHydrator.tsx');
const hydrationRequests = [];
const hydrationSubscriptions = new Set();
const hydrationListeners = new Map();
const hydrationState = { user: { id: A }, products: [] };
let hydrationCleanup = null;
const mockAppStore = {
  getState: () => hydrationState,
  setState: (patch) => {
    Object.assign(hydrationState, patch);
    for (const listener of hydrationSubscriptions) listener(hydrationState);
  },
  subscribe: (listener) => {
    hydrationSubscriptions.add(listener);
    return () => hydrationSubscriptions.delete(listener);
  },
};
const mockHydrationWindow = {
  addEventListener(type, listener) {
    hydrationListeners.set(type, [...(hydrationListeners.get(type) || []), listener]);
  },
  removeEventListener(type, listener) {
    hydrationListeners.set(type, (hydrationListeners.get(type) || []).filter((fn) => fn !== listener));
  },
  dispatchEvent(event) {
    for (const listener of hydrationListeners.get(event.type) || []) listener(event);
  },
};
const hydrationModule = { exports: {} };
vm.runInNewContext(hydratorJs, {
  module: hydrationModule, exports: hydrationModule.exports,
  require(name) {
    if (name === 'react') return { useEffect: (effect) => { hydrationCleanup = effect(); } };
    if (name === '../lib/nearbyMarketplace') return {
      getCachedApproxLocation: (uid) => uid ? loc : null,
      nearbyGeoCells: () => ['g1:1:1'],
      NEARBY_LOCATION_EVENT: 'tutop:approx-location',
    };
    if (name === '../services/canonicalListingsBackend') return {
      canonicalListingsBackend: {
        loadNearbyProducts: () => new Promise((resolve) => hydrationRequests.push(resolve)),
      },
    };
    if (name === '../store/useAppStore') return { useAppStore: mockAppStore };
    if (name === './V2ListingsHydrator') return { V2_LISTINGS_BASE_HYDRATED_EVENT: 'tutop:v2-listings-base-hydrated' };
    throw new Error('Unexpected hydrator import: ' + name);
  },
  window: mockHydrationWindow, Map, Date, Promise, console,
}, { timeout: 2500 });
hydrationModule.exports.default();
assert.equal(hydrationRequests.length, 1, 'initial A Nearby request expected');
mockAppStore.setState({ user: { id: B }, products: [] });
mockAppStore.setState({ user: { id: A }, products: [] });
hydrationRequests[0]([{ id: 'stale-A-product', updated_at: '2026-10-23T00:00:00Z' }]);
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hydrationState.products.length, 0, 'stale A result must not return after A -> B -> A');
mockAppStore.setState({ user: { id: B }, products: [] });
mockHydrationWindow.dispatchEvent({
  type: 'tutop:approx-location',
  detail: { ...loc, owner_uid: B },
});
assert.equal(hydrationRequests.length, 2, 'current B must be allowed a new request');
hydrationRequests[1]([{ id: 'current-B-product', updated_at: '2026-10-23T00:00:01Z' }]);
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hydrationState.products[0]?.id, 'current-B-product');

// A fresh Nearby result that omits an earlier approved listing must evict it.
mockHydrationWindow.dispatchEvent({
  type: 'tutop:approx-location', detail: { ...loc, owner_uid: B },
});
assert.equal(hydrationRequests.length, 3);
hydrationRequests[2]([]);
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hydrationState.products.length, 0, 'withdrawn Nearby-only listing must be evicted');

// Authoritative base records must survive that same Nearby reconciliation.
mockAppStore.setState({ products: [{ id: 'base-authoritative-product', updated_at: '2026-10-23T00:00:02Z' }] });
mockHydrationWindow.dispatchEvent({ type: 'tutop:v2-listings-base-hydrated' });
assert.equal(hydrationRequests.length, 4);
hydrationRequests[3]([{ id: 'nearby-only-product', updated_at: '2026-10-23T00:00:03Z' }]);
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hydrationState.products.length, 2);
mockHydrationWindow.dispatchEvent({
  type: 'tutop:approx-location', detail: { ...loc, owner_uid: B },
});
assert.equal(hydrationRequests.length, 5);
hydrationRequests[4]([]);
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hydrationState.products.map((product) => product.id).join(','), 'base-authoritative-product');
assert.equal(hydrationSubscriptions.size, 1);
hydrationCleanup();
assert.equal(hydrationSubscriptions.size, 0, 'cleanup must remove the owner subscription');

console.log('PASS real Nearby cache/events isolate A/B and stale A async callbacks; no device or Firebase usage');


// Execute the actual base V2 hydrator (not just a source regex) with simulated
// account changes and network responses. There are no real users or requests.
{
  const baseJs = compileTypescriptFixture('src/components/V2ListingsHydrator.tsx');
  const harness = () => {
    const subscriptions = new Set();
    const pending = [];
    const emitted = [];
    const state = { user: { id: 'qa-account-A', campus_id: 'qa-campus' }, products: [] };
    const store = (select) => select(state);
    store.getState = () => state;
    store.setState = (changes) => {
      Object.assign(state, changes);
      for (const listener of subscriptions) listener(state);
    };
    store.subscribe = (listener) => {
      subscriptions.add(listener);
      return () => subscriptions.delete(listener);
    };
    const events = new Map();
    const addListener = (type, callback) => events.set(type, callback);
    const removeListener = (type) => events.delete(type);
    const windowMock = {
      addEventListener: addListener,
      removeEventListener: removeListener,
      dispatchEvent: (event) => { emitted.push(event.type); },
    };
    const documentMock = {
      visibilityState: 'visible',
      addEventListener: addListener,
      removeEventListener: removeListener,
    };
    let cleanup = () => {};
    const moduleMock = { exports: {} };
    vm.runInNewContext(baseJs, {
      module: moduleMock, exports: moduleMock.exports,
      require: (name) => {
        if (name === 'react') return { useEffect: (fn) => { cleanup = fn(); } };
        if (name === '../services/canonicalListingsBackend') return {
          canonicalListingsBackend: { loadMarketplaceProducts: () => new Promise(resolve => pending.push(resolve)) },
        };
        if (name === '../services/nationalBackend') return { nationalSchemaEnabled: () => true };
        if (name === '../store/useAppStore') return { useAppStore: store };
        throw new Error('Unexpected fixture dependency: ' + name);
      },
      window: windowMock, document: documentMock,
      navigator: { onLine: true }, Event: class { constructor(type) { this.type = type; } },
      Date, Promise, console,
    }, { timeout: 2500 });
    moduleMock.exports.default();
    return { state, store, pending, emitted, close: () => cleanup(), subscriptions };
  };
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
  };
  // A reply after A->B must not replace B's products even before React cleanup.
  const changed = harness();
  assert.equal(changed.pending.length, 1);
  changed.store.setState({ user: { id: 'qa-account-B' }, products: [{ id: 'B-current' }] });
  changed.pending[0]([{ id: 'A-stale' }]);
  await settle();
  assert.equal(changed.state.products.map(p => p.id).join(','), 'B-current');
  assert.equal(changed.emitted.length, 0);
  changed.close();
  assert.equal(changed.subscriptions.size, 0);

  // Returning to UID A does not reactivate its old in-flight response.
  const rotated = harness();
  rotated.store.setState({ user: { id: 'qa-account-B' } });
  rotated.store.setState({ user: { id: 'qa-account-A' }, products: [{ id: 'A-fresh' }] });
  rotated.pending[0]([{ id: 'A-obsolete-epoch' }]);
  await settle();
  assert.equal(rotated.state.products.map(p => p.id).join(','), 'A-fresh');
  assert.equal(rotated.emitted.length, 0);
  rotated.close();

  // The same owner/epoch must still receive fresh products and hydration event.
  const current = harness();
  current.pending[0]([{ id: 'A-approved' }]);
  await settle();
  assert.equal(current.state.products.map(p => p.id).join(','), 'A-approved');
  assert.deepEqual(current.emitted, ['tutop:v2-listings-base-hydrated']);
  current.close();
  console.log('PASS V2 base hydrate rejects late A->B and A->B->A responses, retains current-owner success');
}
