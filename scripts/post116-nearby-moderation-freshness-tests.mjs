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
console.log('PASS base listing refresh: overlapping online event is replayed exactly once; A→B→A stays isolated');
