import assert from 'node:assert/strict';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

const compile = compileTypescriptFixture;
const queueJs = compile('src/lib/nativeSessionWriteQueue.ts');
const bridgeJs = compile('src/services/nativeSecureSessionBridge.ts');
const nativeSecureJs = compile('src/services/nativeSecureSession.ts');

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
      parseValidNativeAuthSession: exportsFor(nativeSecureJs).parseValidNativeAuthSession,
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
const account = (uid, nonce) => ({ uid, idToken: 'synthetic-id-' + nonce, refreshToken: 'synthetic-refresh-' + nonce, expiresAt: 0, phone: '+520000000000' });

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

// Android restore must enforce the same structural checks as the browser's
// FirebaseRestClient localStorage reader. Only synthetic process-memory values
// are used here; this test never touches Android, Keystore or Firebase.
const validNative = harness();
validNative.client.persistSession(account('A', 'valid'));
assert.equal(validNative.client.readStoredSession()?.uid, 'A');
const noOptionalPhone = harness();
const { phone: _optionalPhone, ...phoneOmitted } = account('A', 'no-phone');
noOptionalPhone.client.persistSession(phoneOmitted);
assert.equal(noOptionalPhone.client.readStoredSession()?.uid, 'A');

for (const malformed of [
  { ...account('A', 'bad'), uid: {} },
  { ...account('A', 'bad'), uid: ' A ' },
  { ...account('A', 'bad'), uid: 'A'.repeat(257) },
  { ...account('A', 'bad'), idToken: {} },
  { ...account('A', 'bad'), idToken: '' },
  { ...account('A', 'bad'), idToken: 'x'.repeat(16385) },
  { ...account('A', 'bad'), refreshToken: ['synthetic-refresh'] },
  { ...account('A', 'bad'), refreshToken: '' },
  { ...account('A', 'bad'), refreshToken: 'x'.repeat(16385) },
  { ...account('A', 'bad'), expiresAt: '0' },
  { ...account('A', 'bad'), expiresAt: -1 },
  { ...account('A', 'bad'), expiresAt: Number.NaN },
  { ...account('A', 'bad'), phone: {} },
]) {
  const h = harness();
  h.client.persistSession(malformed);
  assert.equal(h.client.readStoredSession(), null,
    'malformed Android secure session must never be restored as authenticated');
}

async function bootstrapCase({ encryptedRaw = null, legacyRaw = null } = {}) {
  const key = 'tutop.firebase.session.v2.synthetic-project';
  const mem = new Map(legacyRaw === null ? [] : [['tutop.firebase.session.v1', legacyRaw]]);
  const volatile = new Map();
  const writes = [];
  let encrypted = encryptedRaw;
  const storage = (map) => ({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });
  const localStorage = storage(mem);
  const sessionStorage = storage(volatile);
  const securePlugin = {
    get: async () => ({ value: encrypted }),
    set: async ({ key: writtenKey, value }) => {
      assert.equal(writtenKey, key);
      writes.push(value);
      encrypted = value;
    },
    remove: async () => { encrypted = null; },
  };
  const window = {
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: () => securePlugin,
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(nativeSecureJs, {
    module, exports: module.exports, window, localStorage, sessionStorage,
    JSON, Promise, Map, Number, Error,
  }, { timeout: 1500 });
  const result = await module.exports.restoreNativeSessionForProject('synthetic-project');
  return { result, encrypted, writes, migratedVolatile: volatile.get(key),
    legacy: mem.get('tutop.firebase.session.v1') };
}

const cleanRaw = JSON.stringify(account('A', 'bootstrap-valid'));
const corruptRaw = JSON.stringify({ ...account('A', 'bootstrap-invalid'), refreshToken: {} });
const fromKeystore = await bootstrapCase({ encryptedRaw: cleanRaw });
assert.equal(fromKeystore.result.restored, true);
assert.equal(fromKeystore.result.migrated, false);
assert.equal(fromKeystore.migratedVolatile, cleanRaw);
assert.equal(fromKeystore.writes.length, 0);

const corruptedKeystore = await bootstrapCase({ encryptedRaw: corruptRaw, legacyRaw: cleanRaw });
assert.equal(corruptedKeystore.result.restored, false,
  'corrupt secure-store identity must not claim restored or fall back to legacy account');
assert.equal(corruptedKeystore.migratedVolatile, undefined);
assert.equal(corruptedKeystore.encrypted, corruptRaw,
  'corrupt encrypted evidence remains retained, not silently erased');
assert.equal(corruptedKeystore.writes.length, 0,
  'corrupt encrypted identity must never trigger legacy overwrite');
assert.equal(corruptedKeystore.legacy, cleanRaw,
  'legacy evidence is not deleted when restore cannot trust the source');

const validLegacy = await bootstrapCase({ legacyRaw: cleanRaw });
assert.equal(validLegacy.result.restored, true);
assert.equal(validLegacy.result.migrated, true);
assert.equal(validLegacy.encrypted, cleanRaw);
assert.equal(validLegacy.legacy, undefined, 'valid legacy is migrated once, not left as cleartext');

const malformedLegacy = await bootstrapCase({ legacyRaw: corruptRaw });
assert.equal(malformedLegacy.result.restored, false);
assert.equal(malformedLegacy.result.migrated, false);
assert.equal(malformedLegacy.writes.length, 0, 'malformed legacy must not enter Keystore');
assert.equal(malformedLegacy.legacy, corruptRaw, 'corrupt legacy evidence preserved');
console.log('PASS Android bootstrap restored/migrated only valid synthetic sessions; corrupt encrypted/legacy records fail closed');

console.log('PASS 13 malformed Android secure-session restore fixtures rejected; valid sessions retain functionality');

console.log('PASS 7 synthetic native secure-session write-order/tombstone regressions; no plugin or Firebase calls');
