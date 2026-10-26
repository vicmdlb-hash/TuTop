import assert from 'node:assert/strict';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

// This suite loads the REAL REST client, lifecycle and bridge modules in a
// synthetic web runtime. No Firebase backend, account, token, or network access.
const transpile = compileTypescriptFixture;

const guardSource = transpile('src/lib/firebaseSharedSessionGuard.ts');
const lifecycleSource = transpile('src/lib/firebaseSessionLifecycle.ts');
const restSource = transpile('src/services/firebaseRest.ts');
const bridgeSource = transpile('src/services/firebaseSessionHardeningBridge.ts');
const projectId = 'demo-auth-isolation';
const key = 'tutop.firebase.session.v2.' + projectId;
const session = (uid, identity) => ({
  uid, idToken: 'synthetic-id-' + identity,
  refreshToken: 'synthetic-refresh-' + identity,
  expiresAt: 0, phone: '+520000000000',
});

function makeHarness(initial = session('A', 'old')) {
  const map = new Map();
  const writes = [];
  const localStorage = {
    getItem(k) { return map.get(k) ?? null; },
    setItem(k, v) { map.set(k, v); writes.push({ op: 'set', key: k }); },
    removeItem(k) { map.delete(k); writes.push({ op: 'remove', key: k }); },
  };
  if (initial) localStorage.setItem(key, JSON.stringify(initial));
  const requests = [];
  const firebaseFetch = (url) => {
    assert.match(url, /securetoken.googleapis.com/, 'only mock secure-token endpoint is allowed');
    return new Promise((resolve) => requests.push({ resolve }));
  };
  const exportsFor = (source, mocks = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, exports: module.exports,
      require(id) {
        if (!Object.prototype.hasOwnProperty.call(mocks, id)) throw new Error('Unexpected import: ' + id);
        return mocks[id];
      },
      localStorage, URLSearchParams, TextEncoder, Date, Promise,
    }, { timeout: 2000 });
    return module.exports;
  };
  const guard = exportsFor(guardSource);
  const lifecycle = exportsFor(lifecycleSource);
  const rest = exportsFor(restSource, {
    './firebaseHttp': { firebaseFetch },
    './nativeAppCheckToken': { getNativeAppCheckToken: async () => null },
    '../lib/firebaseSharedSessionGuard': guard,
  });
  exportsFor(bridgeSource, {
    '../lib/firebaseSessionLifecycle': lifecycle,
    '../lib/firebaseSharedSessionGuard': guard,
    './firebaseRest': rest,
  });
  function readPersisted() {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }
  function client() {
    return new rest.FirebaseRestClient({ apiKey: 'synthetic-no-real-key', projectId });
  }
  function writeNew(value) {
    const newest = client();
    newest.persistSession(value);
    return newest;
  }
  async function waitForRequest(index = 0) {
    for (let i = 0; i < 30 && requests.length <= index; i += 1) await Promise.resolve();
    assert.ok(requests[index], 'mock refresh never started');
    return requests[index];
  }
  function settle(request, owner = 'A', token = 'new') {
    request.resolve({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        user_id: owner,
        id_token: 'synthetic-id-' + token,
        refresh_token: 'synthetic-refresh-' + token,
        expires_in: '3600',
      }),
    });
  }
  function reject(request, message = 'INVALID_REFRESH_TOKEN') {
    request.resolve({
      ok: false, status: 400,
      text: async () => JSON.stringify({ error: { message } }),
    });
  }
  return { client, writeNew, waitForRequest, settle, reject, readPersisted, writes };
}

{
  const h = makeHarness();
  const oldA = h.client();
  const p = oldA.getIdToken();
  const pending = await h.waitForRequest();
  oldA.signOut();
  h.writeNew(session('B', 'fresh'));
  h.settle(pending);
  await assert.rejects(p, /AUTH_SESSION_CHANGED/);
  assert.equal(h.readPersisted()?.uid, 'B', 'old A refresh must never erase B login');
  assert.equal(h.readPersisted()?.refreshToken, 'synthetic-refresh-fresh');
}
{
  const h = makeHarness();
  const oldA = h.client();
  const p = oldA.getIdToken();
  const pending = await h.waitForRequest();
  oldA.signOut();
  h.writeNew(session('A', 'relogin'));
  h.settle(pending);
  await assert.rejects(p, /AUTH_SESSION_CHANGED/);
  assert.equal(h.readPersisted()?.refreshToken, 'synthetic-refresh-relogin', 'same UID with new login is different session');
}
{
  const h = makeHarness();
  const oldA = h.client();
  h.writeNew(session('B', 'fresh'));
  oldA.signOut();
  assert.equal(h.readPersisted()?.uid, 'B', 'stale client signOut must not erase B');
}
{
  const h = makeHarness();
  const oldA = h.client();
  const p = oldA.getIdToken();
  const pending = await h.waitForRequest();
  h.writeNew(session('B', 'fresh'));
  h.reject(pending);
  await assert.rejects(p, /INVALID_REFRESH_TOKEN/);
  assert.equal(h.readPersisted()?.uid, 'B', 'old A terminal refresh failure must not clear B');
}
{
  const h = makeHarness();
  const validA = h.client();
  const p = validA.getIdToken();
  const pending = await h.waitForRequest();
  h.settle(pending, 'A', 'refreshed');
  assert.equal(await p, 'synthetic-id-refreshed');
  assert.equal(h.readPersisted()?.uid, 'A');
  assert.equal(h.readPersisted()?.refreshToken, 'synthetic-refresh-refreshed', 'legitimate refresh must still persist');
}
{
  const h = makeHarness();
  const oldA = h.client();
  h.writeNew(session('B', 'fresh'));
  await assert.rejects(oldA.getIdToken(), /AUTH_SESSION_CHANGED/, 'cached token must not pass for stale client');
  assert.equal(h.readPersisted()?.uid, 'B');
}
{
  const h = makeHarness();
  const oldA = h.client();
  const p = oldA.getIdToken();
  const pending = await h.waitForRequest();
  h.writeNew(session('B', 'fresh'));
  h.settle(pending);
  await assert.rejects(p, /AUTH_SESSION_CHANGED/, 'new B login without old explicit signOut must still win');
  assert.equal(h.readPersisted()?.uid, 'B');
}

console.log('PASS 7 synthetic cross-client shared-session scenarios using actual FirebaseRestClient/lifecycle/bridge; no Firebase traffic');
