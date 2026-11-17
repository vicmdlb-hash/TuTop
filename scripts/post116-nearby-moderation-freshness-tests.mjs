import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const hydrator = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx','utf8');
const explore = fs.readFileSync('src/components/ExploreScreen.tsx','utf8');

assert.match(backend, /force\?: boolean/);
assert.match(backend, /if \(!input\.force && cached && cached\.expiresAt > Date\.now\(\)\s*&& sameFirebaseSession\(cached\.session, requestSession\)\) return cached\.products/);
assert.match(backend, /nearbyCache = new Map<string, \{ products: Product\[\]; expiresAt: number; session: FirebaseSessionIdentity \}>\(\)/);
assert.match(backend, /nearbyCache\.set\(cacheKey, \{ products, expiresAt: Date\.now\(\) \+ NEARBY_CACHE_TTL_MS, session: requestSession! \}\)/);

assert.match(hydrator, /const hydrate = async \(location: ApproxLocation, force = false\)/);
assert.match(hydrator, /loadNearbyProducts\(\{ geoCells: cells, limitPerCell: 10, force \}\)/);
// Current owner-safe base refresh first drops stale Nearby-only records.
const handlerStart = hydrator.indexOf('const onBaseHydrated = () => {');
const handlerEnd = hydrator.indexOf('window.addEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart, 'base hydration handler must exist');
const handler = hydrator.slice(handlerStart, handlerEnd);
assert.match(handler, /baseProductIds = new Set/);
assert.match(handler, /nearbyInjectedIds\.clear\(\)/);
assert.match(handler, /hydrateCached\(true\)/);

assert.match(explore, /V2_LISTINGS_BASE_HYDRATED_EVENT/);
assert.match(explore, /setNearbyProducts\(\[\]\)/);
assert.match(explore, /setNearbyRefreshKey\(\(current\) => current \+ 1\)/);
assert.match(explore, /loadNearbyProducts\(\{ geoCells: cells, limitPerCell: 15, force: true \}\)/);

console.log('PASS nearby moderation freshness: authoritative base hydration invalidates open Explore state and bypasses nearby cache');


// Execute the ACTUAL V2 base hydrator in a deferred synthetic Firestore runtime.
// A reconnect while a fetch is in flight must not silently lose its refresh,
// and an A→B→A owner change must not replay an obsolete read.
const { runInNewContext } = await import('node:vm');
const { compileTypescriptFixture } = await import('./typescript-fixture-compiler.mjs');
const rendered = compileTypescriptFixture('src/components/V2ListingsHydrator.tsx');
const deferredReads = [];
const uiListeners = new Map();
const uiSubscriptions = new Set();
const current = { user: { id: 'synthetic-A' }, products: [] };
let cleanup = () => {};
const fakeStore = (selector) => selector(current);
fakeStore.getState = () => current;
fakeStore.setState = (patch) => {
  Object.assign(current, patch);
  for (const onChange of uiSubscriptions) onChange(current);
};
fakeStore.subscribe = (onChange) => {
  uiSubscriptions.add(onChange);
  return () => uiSubscriptions.delete(onChange);
};
const events = {
  addEventListener(name, callback) {
    uiListeners.set(name, [...(uiListeners.get(name) || []), callback]);
  },
  removeEventListener(name, callback) {
    uiListeners.set(name, (uiListeners.get(name) || []).filter((fn) => fn !== callback));
  },
  dispatchEvent(event) {
    for (const callback of uiListeners.get(event.type) || []) callback(event);
  },
};
const syntheticCatalogBackend = {
  loadMarketplaceProducts: () => new Promise((resolve) => deferredReads.push(resolve)),
};
const vmModule = { exports: {} };
runInNewContext(rendered, {
  module: vmModule, exports: vmModule.exports,
  require(name) {
    if (name === 'react') return { useEffect(effect) { cleanup = effect(); } };
    if (name === '../services/canonicalListingsBackend') return { canonicalListingsBackend: syntheticCatalogBackend };
    if (name === '../services/nationalBackend') return { nationalSchemaEnabled: () => true };
    if (name === '../store/useAppStore') return { useAppStore: fakeStore };
    throw new Error('Unexpected base hydrator dependency ' + name);
  },
  window: events, document: { visibilityState: 'visible', ...{
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } },
  navigator: { onLine: true },
  Event: class { constructor(type) { this.type = type; } },
  Date, Promise, Set, console,
}, { timeout: 2500 });
const flushRead = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};
vmModule.exports.default();
assert.equal(deferredReads.length, 1, 'initial base catalog fetch expected');
events.dispatchEvent({ type: 'online' });
events.dispatchEvent({ type: 'online' });
assert.equal(deferredReads.length, 1, 'overlapping reconnects coalesce while the initial read is running');
deferredReads[0]([{ id: 'old-approved-listing' }]);
await flushRead();
assert.equal(deferredReads.length, 2, 'a queued forced refresh must start immediately after first completion');
deferredReads[1]([{ id: 'new-approved-listing' }]);
await flushRead();
assert.deepEqual(current.products.map((x) => x.id), ['new-approved-listing'],
  'new authoritative response replaces old catalog');
