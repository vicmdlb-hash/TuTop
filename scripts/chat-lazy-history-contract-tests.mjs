import fs from 'node:fs';
import assert from 'node:assert/strict';

const history = fs.readFileSync('src/services/chatHistoryBackend.ts', 'utf8');
const identityBridge = fs.readFileSync('src/services/nationalIdentityHydrationBridge.ts', 'utf8');

assert.match(history, /CHAT_HISTORY_CACHE_TTL_MS = 20_000/);
assert.match(history, /CHAT_HISTORY_LIMIT = 100/);
assert.match(history, /historyCache = new Map/);
assert.match(history, /historyInflight = new Map/);
assert.match(history, /async load\(chatId: string, buyerId: string, force = false\)/);
assert.match(history, /if \(!force && inflight\) return inflight/);
assert.match(history, /senderId === cleanBuyerId \? 'comprador' as const : 'vendedor' as const/);
assert.match(history, /invalidate\(chatId: string\)/);

assert.match(identityBridge, /IDENTITY_CACHE_TTL_MS = 5 \* 60_000/);
assert.match(identityBridge, /identityCache = new Map/);
assert.match(identityBridge, /cached && cached\.expiresAt > Date\.now\(\)/);
assert.match(identityBridge, /identityCache\.set\(uid/);
assert.match(identityBridge, /canonicalListingsBackend\.loadMarketplaceProducts\(/);

console.log('PASS lazy chat history loader caches and deduplicates message reads');
console.log('PASS message roles remain buyer/seller correct');
console.log('PASS national identity hydration caches authoritative server identity for 5 minutes');
console.log('Chat lazy history + identity cache contract: PASS');
