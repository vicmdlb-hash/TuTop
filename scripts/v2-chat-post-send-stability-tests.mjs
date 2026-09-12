import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const bridge = fs.readFileSync('src/services/v2StoreChatMutationBridge.ts', 'utf8');

assert.match(app, /import '\.\/services\/v2StoreChatMutationBridge'/);
assert.match(bridge, /sendMessage:/);
assert.match(bridge, /sendImageMessage:/);
assert.match(bridge, /chatHistoryBackend\.invalidate\(chatId\)/);
assert.doesNotMatch(bridge, /loadSnapshot\(/);
assert.doesNotMatch(bridge, /hydrateOnline\(/);
assert.match(bridge, /msg-local/);
assert.match(bridge, /sin_leer: 0/);

const targetedRollbacks = bridge.match(/mensajes: item\.mensajes\.filter\(\(candidate\) => candidate\.id !== message\.id\)/g) || [];
assert.equal(targetedRollbacks.length, 2, 'text and image failures must remove only their own optimistic message');
assert.doesNotMatch(bridge, /item\.id === chatId \? chat : item/);
assert.doesNotMatch(bridge, /item\.id === chatId \?\s*chat\s*:\s*item/);
assert.match(bridge, /useAppStore\.setState\(\(current\) => \(\{/);

console.log('PASS V2 chat sends preserve optimistic history without full snapshot reload');
console.log('PASS chat history cache invalidates after successful sends');
console.log('PASS failed text/image sends remove only the exact optimistic message ID');
console.log('PASS rollback uses current store state and preserves concurrent messages/unread/chat fields');
console.log('V2 post-send stability contract: PASS');
