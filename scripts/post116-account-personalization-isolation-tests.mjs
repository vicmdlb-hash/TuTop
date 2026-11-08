import assert from 'node:assert/strict';
import fs from 'node:fs';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
  clear() { this.#data.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const {
  ACCOUNT_LOCAL_KEYS,
  accountLocalKey,
  readAccountLocalJson,
  readAccountLocalList,
  readAccountLocalText,
  writeAccountLocalJson,
  writeAccountLocalList,
  writeAccountLocalText,
} = await import('../src/lib/accountLocalState.ts');

const app = fs.readFileSync('src/App.tsx', 'utf8');
const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx', 'utf8');
const tour = fs.readFileSync('src/components/WelcomeTour.tsx', 'utf8');

// A mounted Feed keeps React state until effects run; a UID key prevents first-paint leakage.
assert.match(app, /feed:\s*<Feed key=\{user\.id\}\s*\/>/, 'Feed must remount immediately on account change');
assert.match(feed, /readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.searchHistory, user\.id, 6\)/);
assert.match(feed, /readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.recentProducts, user\.id, 12\)/);
assert.match(feed, /readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.interests, user\.id, 8\)/);
assert.match(feed, /readAccountLocalJson<Array<Record<string, unknown>>>\(ACCOUNT_LOCAL_KEYS\.savedSearches, user\.id, \[\]\)/);
assert.match(detail, /writeAccountLocalList\([\s\S]*ACCOUNT_LOCAL_KEYS\.recentProducts,[\s\S]*user\.id/);
assert.match(tour, /readAccountLocalText\(ACCOUNT_LOCAL_KEYS\.onboarding, userId\)/);
assert.match(tour, /writeAccountLocalList\(ACCOUNT_LOCAL_KEYS\.interests, userId, interests, 6\)/);
// A and B must never reuse onboarding/interests React state after account switch.
assert.match(tour, /function WelcomeTourForUser\(\{ userId \}: \{ userId: string \}\)/);
assert.match(tour, /if \(!userId\) return null;/);
assert.match(tour, /return <WelcomeTourForUser key=\{userId\} userId=\{userId\} \/>/);

assert.doesNotMatch(feed, /localStorage\.getItem\(['"]tutop\.search-history\.v1/);
assert.doesNotMatch(detail, /localStorage\.getItem\(['"]tutop\.recent-products\.v1/);
assert.doesNotMatch(tour, /localStorage\.(getItem|setItem)\(['"]tutop\.(onboarding|interests)\.v1/);

localStorage.setItem(ACCOUNT_LOCAL_KEYS.searchHistory, JSON.stringify(['legacy-private-query']));
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'alice', 6), []);
assert.equal(localStorage.getItem(ACCOUNT_LOCAL_KEYS.searchHistory), null, 'legacy unscoped history must be discarded, not inherited');

writeAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'alice', ['visa appointment', 'camera'], 6);
writeAccountLocalList(ACCOUNT_LOCAL_KEYS.recentProducts, 'alice', ['listing-a'], 12);
writeAccountLocalList(ACCOUNT_LOCAL_KEYS.interests, 'alice', ['Electrónica'], 6);
writeAccountLocalText(ACCOUNT_LOCAL_KEYS.onboarding, 'alice', 'done');
writeAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'alice', [{ id: 'saved-a', query: 'laptop' }]);

assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'bob', 6), []);
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.recentProducts, 'bob', 12), []);
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.interests, 'bob', 6), []);
assert.equal(readAccountLocalText(ACCOUNT_LOCAL_KEYS.onboarding, 'bob'), null);
assert.deepEqual(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob', []), []);

writeAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'bob', ['bike'], 6);
writeAccountLocalText(ACCOUNT_LOCAL_KEYS.onboarding, 'bob', 'done');

assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'alice', 6), ['visa appointment', 'camera']);
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.recentProducts, 'alice', 12), ['listing-a']);
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.interests, 'alice', 6), ['Electrónica']);
assert.equal(readAccountLocalText(ACCOUNT_LOCAL_KEYS.onboarding, 'alice'), 'done');
assert.deepEqual(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'alice', []), [{ id: 'saved-a', query: 'laptop' }]);
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'bob', 6), ['bike']);

assert.notEqual(accountLocalKey(ACCOUNT_LOCAL_KEYS.searchHistory, 'alice'), accountLocalKey(ACCOUNT_LOCAL_KEYS.searchHistory, 'bob'));
assert.equal(accountLocalKey(ACCOUNT_LOCAL_KEYS.searchHistory, ''), null);

