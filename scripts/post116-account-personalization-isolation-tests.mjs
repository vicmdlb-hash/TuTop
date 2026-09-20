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

const feed = fs.readFileSync('src/components/Feed.tsx', 'utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx', 'utf8');
const tour = fs.readFileSync('src/components/WelcomeTour.tsx', 'utf8');

assert.match(feed, /readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.searchHistory, user\.id, 6\)/);
assert.match(feed, /readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.recentProducts, user\.id, 12\)/);
assert.match(feed, /readAccountLocalList\(ACCOUNT_LOCAL_KEYS\.interests, user\.id, 8\)/);
assert.match(feed, /readAccountLocalJson<Array<Record<string, unknown>>>\(ACCOUNT_LOCAL_KEYS\.savedSearches, user\.id, \[\]\)/);
assert.match(detail, /writeAccountLocalList\([\s\S]*ACCOUNT_LOCAL_KEYS\.recentProducts,[\s\S]*user\.id/);
assert.match(tour, /readAccountLocalText\(ACCOUNT_LOCAL_KEYS\.onboarding, userId\)/);
assert.match(tour, /writeAccountLocalList\(ACCOUNT_LOCAL_KEYS\.interests, userId, interests, 6\)/);

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

console.log('PASS account-local personalization: legacy rejected, A->B isolated, same UID restores only its own state');
