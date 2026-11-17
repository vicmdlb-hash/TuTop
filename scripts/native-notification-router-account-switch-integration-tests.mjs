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
    products: [], notifications: [], selectedProductId: null,
    markNotificationRead: (id) => operations.push('read:' + id),
    openChat: (id) => operations.push('chat:' + id),
    setActiveTab: (tab) => operations.push('tab:' + tab),
    openProduct: (id) => {
      const product = state.products.find(item => item.id === id);
      state.selectedProductId = product && product.estado === 'Activo'
        && product.moderation_status === 'approved' ? id : null;
      if (state.selectedProductId) operations.push('product:' + id);
    },
    hydrateOnline: (snapshot) => {
      operations.push('hydrate:' + snapshot.user.id);
      state.user = snapshot.user;
      if (Array.isArray(snapshot.chats)) state.chats = snapshot.chats;
      if (Array.isArray(snapshot.products)) {
        state.products = snapshot.products;
        if (!state.products.some(product => product.id === state.selectedProductId
            && product.estado === 'Activo' && product.moderation_status === 'approved')) {
          state.selectedProductId = null;
        }
      }
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
  assert.deepEqual(h.operations, ['chat:chat-b', 'hydrate:B']);
}
{
  const h = harness('A');
  let resolve;
  h.backend.loadSnapshot = () => new Promise((r) => { resolve = r; });
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'chat-a', notification_id: 'n4' });
  assert.deepEqual(h.operations, ['chat:chat-a']);
  h.backend.session = { uid: 'B' };
  h.state.user.id = 'B';
  resolve({ user: { id: 'A' } });
  await h.flush();
  assert.deepEqual(h.operations, ['chat:chat-a'], 'late A snapshot cannot hydrate B');
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
  assert.deepEqual(h.operations, ['chat:chat-a']);
  // A logs out and authenticates again as A before an old request finishes.
  // UID matching alone would erroneously hydrate the obsolete snapshot.
  h.newSession();
  h.backend.session = { uid: 'A' };
  h.state.user.id = 'A';
  resolve({ user: { id: 'A' } });
  await h.flush();
  assert.deepEqual(h.operations, ['chat:chat-a'], 'same-UID reauthentication must invalidate prior snapshot');
}

{
  const h = harness('A');
  let resolve;
  h.backend.loadSnapshot = () => new Promise((r) => { resolve = r; });
  h.send({ source: 'action', recipient_uid: 'A', chat_id: 'chat-a', notification_id: 'n6' });
  assert.deepEqual(h.operations, ['chat:chat-a']);
  // Phone-password sign-out/login does not increment verified-email generation.
  h.phoneRelogin();
  resolve({ user: { id: 'A' } });
  await h.flush();
  assert.deepEqual(h.operations, ['chat:chat-a'], 'old phone-session snapshot cannot hydrate same UID after token rotation');
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
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'tab:inbox'],
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
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'chat:chat-new-b'],
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

// An uncached notification must not cause a remote read without a matching
// authenticated notification record. Auth UID and chat membership alone are
// insufficient, because the supplied notification_id is untrusted.
{
  const h = harness('B');
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-b', notification_id: 'uncached-B' });
  assert.deepEqual(h.operations, ['chat:chat-b'], 'no premature uncached read');
  await h.flush();
  assert.deepEqual(h.operations, ['chat:chat-b', 'hydrate:B'], 'missing notification snapshot cannot prove a receipt');
}
// A genuinely new notification may become readable after its exact ID and
// chat membership appear in the verified B-owned snapshot.
{
  const h = harness('B');
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    chats: [{ id: 'chat-b', comprador_id: 'B', vendedor_id: 'seller' }],
    notifications: [{ id: 'new-B-notice', kind: 'message', chat_id: 'chat-b' }],
  });
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-b', notification_id: 'new-B-notice' });
  assert.deepEqual(h.operations, ['chat:chat-b'], 'receipt must await verified snapshot');
  await h.flush();
  assert.deepEqual(h.operations, ['chat:chat-b', 'hydrate:B', 'read:new-B-notice']);
}
// An authenticated B snapshot that contains an A-owned chat notification
// must not authorize B to mark A's message as read.
{
  const h = harness('B');
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    chats: [{ id: 'chat-b', comprador_id: 'B', vendedor_id: 'seller' }],
    notifications: [{ id: 'cross-owned', kind: 'message', chat_id: 'chat-a' }],
  });
  h.send({ source: 'action', recipient_uid: 'B', chat_id: 'chat-a', notification_id: 'cross-owned' });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'tab:inbox'],
    'unowned remote chat must never mark read');
}
// Delivery is not a read receipt, even when the cached chat belongs to B.
{
  const h = harness('B');
  h.state.notifications.push({ id: 'B-unread-delivery', chat_id: 'chat-b', kind: 'message' });
  h.send({
    source: 'received', recipient_uid: 'B', chat_id: 'chat-b',
    notification_id: 'B-unread-delivery',
  });
  await h.flush();
  assert.deepEqual(h.operations, ['hydrate:B'],
    'a delivered notification must remain unread until a user action');
}
// The account switch can leave an A-owned offer/system notification without
// chat_id in the B store. A B-addressed push must not mark that stale row read.
{
  const h = harness('B');
  h.state.notifications.push({ id: 'A-stale-chatless', kind: 'offer' });
  h.send({
    source: 'action', recipient_uid: 'B', notification_id: 'A-stale-chatless',
    kind: 'offer_received',
  });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B'],
    'B cannot mark an A-owned cached chatless notification read');
}
// A real B-owned chatless notification remains readable when a fresh,
// owner-verified online snapshot proves that it belongs to B.
{
  const h = harness('B');
  h.state.notifications.push({ id: 'B-owned-chatless', kind: 'offer' });
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    notifications: [{ id: 'B-owned-chatless', kind: 'offer' }],
  });
  h.send({
    source: 'action', recipient_uid: 'B', notification_id: 'B-owned-chatless',
    kind: 'offer_received',
  });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:inbox', 'hydrate:B', 'read:B-owned-chatless'],
    'owner-verified B snapshot should mark the right chatless notification read');
}