// Valid JSON with an unexpected structure is not a valid saved-search array.
const malformedKey = accountLocalKey(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob');
for (const malformed of ['{}', 'null', '"wrong-shape"', '17']) {
  localStorage.setItem(malformedKey, malformed);
  assert.deepEqual(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob', []), [],
    'malformed per-owner JSON must fail closed without reaching Feed spread');
}
assert.equal(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'alice', [])[0].id, 'saved-a',
  'rejecting B malformed state must preserve A owned state');


// Defend against invalid runtime session identity values from untyped bridges.
// Never stringify malformed owners to a shared fallback storage partition.
for (const invalidOwner of [
  null, undefined, {}, [], ['alice'], 0, false, ' ', 'bad/name',
  'a'.repeat(161), 'account with spaces',
]) {
  assert.equal(accountLocalKey(ACCOUNT_LOCAL_KEYS.searchHistory, invalidOwner), null);
  writeAccountLocalText(ACCOUNT_LOCAL_KEYS.searchHistory, invalidOwner, 'PRIVATE_CROSS_ACCOUNT');
  assert.equal(readAccountLocalText(ACCOUNT_LOCAL_KEYS.searchHistory, invalidOwner), null);
}
assert.equal(localStorage.getItem(ACCOUNT_LOCAL_KEYS.searchHistory + ':uid:%5Bobject%20Object%5D'), null,
  'coerced malformed owner must never create a shared key');

// Malformed list limits and unexpected account cache formats fail closed.
for (const invalidMax of [-1, 101, NaN, Infinity, 1.5, '12']) {
  assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'alice', invalidMax), []);
  writeAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'bob', ['leak'], invalidMax);
}
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'bob', 3), ['bike'],
  'invalid limit must not overwrite a valid owner list');
const prefsKey = accountLocalKey(ACCOUNT_LOCAL_KEYS.onboarding, 'bob');
for (const [payload, fallback] of [
  ['"true"', false], ['"3"', 3], ['"false"', true],
  ['false', 3], ['null', 'unset'], ['{}', null],
]) {
  localStorage.setItem(prefsKey, payload);
  assert.deepEqual(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.onboarding, 'bob', fallback), fallback);
}
assert.deepEqual(readAccountLocalList(ACCOUNT_LOCAL_KEYS.searchHistory, 'alice', 6),
  ['visa appointment', 'camera'], 'B malformed data must not affect A owned history');


// Untrusted offline saved searches must never carry arbitrary keys into the
// next user's or the same user's persisted cache.
const bobSavedKey = accountLocalKey(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob');
localStorage.setItem(bobSavedKey, JSON.stringify([
  null, 17, { query: '  ' },
  { id: 'local-1', query: 'textbook', visibility_scope: 'campus',
    notifications_enabled: true, raw_fcm_token: 'synthetic-private-token',
    account_owner_secret: 'synthetic-private-account' },
  { query: 'calculator', max_price_mxn: -3, visibility_scope: 'forged',
    created_at: '2026-11-08T13:00:00.000Z', unknown: 'synthetic-secret' },
]));
assert.deepEqual(
  readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob', []),
  [
    { query: 'textbook', id: 'local-1', visibility_scope: 'campus',
      notifications_enabled: true },
    { query: 'calculator', created_at: '2026-11-08T13:00:00.000Z' },
  ],
  'malformed/unknown saved-search fields must be stripped without losing valid searches',
);
writeAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob', [
  { id: 'local-2', query: 'desk', visibility_scope: 'city',
    raw_auth_token: 'synthetic-private-auth', notifications_enabled: true },
]);
assert.deepEqual(JSON.parse(localStorage.getItem(bobSavedKey)), [
  { query: 'desk', id: 'local-2', visibility_scope: 'city',
    notifications_enabled: true },
], 'saved-search writes must whitelist fields BEFORE storage');
const validBobBefore = localStorage.getItem(bobSavedKey);
writeAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob', null);
assert.equal(localStorage.getItem(bobSavedKey), validBobBefore,
  'invalid saved-search write must not erase owner data');
localStorage.setItem(bobSavedKey, 'x'.repeat(65 * 1024));
assert.deepEqual(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'bob', []), [],
  'overlarge saved-search cache must fail closed');
assert.deepEqual(readAccountLocalJson(ACCOUNT_LOCAL_KEYS.savedSearches, 'alice', []),
  [{ query: 'laptop', id: 'saved-a' }],
  'corrupt B saved searches must never alter A cached searches');

console.log('PASS account-local personalization: legacy rejected, A->B isolated, same UID restores only its own state');