assert.equal(deferredReads.length, 2, 'two overlap events must not create redundant third read');
// A stale base hydrator must never retry after A→B→A in the same mounted effect.
events.dispatchEvent({ type: 'online' });
assert.equal(deferredReads.length, 3);
events.dispatchEvent({ type: 'online' });
fakeStore.setState({ user: { id: 'synthetic-B' } });
fakeStore.setState({ user: { id: 'synthetic-A' } });
deferredReads[2]([{ id: 'stale-session-listing' }]);
await flushRead();
assert.equal(deferredReads.length, 3, 'A→B→A invalidates a queued obsolete retry');
assert.deepEqual(current.products.map((x) => x.id), ['new-approved-listing'],
  'A→B→A cannot hydrate obsolete catalog state');
cleanup();
events.dispatchEvent({ type: 'online' });
assert.equal(deferredReads.length, 3, 'cleanup removes reconnect handler');
// On a failed authenticated catalog fetch, the real component must not
// export raw transport errors into QA logs (URLs, account identifiers, tokens).
const errorVm = { exports: {} };
const capturedWarnings = [];
const isolatedErrorBackend = {
  loadMarketplaceProducts: () =>
    Promise.reject(new Error('secret synthetic token=private-uid-A https://example.test/query?token=test-private')),
};
const errorStore = (selector) => selector(current);
errorStore.getState = () => current;
errorStore.setState = () => {};
errorStore.subscribe = () => () => {};
runInNewContext(rendered, {
  module: errorVm, exports: errorVm.exports,
  require(name) {
    if (name === 'react') return { useEffect(effect) { effect(); } };
    if (name === '../services/canonicalListingsBackend') return { canonicalListingsBackend: isolatedErrorBackend };
    if (name === '../services/nationalBackend') return { nationalSchemaEnabled: () => true };
    if (name === '../store/useAppStore') return { useAppStore: errorStore };
    throw new Error('Unexpected error-privacy dependency ' + name);
  },
  window: events,
  document: {
    visibilityState: 'visible',
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  },
  navigator: { onLine: true },
  Event: class { constructor(type) { this.type = type; } },
  Date, Promise, Set,
  console: { warn: (...args) => capturedWarnings.push(args) },
}, { timeout: 2500 });
errorVm.exports.default();
await flushRead();
assert.equal(capturedWarnings.length, 1,
  'failed listing sync should produce one bounded diagnostic');
assert.deepEqual(capturedWarnings[0],
  ['[TuTop V2 listings sync] failed'],
  'never log untrusted Firebase exception or account-bearing URL');
console.log('PASS base listing refresh: overlapping online event is replayed exactly once; A→B→A stays isolated');

