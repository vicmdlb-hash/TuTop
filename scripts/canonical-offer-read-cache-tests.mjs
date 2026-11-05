import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
const chat = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');

assert.match(source, /OFFER_LIST_CACHE_TTL_MS = 30_000/);
assert.match(source, /offerListCache = new Map/);
assert.match(source, /offerListInflight = new Map/);
assert.match(source, /async listOffersForChat\(chatId: string, force = false\)/);
assert.match(source, /if \(!force && inflight && sameFirebaseSession\(inflight\.session, requestSession\)\) \{/);
assert.match(source, /const client = getClient\(\);\s*const requestSession = client\.currentSession;/);
assert.match(source, /assertFirebaseRequestSessionCurrent\(/);
assert.match(source, /const key = offerListCacheKey\(requestSession!\.uid, cleanChatId\)/);
assert.match(source, /offerListCache\.get\(key\)/);
assert.match(source, /offerListCache\.set\(key/);
assert.doesNotMatch(source, /offerListCache\.get\(cleanChatId\)/);
assert.match(source, /STALE_OFFER_READ/);

const { stripTypeScriptTypes } = await import('node:module');
const helperStart = source.indexOf('function offerListCacheKey(');
const helperEnd = source.indexOf('function getClient(', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'owner-scoped helper must exist');
const cache = new Map();
const inflightMap = new Map();
const helpers = new Function('offerListCache', 'offerListInflight',
  stripTypeScriptTypes(source.slice(helperStart, helperEnd))
  + '; return { offerListCacheKey, invalidateOfferList };')(cache, inflightMap);
const ownerA = helpers.offerListCacheKey('uid:A', 'chat/one');
const ownerB = helpers.offerListCacheKey('uid:B', 'chat/one');
const otherChat = helpers.offerListCacheKey('uid:A', 'chat/two');
assert.notEqual(ownerA, ownerB, 'the same chat cannot reuse another user cache');
assert.notEqual(ownerA, helpers.offerListCacheKey('uid', 'A:chat/one'));
cache.set(ownerA, 1); cache.set(ownerB, 2); cache.set(otherChat, 3);
inflightMap.set(ownerA, 1); inflightMap.set(ownerB, 2); inflightMap.set(otherChat, 3);
helpers.invalidateOfferList('chat/one');
assert.equal(cache.has(ownerA), false);
assert.equal(cache.has(ownerB), false);
assert.equal(inflightMap.has(ownerA), false);
assert.equal(inflightMap.has(ownerB), false);
assert.equal(cache.get(otherChat), 3);
assert.equal(inflightMap.get(otherChat), 3);

assert.match(source, /invalidateOfferList\(offer\.chat_id\)/);

assert.match(chat, /const refreshCanonicalOffers = \(\) =>/);
assert.match(chat, /canonicalOffersBackend\.listOffersForChat\(chatId, true\)/);
const forcedRefreshCalls = chat.match(/refreshCanonicalOffers\(\);/g) || [];
assert.ok(forcedRefreshCalls.length >= 3, 'accept, reject and final reservation should force-refresh the canonical offer cache');

console.log('PASS canonical chat offer reads use TTL cache and request dedupe');
console.log('PASS create/counter invalidates cached chat offers');
console.log('PASS accept/reject/finalize refresh the canonical cache without changing mutation success semantics');
console.log('Canonical offer read cache contract: PASS');
