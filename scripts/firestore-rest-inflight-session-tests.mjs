import assert from 'node:assert/strict';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

// Execute the actual TypeScript REST client against synthetic storage, App Check,
// and Firestore responses. No real Firebase, network, credentials or side effects.
const transpile = compileTypescriptFixture;
const sharedGuard = transpile('src/lib/firebaseSharedSessionGuard.ts');
const restClient = transpile('src/services/firebaseRest.ts');
const projectId = 'synthetic-firestore-session-races';
const storageKey = 'tutop.firebase.session.v2.' + projectId;
const makeSession = (uid, epoch) => ({
  uid, idToken: 'synthetic-token-' + epoch, refreshToken: 'synthetic-refresh-' + epoch,
  expiresAt: Date.now() + 600_000, phone: '+520000000000',
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function until(predicate, label) {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  assert(predicate(), 'synthetic await not reached: ' + label);
}
function makeHarness({ appCheckGate = null, bodyGate = null } = {}) {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
  const first = makeSession('A', 'original');
  storage.setItem(storageKey, JSON.stringify(first));
  const requests = [];
  let appCheckStarted = false;
  let bodyStarted = false;
  const firebaseFetch = (url, init) => {
    assert.match(url, /firestore\.googleapis\.com/, 'no auth endpoint expected');
    const call = { url, init, gate: deferred() };
    requests.push(call);
    return call.gate.promise;
  };
  const appCheck = async () => {
    appCheckStarted = true;
    if (appCheckGate) await appCheckGate.promise;
    return null;
  };
  function load(source, imports = {}) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, exports: module.exports,
      require(name) {
        assert(Object.prototype.hasOwnProperty.call(imports, name), 'unexpected module: ' + name);
        return imports[name];
      },
      localStorage: storage, Headers, URLSearchParams, TextEncoder, Date, Promise,
    }, { timeout: 3000 });
    return module.exports;
  }
  const guard = load(sharedGuard);
  const rest = load(restClient, {
    './firebaseHttp': { firebaseFetch, readFirebaseResponseText: async (response) => response.text() },
    './nativeAppCheckToken': { getNativeAppCheckToken: appCheck },
    '../lib/firebaseSharedSessionGuard': guard,
  });
  const clientA = new rest.FirebaseRestClient({ apiKey: 'synthetic-key', projectId });
  function login(uid, epoch) {
    const next = new rest.FirebaseRestClient({ apiKey: 'synthetic-key', projectId });
    next.persistSession(makeSession(uid, epoch));
  }
  function settle(call, data = { name: 'projects/demo/databases/(default)/documents/demo/test', fields: { label: { stringValue: 'safe' } } }) {
    call.gate.resolve({
      ok: true, status: 200,
      text: async () => {
        bodyStarted = true;
        if (bodyGate) await bodyGate.promise;
        return JSON.stringify(data);
      },
    });
  }
  function settleHttpError(call, status) {
    call.gate.resolve({
      ok: false, status,
      text: async () => JSON.stringify({ error: { status: 'NOT_FOUND', message: 'synthetic missing' } }),
    });
  }
  function rejectNetwork(call) { call.gate.reject(new TypeError('synthetic-network-failed')); }
  return {
    clientA, login, settle, settleHttpError, rejectNetwork, requests,
    appCheckStarted: () => appCheckStarted,
    bodyStarted: () => bodyStarted,
    persisted: () => JSON.parse(storage.getItem(storageKey)),
  };
}

// Baseline: unchanged A session successfully decodes the remote result.
{
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/test');
  await until(() => h.requests.length === 1, 'baseline request');
  assert.equal(h.requests[0].init.headers.get('Authorization'), 'Bearer synthetic-token-original');
  h.settle(h.requests[0]);
  const result = await pending;
  assert.equal(result.data.label, 'safe');
  assert.equal(h.persisted().uid, 'A');
}

// Changing A to B during App Check must prevent even dispatching A credentials.
{
  const gate = deferred();
  const h = makeHarness({ appCheckGate: gate });
  const pending = h.clientA.getDocument('demo/test');
  await until(() => h.appCheckStarted(), 'App Check gate');
  h.login('B', 'fresh');
  gate.resolve();
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/);
  assert.equal(h.requests.length, 0, 'A request must not reach Firestore after App Check wait');
  assert.equal(h.persisted().uid, 'B');
}

// A stale response to an already-dispatched request may not populate B's UI.
for (const [name, uid] of [['A-to-B', 'B'], ['A-to-A-new-session', 'A']]) {
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/test');
  await until(() => h.requests.length === 1, name + ' dispatch');
  h.login(uid, 'replacement');
  h.settle(h.requests[0]);
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/, name);
  assert.equal(h.persisted().refreshToken, 'synthetic-refresh-replacement');
}

// Change the session only after HTTP receipt, while response.text() is pending.
{
  const gate = deferred();
  const h = makeHarness({ bodyGate: gate });
  const pending = h.clientA.getDocument('demo/test');
  await until(() => h.requests.length === 1, 'HTTP dispatch');
  h.settle(h.requests[0]);
  await until(() => h.bodyStarted(), 'body parser');
  h.login('B', 'after-http');
  gate.resolve();
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/);
  assert.equal(h.persisted().uid, 'B');
}

// Sign-out during a response must not leak old Firestore data to a guest UI.
{
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/test');
  await until(() => h.requests.length === 1, 'signout dispatch');
  h.clientA.signOut();
  h.settle(h.requests[0]);
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/);
}
// Unchanged A must preserve legitimate 404->null and network failure behavior.
{
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/missing');
  await until(() => h.requests.length === 1, 'unchanged 404');
  h.settleHttpError(h.requests[0], 404);
  assert.equal(await pending, null, 'current session should still return null for real 404');
}
{
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/unreachable');
  await until(() => h.requests.length === 1, 'unchanged network failure');
  h.rejectNetwork(h.requests[0]);
  await assert.rejects(pending, /synthetic-network-failed/);
}

// The old session's 404 must NOT masquerade as B's nonexistent document.
for (const [label, uid] of [['stale404-AtoB', 'B'], ['stale404-AtoA', 'A']]) {
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/missing');
  await until(() => h.requests.length === 1, label);
  h.login(uid, 'fresh');
  h.settleHttpError(h.requests[0], 404);
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/, label);
  assert.equal(h.persisted().refreshToken, 'synthetic-refresh-fresh');
}

// An old account's error path must fail closed even if the network itself rejects.
{
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/error');
  await until(() => h.requests.length === 1, 'stale network reject');
  h.login('B', 'fresh');
  h.rejectNetwork(h.requests[0]);
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/);
  assert.equal(h.persisted().uid, 'B');
}

// A 403 returned from a previous session cannot be mistaken for a new account failure.
{
  const h = makeHarness();
  const pending = h.clientA.getDocument('demo/denied');
  await until(() => h.requests.length === 1, 'stale http 403');
  h.login('B', 'fresh');
  h.settleHttpError(h.requests[0], 403);
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/);
}
console.log('PASS Firestore response/error paths: unchanged 404 and network errors preserve semantics; stale 404 A->B/A->A, 403 and network rejection fail closed');
console.log('PASS real client synthetic A/B in-flight races, no Firebase traffic');
