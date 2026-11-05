import fs from 'node:fs';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';
import assert from 'node:assert/strict';

const history = fs.readFileSync('src/services/chatHistoryBackend.ts', 'utf8');
const identityBridge = fs.readFileSync('src/services/nationalIdentityHydrationBridge.ts', 'utf8');

assert.match(history, /CHAT_HISTORY_CACHE_TTL_MS = 20_000/);
assert.match(history, /CHAT_HISTORY_LIMIT = 100/);
assert.match(history, /historyCache = new Map/);
assert.match(history, /historyInflight = new Map/);
assert.match(history, /async load\(chatId: string, buyerId: string, force = false\)/);
assert.match(history, /if \(!force && inflight && sameFirebaseSession\(inflight\.session, requestSession\)\) \{\s*assertCurrent\(\);\s*return inflight\.promise;\s*\}/);
assert.match(history, /const client = getClient\(\);[\s\S]*?const cached = historyCache\.get\(key\)/,
  'private chat cache must not be read before authentication');
assert.match(history, /cacheKey\(requestSession!\.uid, cleanChatId, cleanBuyerId\)/,
  'cache must be partitioned by the current authenticated user');
assert.match(history, /if \(historyInflight\.get\(key\)\?\.promise !== request\) throw new Error\('STALE_CHAT_HISTORY_READ'\)/,
  'a displaced async read must never repopulate private chat history');
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


// Execute the REAL TypeScript loader in a synthetic, offline auth/Firestore VM.
// Static regex checks alone cannot prove same-UID relogin isolation.
function loadFixture(compiled, imports = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, Date, Promise,
    require(name) {
      assert(Object.prototype.hasOwnProperty.call(imports, name), 'unexpected fixture import: ' + name);
      return imports[name];
    },
  }, { timeout: 3000 });
  return mod.exports;
}
const guard = loadFixture(compileTypescriptFixture('src/lib/firebaseSharedSessionGuard.ts'));
let session = null;
const calls = [];
const identity = (uid, epoch) => ({
  uid, idToken: 'synthetic-id-' + epoch, refreshToken: 'synthetic-refresh-' + epoch,
});
class MockFirebaseRestClient {
  constructor() { this.currentSession = session ? { ...session } : null; }
  runQuery() {
    return new Promise((resolve, reject) => {
      calls.push({ resolve, reject, uid: this.currentSession?.uid });
    });
  }
}
const loader = loadFixture(compileTypescriptFixture('src/services/chatHistoryBackend.ts'), {
  '../lib/firebaseSharedSessionGuard': guard,
  './firebaseRest': { FirebaseRestClient: MockFirebaseRestClient },
  './runtimeConfig': { getFirebaseConfig: () => ({}) },
}).chatHistoryBackend;
const rows = (text) => [{
  id: 'synthetic-message', data: {
    sender_id: 'buyer', text, created_at: '2026-11-04T00:00:00.000Z',
  },
}];
session = identity('A', 'one');
const warm = loader.load('warm-room', 'buyer');
assert.equal(calls.length, 1);
calls[0].resolve(rows('private A'));
const warmMessages = await warm;
assert.equal(warmMessages[0].texto, 'private A');
warmMessages[0].texto = 'mutated by caller';
assert.equal((await loader.load('warm-room', 'buyer'))[0].texto, 'private A',
  'cache must return a defensive copy');
const dedup1 = loader.load('dedup-room', 'buyer');
const dedup2 = loader.load('dedup-room', 'buyer');
assert.equal(calls.length, 2, 'same epoch must deduplicate');
calls[1].resolve(rows('deduplicated'));
assert.equal((await dedup1)[0].texto, 'deduplicated');
assert.equal((await dedup2)[0].texto, 'deduplicated');
const staleA = loader.load('relogin-room', 'buyer');
assert.equal(calls.length, 3);
session = identity('A', 'two');
const freshA = loader.load('relogin-room', 'buyer');
assert.equal(calls.length, 4, 'same UID + new login must create a NEW query');
calls[3].resolve(rows('fresh A'));
assert.equal((await freshA)[0].texto, 'fresh A');
calls[2].resolve(rows('stale A'));
await assert.rejects(staleA, /AUTH_SESSION_CHANGED/);
assert.equal((await loader.load('relogin-room', 'buyer'))[0].texto, 'fresh A');
const pendingA = loader.load('shared-room', 'buyer');
session = identity('B', 'one');
const pendingB = loader.load('shared-room', 'buyer');
assert.equal(calls.length, 6, 'B must not reuse pending A');
calls[5].resolve(rows('private B'));
assert.equal((await pendingB)[0].texto, 'private B');
calls[4].resolve(rows('late A'));
await assert.rejects(pendingA, /AUTH_SESSION_CHANGED/);
session = null;
await assert.rejects(loader.load('shared-room', 'buyer'), /AUTH_REQUIRED/,
  'guests must not read cached private chat');
console.log('PASS behavioral chat history isolation: A->A relogin, A->B, stale replies, cache, guest and same-epoch dedupe');
