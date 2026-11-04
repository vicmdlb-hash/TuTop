import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const bridge = fs.readFileSync('src/services/v2StoreChatMutationBridge.ts', 'utf8');

assert.match(app, /import '\.\/services\/v2StoreChatMutationBridge'/);
assert.match(bridge, /sendMessage:/);
assert.match(bridge, /sendImageMessage:/);
assert.match(bridge, /chatHistoryBackend\.invalidate\(chatId\)/);
// Connected V2 bridge replaces the base Zustand methods: both callbacks
// must remain owner-bound after A -> B logout and shared-device reuse.
assert.equal(bridge.split('const actorUid = state.user.id;').length - 1, 2);
assert.equal(bridge.split('if (useAppStore.getState().user.id !== actorUid) return;').length - 1, 4);
assert.equal(bridge.split('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid').length - 1, 2);
assert(bridge.includes('if (!chat || !actorUid'));

assert.doesNotMatch(bridge, /loadSnapshot\(/);
assert.doesNotMatch(bridge, /hydrateOnline\(/);
assert.match(bridge, /msg-local/);
assert.match(bridge, /sin_leer: 0/);

const targetedRollbacks = bridge.match(/mensajes: item\.mensajes\.filter\(\(candidate\) => candidate\.id !== message\.id\)/g) || [];
assert.equal(targetedRollbacks.length, 2, 'text and image failures must remove only their own optimistic message');
assert.doesNotMatch(bridge, /item\.id === chatId \? chat : item/);
assert.doesNotMatch(bridge, /item\.id === chatId \?\s*chat\s*:\s*item/);
assert.match(bridge, /useAppStore\.setState\(\(current\) => \(\{/);


const inbox = fs.readFileSync('src/components/Inbox.tsx', 'utf8');
const conversation = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
// React must remount the conversation if either owner or chat changes: the
// component contains local offer, reservation and report state.
assert(inbox.includes('<ChatConversation key={JSON.stringify([user.id, activeChatId])} chatId={activeChatId} />'));
assert(conversation.includes('const [structuredOffers, setStructuredOffers] = useState<Offer[]>([]);'));
assert(conversation.includes('const [canonicalTransaction, setCanonicalTransaction] = useState<MarketplaceTransaction | null>(null);'));
const chatIdentity = (uid, chatId) => JSON.stringify([uid, chatId]);
assert.equal(chatIdentity('A', 'chat-1'), chatIdentity('A', 'chat-1'));
assert.notEqual(chatIdentity('A', 'chat-1'), chatIdentity('A', 'chat-2'));
assert.notEqual(chatIdentity('A', 'chat-1'), chatIdentity('B', 'chat-1'));
assert.notEqual(chatIdentity('A:B', 'C'), chatIdentity('A', 'B:C'));

const historySource = fs.readFileSync('src/services/chatHistoryBackend.ts', 'utf8');
const historyHydrator = fs.readFileSync('src/components/V2ChatHistoryHydrator.tsx', 'utf8');
const historyStart = historySource.indexOf('const CHAT_HISTORY_CACHE_TTL_MS');
assert(historyStart > 0, 'history backend source is missing');
const { stripTypeScriptTypes } = await import('node:module');
let session = { uid: 'owner-A', idToken: 'token-A', refreshToken: 'refresh-A' };
const outstanding = [];
class FakeFirebaseRestClient {
  constructor() { this.currentSession = session ? { ...session } : null; }
  runQuery(_collection, _filters, _orders, _limit, _parent) {
    return new Promise((resolve) => outstanding.push({ owner: this.currentSession.uid, resolve }));
  }
}
const assertSyntheticCurrent = (requested, runtime, persisted) => {
  if (!requested || !runtime || !persisted
    || requested.uid !== runtime.uid || requested.uid !== persisted.uid
    || requested.idToken !== runtime.idToken || requested.idToken !== persisted.idToken
    || requested.refreshToken !== runtime.refreshToken || requested.refreshToken !== persisted.refreshToken)
    throw new Error('AUTH_SESSION_CHANGED');
};
const historyBackend = new Function(
  'FirebaseRestClient', 'getFirebaseConfig', 'assertFirebaseRequestSessionCurrent',
  `${stripTypeScriptTypes(historySource.slice(historyStart))}\nreturn chatHistoryBackend;`,
)(FakeFirebaseRestClient, () => ({}), assertSyntheticCurrent);
const fakeMessage = (label) => [{
  id: 'message-' + label, data: { sender_id: 'buyer-1', text: label, created_at: '2026-09-05T18:00:00Z' },
}];
const firstHistory = historyBackend.load('same-chat', 'buyer-1');
assert.equal(outstanding.length, 1);
outstanding.shift().resolve(fakeMessage('A'));
assert.equal((await firstHistory)[0].texto, 'A');
session = { uid: 'owner-B', idToken: 'token-B', refreshToken: 'refresh-B' };
const otherOwnerHistory = historyBackend.load('same-chat', 'buyer-1');
assert.equal(outstanding.length, 1, 'owner B cannot reuse cached history of owner A');
outstanding.shift().resolve(fakeMessage('B'));
assert.equal((await otherOwnerHistory)[0].texto, 'B');
assert.equal((await historyBackend.load('same-chat', 'buyer-1'))[0].texto, 'B');
session = null;
await assert.rejects(historyBackend.load('same-chat', 'buyer-1'), /AUTH_REQUIRED/,
  'logout must reject all cached private messages');
session = { uid: 'owner-A', idToken: 'token-A2', refreshToken: 'refresh-A2' };
const stale = historyBackend.load('other-chat', 'buyer-1');
session = { uid: 'owner-B', idToken: 'token-B2', refreshToken: 'refresh-B2' };
outstanding.shift().resolve(fakeMessage('stale-A'));
await assert.rejects(stale, /AUTH_SESSION_CHANGED/,
  'an in-flight A read cannot complete after B logs in');
const fresh = historyBackend.load('other-chat', 'buyer-1');
outstanding.shift().resolve(fakeMessage('fresh-B'));
assert.equal((await fresh)[0].texto, 'fresh-B');
historyBackend.invalidate('same-chat');
const again = historyBackend.load('same-chat', 'buyer-1');
assert.equal(outstanding.length, 1, 'chat invalidation must evict owner-scoped cache');
outstanding.shift().resolve(fakeMessage('B-new'));
assert.equal((await again)[0].texto, 'B-new');
assert(historySource.includes('const key = cacheKey(requestSession!.uid, cleanChatId, cleanBuyerId)'));
assert(historySource.indexOf('const client = getClient();', historySource.indexOf('async load('))
  < historySource.indexOf('historyCache.get(key)', historySource.indexOf('async load(')));
assert(historyHydrator.includes('const viewerUid = useAppStore((state) => state.user.id);'));
assert(historyHydrator.includes('[activeChatId, buyerId, viewerUid]'));
assert(historyHydrator.includes('state.user.id !== viewerUid || state.activeChatId !== activeChatId'));
console.log('PASS chat history cache blocks A-to-B reuse, unauthenticated reads and stale in-flight hydration');

console.log('PASS chat local offer/reservation state is scoped by both UID and chat ID');

console.log('PASS V2 chat sends preserve optimistic history without full snapshot reload');
console.log('PASS chat history cache invalidates after successful sends');
console.log('PASS failed text/image sends remove only the exact optimistic message ID');
console.log('PASS rollback uses current store state and preserves concurrent messages/unread/chat fields');
console.log('V2 post-send stability contract: PASS');
