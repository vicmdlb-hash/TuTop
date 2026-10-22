import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Test the actual native router module with all external dependencies stubbed.
// No Firebase, Capacitor, OS permissions, network calls or user data required.
const source = fs.readFileSync('src/services/nativeNotificationRouter.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'nativeNotificationRouter.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const guardSource = fs.readFileSync('src/lib/nativeNotificationSessionGuard.ts', 'utf8');
const guardJs = ts.transpileModule(guardSource, {
  fileName: 'nativeNotificationSessionGuard.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function evaluate(js, mocks, context = {}) {
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: (id) => {
      if (!Object.prototype.hasOwnProperty.call(mocks, id)) throw new Error('Unexpected dependency: ' + id);
      return mocks[id];
    },
    ...context,
  }, { timeout: 1000 });
  return module.exports;
}
const guard = evaluate(guardJs, {});

function harness(initialUid = 'B') {
  const listeners = new Map();
  const operations = [];
  let authGeneration = 0;
  const state = {
    user: { id: initialUid }, chats: [], products: [],
    markNotificationRead: (id) => operations.push('read:' + id),
    openChat: (id) => operations.push('chat:' + id),
    setActiveTab: (tab) => operations.push('tab:' + tab),
    openProduct: (id) => operations.push('product:' + id),
    hydrateOnline: (snapshot) => {
      operations.push('hydrate:' + snapshot.user.id);
      state.user = snapshot.user;
    },
  };
  const store = { getState: () => state };
  const backend = {
    ready: true,
    session: initialUid ? { uid: initialUid } : null,
    async loadSnapshot() { return { user: { id: this.session?.uid || 'NOT_AUTH' } }; },
  };
  const window = { addEventListener: (event, fn) => listeners.set(event, fn) };
  evaluate(compiled, {
    '../store/useAppStore': { useAppStore: store },
    '../lib/nativeNotificationSessionGuard': guard,
    './nativeFirebaseSecurity': { NATIVE_NOTIFICATION_EVENT: 'tutop:native-notification' },
    './nationalBackend': { nationalSchemaEnabled: () => true },
    './onlineBackend': { onlineBackend: backend },
    './verifiedEmailBetaAuth': { verifiedEmailBetaAuth: { sessionGeneration: () => authGeneration } },
  }, { window });
  const send = (detail) => {
    const listener = listeners.get('tutop:native-notification');
    assert.equal(typeof listener, 'function');
    listener({ detail });
  };
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  return { backend, state, operations, send, flush, newSession: () => { authGeneration += 1; } };
}

{
  const h = harness('B');
  h.send({ source: 'action', chat_id: 'a-chat', recipient_uid: undefined, notification_id: 'n1' });
  await h.flush();
  assert.deepEqual(h.operations, [], 'missing recipient cannot mutate read/navigation/hydration');
}
{
  const h = harness('B');
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'a-chat', notification_id: 'n2' });
  await h.flush();
  assert.deepEqual(h.operations, [], 'A payload cannot enter account B');
}
{
  const h = harness('B');
  h.backend.session = null;
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-b' });
  await h.flush();
  assert.deepEqual(h.operations, [], 'stale B store without Auth must not route');
}
{
  const h = harness('B');
  h.state.user.id = 'A';
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-b' });
  await h.flush();
  assert.deepEqual(h.operations, [], 'B Auth with stale A store must not route');
}
{
  const h = harness('B');
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-b', notification_id: 'n3' });
  await h.flush();
  assert.deepEqual(h.operations, ['read:n3', 'chat:chat-b', 'hydrate:B']);
}
{
  const h = harness('A');
  let resolve;
  h.backend.loadSnapshot = () => new Promise((r) => { resolve = r; });
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'chat-a', notification_id: 'n4' });
  assert.deepEqual(h.operations, ['read:n4', 'chat:chat-a']);
  h.backend.session = { uid: 'B' };
  h.state.user.id = 'B';
  resolve({ user: { id: 'A' } });
  await h.flush();
  assert.deepEqual(h.operations, ['read:n4', 'chat:chat-a'], 'late A snapshot cannot hydrate B');
}
{
  const h = harness('B');
  h.backend.loadSnapshot = async () => ({ user: { id: 'A' } });
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-b' });
  await h.flush();
  assert.deepEqual(h.operations, ['chat:chat-b'], 'snapshot for wrong UID must be discarded');
}
{
  const h = harness('B');
  h.backend.loadSnapshot = async () => ({ user: { id: 'B' } });
  h.send({ source: 'action', recipient_uid: 'B', transaction_id: 'tx-b' });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'tab:inbox'], 'cold-store fallback and retry must remain scoped');
}


{
  const h = harness('A');
  let resolve;
  h.backend.loadSnapshot = () => new Promise((r) => { resolve = r; });
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'chat-a', notification_id: 'n5' });
  assert.deepEqual(h.operations, ['read:n5', 'chat:chat-a']);
  // A logs out and authenticates again as A before an old request finishes.
  // UID matching alone would erroneously hydrate the obsolete snapshot.
  h.newSession();
  h.backend.session = { uid: 'A' };
  h.state.user.id = 'A';
  resolve({ user: { id: 'A' } });
  await h.flush();
  assert.deepEqual(h.operations, ['read:n5', 'chat:chat-a'], 'same-UID reauthentication must invalidate prior snapshot');
}

console.log('PASS 9 native notification router integration scenarios with mock Auth/store/snapshots, no Firebase');
