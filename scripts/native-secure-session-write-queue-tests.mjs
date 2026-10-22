import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = (path) => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const queueJs = compile('src/lib/nativeSessionWriteQueue.ts');
const bridgeJs = compile('src/services/nativeSecureSessionBridge.ts');

function harness(native = true) {
  const key = 'tutop.firebase.session.v2.synthetic';
  const local = new Map();
  const volatile = new Map();
  const requests = [];
  let encrypted = null;
  const localStorage = {
    getItem: (k) => local.get(k) ?? null,
    setItem: (k, v) => local.set(k, v),
    removeItem: (k) => local.delete(k),
  };
  const sessionStorage = {
    getItem: (k) => volatile.get(k) ?? null,
    setItem: (k, v) => volatile.set(k, v),
    removeItem: (k) => volatile.delete(k),
  };
  const tombstone = () => localStorage.getItem('signed-out:' + key) === '1';
  const exportsFor = (code, mocks = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module, exports: module.exports, Promise, Map, JSON,
      require(id) {
        if (!Object.prototype.hasOwnProperty.call(mocks, id)) throw Error('Unexpected dependency: ' + id);
        return mocks[id];
      },
      localStorage, sessionStorage,
    }, { timeout: 1500 });
    return module.exports;
  };
  class Client {
    constructor() { this.sessionStorageKey = key; this.session = null; }
    readStoredSession() { return null; }
    persistSession(value) { this.session = value; }
  }
  const queue = exportsFor(queueJs);
  exportsFor(bridgeJs, {
    '../lib/nativeSessionWriteQueue': queue,
    './firebaseRest': { FirebaseRestClient: Client },
    './nativeSecureSession': {
      isNativeSecureSessionRuntime: () => native,
      markNativeSignedOut: (_key, flag) => {
        if (flag) localStorage.setItem('signed-out:' + key, '1');
        else localStorage.removeItem('signed-out:' + key);
      },
      volatileSessionStorage: () => sessionStorage,
      persistNativeSessionRaw: (_key, raw) => new Promise((resolve, reject) => {
        requests.push({
          raw,
          complete() { encrypted = raw; resolve(); },
          fail() { reject(new Error('NATIVE_WRITE_FAILED')); },
        });
      }),
    },
  });
  const drain = async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); };
  async function requestCount(n) {
    for (let i = 0; i < 90 && requests.length < n; i += 1) await Promise.resolve();
    assert.equal(requests.length, n, 'expected exact number of native write operations');
  }
  return { client: new Client(), requests, drain, requestCount, tombstone,
    getEncrypted: () => encrypted, getVolatile: () => sessionStorage.getItem(key) };
}
const account = (uid, nonce) => ({ uid, idToken: 'synthetic-id-' + nonce, refreshToken: 'synthetic-refresh-' + nonce });

{
  const h = harness();
  h.client.persistSession(account('A', 'old'));
  h.client.persistSession(account('B', 'new'));
  await h.requestCount(1); // superseded A should be skipped
  assert.equal(JSON.parse(h.requests[0].raw).uid, 'B');
  assert.equal(h.tombstone(), true, 'cold-start restore must be blocked while B is uncommitted');
  h.requests[0].complete(); await h.drain();
  assert.equal(JSON.parse(h.getEncrypted()).uid, 'B');
  assert.equal(h.tombstone(), false, 'only current committed B is restorable');
}
{
  const h = harness();
  h.client.persistSession(account('A', 'old'));
  await h.requestCount(1);
  h.client.persistSession(account('B', 'new'));
  assert.equal(h.requests.length, 1, 'B must queue behind unfinished native set(A)');
  assert.equal(h.tombstone(), true);
  h.requests[0].complete(); await h.requestCount(2);
  assert.equal(h.tombstone(), true, 'stale A completion must not remove B tombstone');
  h.requests[1].complete(); await h.drain();
  assert.equal(JSON.parse(h.getEncrypted()).uid, 'B');
  assert.equal(h.tombstone(), false);
}
{
  const h = harness();
  h.client.persistSession(account('A', 'old'));
  await h.requestCount(1);
  h.client.persistSession(null);
  assert.equal(h.tombstone(), true);
  h.requests[0].complete(); await h.requestCount(2);
  assert.equal(h.tombstone(), true);
  assert.equal(h.requests[1].raw, null, 'signout removes native credentials');
  h.requests[1].complete(); await h.drain();
  assert.equal(h.getEncrypted(), null);
  assert.equal(h.tombstone(), true, 'signout stays fail-closed after removal');
}
{
  const h = harness();
  h.client.persistSession(account('A', 'old'));
  await h.requestCount(1);
  h.client.persistSession(null);
  h.client.persistSession(account('B', 'new'));
  h.requests[0].complete(); await h.requestCount(2);
  assert.equal(JSON.parse(h.requests[1].raw).uid, 'B', 'obsolete removal skipped after B login');
  assert.equal(h.tombstone(), true);
  h.requests[1].complete(); await h.drain();
  assert.equal(JSON.parse(h.getEncrypted()).uid, 'B');
  assert.equal(h.tombstone(), false);
}
{
  const h = harness();
  h.client.persistSession(account('B', 'new'));
  await h.requestCount(1);
  h.requests[0].fail(); await h.drain();
  assert.equal(h.tombstone(), true, 'failed encrypted write must never allow restoring older owner');
  assert.equal(JSON.parse(h.getVolatile()).uid, 'B', 'active process may retain B in volatile storage');
}
{
  const h = harness();
  h.client.persistSession(account('A', 'old'));
  h.client.persistSession(account('A', 'relogin'));
  await h.requestCount(1);
  assert.equal(JSON.parse(h.requests[0].raw).refreshToken, 'synthetic-refresh-relogin');
  h.requests[0].complete(); await h.drain();
  assert.equal(JSON.parse(h.getEncrypted()).refreshToken, 'synthetic-refresh-relogin');
}
{
  const h = harness(false);
  h.client.persistSession(account('W', 'web'));
  assert.equal(h.client.session.uid, 'W');
  assert.equal(h.requests.length, 0, 'native Keystore must not be invoked on web');
}

console.log('PASS 7 synthetic native secure-session write-order/tombstone regressions; no plugin or Firebase calls');