// Cold-start listing push: before hydration no listing is available to open.
// After an exact same-account snapshot, retry once and honor moderation.
{
  const h = harness('B');
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    products: [{ id: 'fresh-B-listing', estado: 'Activo', moderation_status: 'approved' }],
  });
  h.send({ source: 'action', recipient_uid: 'B', listing_id: 'fresh-B-listing' });
  await h.flush();
  assert.deepEqual(h.operations,
    ['tab:feed', 'hydrate:B', 'tab:feed', 'product:fresh-B-listing'],
    'cold-start listing push should open only after B-owned snapshot hydration');
  assert.equal(h.state.selectedProductId, 'fresh-B-listing');
}
{
  const h = harness('B');
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    products: [{ id: 'pending-B-listing', estado: 'Activo', moderation_status: 'pending' }],
  });
  h.send({ source: 'action', recipient_uid: 'B', listing_id: 'pending-B-listing' });
  await h.flush();
  assert.deepEqual(h.operations, ['tab:feed', 'hydrate:B', 'tab:feed'],
    'remoderated/private listing must not open on cold push retry');
  assert.equal(h.state.selectedProductId, null);
}
// Cached approval is not current authorization. No stale listing preview
// may flash on screen before the trusted snapshot discovers remoderation.
{
  const h = harness('B');
  h.state.products.push({ id: 'stale-B-listing', estado: 'Activo', moderation_status: 'approved' });
  h.backend.loadSnapshot = async () => ({
    user: { id: 'B' },
    products: [{ id: 'stale-B-listing', estado: 'Activo', moderation_status: 'pending' }],
  });
  h.send({ source: 'action', recipient_uid: 'B', listing_id: 'stale-B-listing' });
  assert.deepEqual(h.operations, ['tab:feed'],
    'cached approval must not open listing before fresh moderation check');
  await h.flush();
  assert.deepEqual(h.operations, ['tab:feed', 'hydrate:B', 'tab:feed'],
    'withdrawn listing must remain closed after verified refresh');
  assert.equal(h.state.selectedProductId, null);
}
// Same-account concurrent push snapshots can complete in reverse order.
// The older result must not restore stale listing visibility or reads.
{
  const h = harness('B');
  const resolveSnapshots = [];
  h.backend.loadSnapshot = () => new Promise((resolve) => { resolveSnapshots.push(resolve); });
  h.send({ source: 'received', recipient_uid: 'B', notification_id: 'older' });
  h.send({ source: 'received', recipient_uid: 'B', notification_id: 'newer' });
  assert.equal(resolveSnapshots.length, 2);
  resolveSnapshots[1]({
    user: { id: 'B' },
    products: [{ id: 'current-approved', estado: 'Activo', moderation_status: 'approved' }],
  });
  await h.flush();
  assert.deepEqual(h.state.products.map((item) => item.id), ['current-approved']);
  resolveSnapshots[0]({
    user: { id: 'B' },
    products: [{ id: 'stale-approved', estado: 'Activo', moderation_status: 'approved' }],
  });
  await h.flush();
  assert.deepEqual(h.state.products.map((item) => item.id), ['current-approved'],
    'older same-account snapshot cannot restore stale products');
  assert.deepEqual(h.operations, ['hydrate:B'],
    'only the most recently initiated snapshot may hydrate the active account');
}
console.log('PASS native notification router account/session/read-ownership integration, no Firebase');