// Nearby stale-injection guard: exercise the actual React hydrator using
// synthetic Firestore results. A refresh error must evict only Nearby-injected
// items, without discarding the authoritative base catalog or a newer query.
const nearModule = { exports: {} };
const nearListeners = new Map();
const nearCallbacks = new Set();
const nearPending = [];
const nearState = {
  user: { id: 'synthetic-A' },
  products: [{ id: 'base', updated_at: '2026-11-15T07:00:00Z', source: 'base-old' }],
};
let nearCleanup = () => {};
const nearStore = selector => selector(nearState);
nearStore.getState = () => nearState;
nearStore.setState = patch => {
  Object.assign(nearState, patch);
  for (const callback of nearCallbacks) callback(nearState);
};
nearStore.subscribe = callback => {
  nearCallbacks.add(callback);
  return () => nearCallbacks.delete(callback);
};
const nearWindow = {
  addEventListener(type, callback) {
    nearListeners.set(type, [...(nearListeners.get(type) || []), callback]);
  },
  removeEventListener(type, callback) {
    nearListeners.set(type, (nearListeners.get(type) || []).filter(fn => fn !== callback));
  },
  dispatchEvent(event) {
    for (const callback of nearListeners.get(event.type) || []) callback(event);
  },
};
const nearLocation = {
  latitude: 19.31, longitude: -98.25, captured_at: '2026-11-15T07:00:00Z', source: 'cache',
  owner_uid: 'synthetic-A',
};
runInNewContext(compileTypescriptFixture('src/components/V2NearbyListingsHydrator.tsx'), {
  module: nearModule, exports: nearModule.exports,
  require(name) {
    if (name === 'react') return { useEffect(effect) { nearCleanup = effect(); } };
    if (name === '../lib/nearbyMarketplace') return {
      getCachedApproxLocation: () => nearLocation,
      nearbyGeoCells: () => ['g1:109:81'],
      NEARBY_LOCATION_EVENT: 'tutop:approx-location',
      NEARBY_LOCATION_CLEARED_EVENT: 'tutop:approx-location-cleared',
    };
    if (name === '../services/canonicalListingsBackend') return {
      canonicalListingsBackend: {
        loadNearbyProducts: () => new Promise((resolve, reject) => nearPending.push({ resolve, reject })),
      },
    };
    if (name === '../store/useAppStore') return { useAppStore: nearStore };
    if (name === './V2ListingsHydrator') return {
      V2_LISTINGS_BASE_HYDRATED_EVENT: 'tutop:v2-listings-base-hydrated',
    };
    throw new Error('Unexpected Nearby hydrator dependency: ' + name);
  },
  window: nearWindow, Date, Promise, Set, Map, Number, console,
}, { timeout: 2500 });
nearModule.exports.default();
assert.equal(nearPending.length, 1, 'Nearby should load cached location once');
nearPending[0].resolve([
  { id: 'base', updated_at: '2026-11-15T07:00:00Z', source: 'fresh-nearby' },
  { id: 'near-only', updated_at: '2026-11-15T07:00:00Z' },
]);
await flushRead();
assert.equal(nearState.products.find(x => x.id === 'base')?.source, 'fresh-nearby',
  'fresh Nearby data should win a timestamp tie against a stale local copy');
assert(nearState.products.some(x => x.id === 'near-only'));
nearWindow.dispatchEvent({ type: 'tutop:approx-location', detail: nearLocation });
assert.equal(nearPending.length, 2);
nearPending[1].reject(new Error('SYNTHETIC_QUERY_UNAVAILABLE'));
await flushRead();
// VM-created arrays have a different prototype: copy into the host realm
// before deepStrictEqual so matching IDs do not produce a false regression.
assert.deepEqual(Array.from(nearState.products, x => x.id), ['base'],
  'failed Nearby refresh must not leave injected stale approved listings visible');
// A stale failed request must not remove newer records after another query wins.
nearWindow.dispatchEvent({ type: 'tutop:approx-location', detail: nearLocation });
nearWindow.dispatchEvent({ type: 'tutop:approx-location', detail: nearLocation });
assert.equal(nearPending.length, 4);
nearPending[3].resolve([{ id: 'fresh-near-only', updated_at: '2026-11-15T07:01:00Z' }]);
await flushRead();
nearPending[2].reject(new Error('SYNTHETIC_STALE_REQUEST'));
await flushRead();
assert(nearState.products.some(x => x.id === 'fresh-near-only'),
  'obsolete failed query must not delete latest Nearby results');
// A lightweight owner change may update only user identity while a fresh
// session snapshot is still pending. Old Nearby-only products must disappear
// synchronously; never rely on setUser() to run before every owner transition.
nearWindow.dispatchEvent({ type: 'tutop:approx-location', detail: nearLocation });
assert.equal(nearPending.length, 5, 'synthetic account-switch fixture must start a Nearby request');
nearPending[4].resolve([{ id: 'account-A-near-only', updated_at: '2026-11-15T07:02:00Z' }]);
await flushRead();
assert(nearState.products.some(x => x.id === 'account-A-near-only'),
  'the A-only fixture must appear before switching identity');
nearWindow.dispatchEvent({ type: 'tutop:approx-location', detail: nearLocation });
assert.equal(nearPending.length, 6, 'a second A request must remain pending before logout');
nearStore.setState({ user: { id: 'synthetic-B' } });
assert.deepEqual(Array.from(nearState.products, x => x.id), ['base'],
  'A-only Nearby rows must disappear immediately on owner change');
nearPending[5].resolve([{ id: 'A-late-after-B', updated_at: '2026-11-15T07:03:00Z' }]);
await flushRead();
assert.deepEqual(Array.from(nearState.products, x => x.id), ['base'],
  'in-flight A Nearby results must not hydrate the B session');
nearStore.setState({ user: { id: 'synthetic-A' } });
assert.deepEqual(Array.from(nearState.products, x => x.id), ['base'],
  'A to B to A cannot rehydrate stale Nearby rows without a fresh request');
nearCleanup();
console.log('PASS Nearby stale-injection guard: owner transition immediately evicts Nearby-only data, late responses ignored');

