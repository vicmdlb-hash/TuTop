import assert from 'node:assert/strict';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

// Test the actual native router module with all external dependencies stubbed.
// No Firebase, Capacitor, OS permissions, network calls or user data required.
const compiled = compileTypescriptFixture('src/services/nativeNotificationRouter.ts');
const guardJs = compileTypescriptFixture('src/lib/nativeNotificationSessionGuard.ts');
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
  let authIdentity = initialUid ? { uid: initialUid, refreshToken: 'synthetic-refresh-' + initialUid + '-0' } : null;
  let phoneSessionSerial = 0;
  const state = {
    user: { id: initialUid },
    // Deliberately keep an A-owned stale chat next to B's cache to prove
    // payload recipient_uid alone cannot navigate to the wrong account.
    chats: [
      { id: 'chat-a', comprador_id: 'A', vendedor_id: 'seller' },
      { id: 'chat-b', comprador_id: 'B', vendedor_id: 'seller' },
    ],
    products: [], notifications: [],
    markNotificationRead: (id) => operations.push('read:' + id),
    openChat: (id) => operations.push('chat:' + id),
    setActiveTab: (tab) => operations.push('tab:' + tab),
    openProduct: (id) => operations.push('product:' + id),
    hydrateOnline: (snapshot) => {
      operations.push('hydrate:' + snapshot.user.id);
      state.user = snapshot.user;
      if (Array.isArray(snapshot.chats)) state.chats = snapshot.chats;
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
    './verifiedEmailBetaAuth': { verifiedEmailBetaAuth: {
      sessionGeneration: () => authGeneration,
      readSessionIdentity: () => authIdentity,
    } },
  }, { window });
  const send = (detail) => {
    const listener = listeners.get('tutop:native-notification');
    assert.equal(typeof listener, 'function');
    listener({ detail });
  };
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  const rotateSession = (uid = authIdentity?.uid, verifiedFlow = false) => {
    if (verifiedFlow) authGeneration += 1;
    phoneSessionSerial += 1;
    authIdentity = uid ? { uid, refreshToken: 'synthetic-refresh-' + uid + '-' + phoneSessionSerial } : null;
  };
  return { backend, state, operations, send, flush,
    newSession: () => rotateSession(undefined, true),
    phoneRelogin: () => rotateSession(),
    canonicalSwitch: (uid) => rotateSession(uid),
  };
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

{
  const h = harness('A');
  let resolve;
  h.backend.loadSnapshot = () => new Promise((r) => { resolve = r; });
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'chat-a', notification_id: 'n6' });
  assert.deepEqual(h.operations, ['read:n6', 'chat:chat-a']);
  // Phone-password sign-out/login does not increment verified-email generation.
  h.phoneRelogin();
  resolve({ user: { id: 'A' } });
  await h.flush();
  assert.deepEqual(h.operations, ['read:n6', 'chat:chat-a'], 'old phone-session snapshot cannot hydrate same UID after token rotation');
}
{
  const h = harness('A');
  // Another FirebaseRestClient replaced the canonical session, while the
  // backend and local user cache still point at A. A's intent must be denied.
  h.canonicalSwitch('B');
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'chat-a', notification_id: 'n7' });
  await h.flush();
  assert.deepEqual(h.operations, [], 'cached A identity cannot route after canonical B login');
}


{
  const h = harness('B');
  // A malicious/misrouted B-addressed notification points at A's cached chat.
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-a', notification_id: 'n-cross' });
  await h.flush();
  assert.deepEqual(h.operations, ['read:n-cross', 'tab:inbox', 'hydrate:B', 'tab:inbox'],
    'B cannot navigate into cached A chat even when push recipient is B');
}
{
  const h = harness('B');
  // A legitimate new B chat may arrive before the Inbox snapshot; retry only
  // after hydration has established membership in B's online chat list.
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    chats: [{ id: 'chat-new-b', comprador_id: 'B', vendedor_id: 'seller' }],
  });
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-new-b', notification_id: 'n-new' });
  await h.flush();
  assert.deepEqual(h.operations, ['read:n-new', 'tab:inbox', 'hydrate:B', 'chat:chat-new-b'],
    'cold-chat tap must wait for owner-scoped snapshot before opening');
}
{
  const h = harness('B');
  h.state.chats.push({
    id: 'chat-foreign-transaction', transaction_id: 'tx-foreign',
    comprador_id: 'A', vendedor_id: 'seller',
  });
  h.send({ source: 'action', recipient_uid: 'B', transaction_id: 'tx-foreign' });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'tab:inbox'],
    'foreign transaction target cannot navigate to A-owned chat from B');
}

{
  const h = harness('B');
  // A's cached message notification must not be marked read by a B-addressed
  // push even if the attacker reuses the stale notification identifier.
  h.state.notifications.push({ id: 'A-stale-notice', chat_id: 'chat-a', kind: 'message' });
  h.send({
    source: 'action', recipient_uid: 'B', chat_id: 'chat-a',
    notification_id: 'A-stale-notice',
  });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'tab:inbox'],
    'foreign cached notification cannot mark A chat read while B is signed in');
}
{
  const h = harness('B');
  h.state.notifications.push({ id: 'B-owned-notice', chat_id: 'chat-b', kind: 'message' });
  h.send({
    source: 'action', recipient_uid: 'B', chat_id: 'chat-b',
    notification_id: 'B-owned-notice',
  });
  await h.flush();
  assert.deepEqual(h.operations, ['read:B-owned-notice', 'chat:chat-b', 'hydrate:B'],
    'legitimate B notification must still mark as read and route to B chat');
}

console.log('PASS 16 native notification router integration scenarios with mock Auth/store/snapshots, no Firebase');
