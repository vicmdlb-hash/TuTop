import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const lean = fs.readFileSync('src/services/v2LeanChatSnapshotBridge.ts', 'utf8');
const history = fs.readFileSync('src/services/chatHistoryBackend.ts', 'utf8');
const hydrator = fs.readFileSync('src/components/V2ChatHistoryHydrator.tsx', 'utf8');
const rateLimited = fs.readFileSync('src/services/rateLimitedOnlineBridge.ts', 'utf8');

assert.match(app, /import '\.\/services\/v2LeanChatSnapshotBridge'/);
assert.match(app, /<V2ChatHistoryHydrator \/>/);
assert.match(lean, /\(onlineBackend as any\)\.loadChat = loadLeanChat/);
assert.match(lean, /if \(Number\.isFinite\(readAt\) && Number\.isFinite\(lastMessageAt\) && readAt >= lastMessageAt\) return 0/);
assert.match(lean, /GREATER_THAN/);
assert.match(lean, /summaryMessage\(data, buyerId, uid\)/);
assert.match(lean, /const effectiveSender = senderId \|\| viewerUid/);
assert.match(history, /CHAT_HISTORY_LIMIT = 100/);
assert.match(history, /CHAT_HISTORY_CACHE_TTL_MS = 20_000/);
assert.match(hydrator, /chatHistoryBackend\.load\(activeChatId, buyerId, force\)/);
assert.match(hydrator, /msg-local/);
assert.doesNotMatch(rateLimited, /last_sender_id/);

console.log('PASS V2 Inbox uses lean chat summaries and read-marker-aware unread queries');
console.log('PASS active conversations hydrate full lazy history with optimistic-message preservation');
console.log('PASS current Rules compatibility is preserved: last_sender_id is not written yet');
console.log('V2 lean chat snapshot contract: PASS');
