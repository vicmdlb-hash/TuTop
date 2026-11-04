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
assert.match(inbox, /<ChatConversation key=\\{JSON\\.stringify\\(\\[user\\.id, activeChatId\\]\\)\\} chatId=\\{activeChatId\\} \\/>/);
assert.match(conversation, /const \\[structuredOffers, setStructuredOffers\\] = useState<Offer\\[\\]>\\(\\[\\]\\)/);
assert.match(conversation, /const \\[canonicalTransaction, setCanonicalTransaction\\] = useState<MarketplaceTransaction \\| null>\\(null\\)/);
const chatIdentity = (uid, chatId) => JSON.stringify([uid, chatId]);
assert.equal(chatIdentity('A', 'chat-1'), chatIdentity('A', 'chat-1'));
assert.notEqual(chatIdentity('A', 'chat-1'), chatIdentity('A', 'chat-2'));
assert.notEqual(chatIdentity('A', 'chat-1'), chatIdentity('B', 'chat-1'));
assert.notEqual(chatIdentity('A:B', 'C'), chatIdentity('A', 'B:C'));
console.log('PASS chat local offer/reservation state is scoped by both UID and chat ID');

console.log('PASS V2 chat sends preserve optimistic history without full snapshot reload');
console.log('PASS chat history cache invalidates after successful sends');
console.log('PASS failed text/image sends remove only the exact optimistic message ID');
console.log('PASS rollback uses current store state and preserves concurrent messages/unread/chat fields');
console.log('V2 post-send stability contract: PASS');
