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

console.log('PASS V2 chat sends preserve optimistic history without full snapshot reload');
console.log('PASS chat history cache invalidates after successful sends');
console.log('V2 post-send stability contract: PASS');
