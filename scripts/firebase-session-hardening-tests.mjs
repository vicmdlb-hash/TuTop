import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const { FirebaseRestClient } = await import('../src/services/firebaseRest.ts');
await import('../src/services/firebaseSessionHardeningBridge.ts');

const config = { apiKey: 'test-api-key', projectId: 'tutop-beta-vicmdlb-1356585881' };
const sessionKey = `tutop.firebase.session.v2.${config.projectId}`;

function seedSession(overrides = {}) {
  localStorage.setItem(sessionKey, JSON.stringify({
    uid: 'uid-a',
    idToken: 'expired-id-token',
    refreshToken: 'refresh-a',
    expiresAt: Date.now() - 10_000,
    phone: '+522461234567',
    ...overrides,
  }));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 1) Several Firestore calls hitting an expired token must share one refresh request.
localStorage.clear();
seedSession();
let refreshCalls = 0;
globalThis.fetch = async (url) => {
  assert.match(String(url), /securetoken\.googleapis\.com/);
  refreshCalls += 1;
  await new Promise((resolve) => setTimeout(resolve, 15));
  return jsonResponse({ id_token: 'fresh-id-token', refresh_token: 'refresh-b', user_id: 'uid-a', expires_in: '3600' });
};
const concurrentClient = new FirebaseRestClient(config);
const tokens = await Promise.all(Array.from({ length: 6 }, () => concurrentClient.getIdToken()));
assert.deepEqual(new Set(tokens), new Set(['fresh-id-token']));
assert.equal(refreshCalls, 1, 'expired session caused a refresh storm');
assert.equal(concurrentClient.currentSession?.refreshToken, 'refresh-b');

// 2) Signing out while refresh is in flight must never resurrect the previous session.
localStorage.clear();
seedSession();
let releaseRefresh;
const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
globalThis.fetch = async () => {
  await refreshGate;
  return jsonResponse({ id_token: 'late-id-token', refresh_token: 'late-refresh', user_id: 'uid-a', expires_in: '3600' });
};
const signoutClient = new FirebaseRestClient(config);
const lateRefresh = signoutClient.getIdToken();
await Promise.resolve();
signoutClient.signOut();
releaseRefresh();
await assert.rejects(lateRefresh, /AUTH_SESSION_CHANGED/);
assert.equal(signoutClient.currentSession, null);
assert.equal(localStorage.getItem(sessionKey), null, 'late refresh resurrected signed-out local session');

// 3) Terminal refresh failures clear unusable credentials so the UI cannot remain in ghost-auth state.
localStorage.clear();
seedSession();
globalThis.fetch = async () => jsonResponse({ error: { message: 'INVALID_REFRESH_TOKEN' } }, 400);
const terminalClient = new FirebaseRestClient(config);
await assert.rejects(terminalClient.getIdToken(), /INVALID_REFRESH_TOKEN/);
assert.equal(terminalClient.currentSession, null);
assert.equal(localStorage.getItem(sessionKey), null);

// 4) A transient network failure must preserve the session so reconnect can retry.
localStorage.clear();
seedSession();
globalThis.fetch = async () => { throw new TypeError('network offline'); };
const transientClient = new FirebaseRestClient(config);
await assert.rejects(transientClient.getIdToken(), /network offline/);
assert.equal(transientClient.currentSession?.uid, 'uid-a');
assert.equal(localStorage.getItem(sessionKey) !== null, true);

console.log('PASS expired-token refresh is single-flight');
console.log('PASS sign-out cannot be undone by a late refresh response');
console.log('PASS terminal refresh failure clears ghost session');
console.log('PASS transient offline failure preserves retryable session');
console.log('Firebase session hardening tests: PASS');
