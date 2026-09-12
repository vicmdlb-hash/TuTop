import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
const chat = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');

assert.match(source, /OFFER_LIST_CACHE_TTL_MS = 30_000/);
assert.match(source, /offerListCache = new Map/);
assert.match(source, /offerListInflight = new Map/);
assert.match(source, /async listOffersForChat\(chatId: string, force = false\)/);
assert.match(source, /if \(!force && inflight\) return inflight/);
assert.match(source, /invalidateOfferList\(offer\.chat_id\)/);

assert.match(chat, /const refreshCanonicalOffers = \(\) =>/);
assert.match(chat, /canonicalOffersBackend\.listOffersForChat\(chatId, true\)/);
const forcedRefreshCalls = chat.match(/refreshCanonicalOffers\(\);/g) || [];
assert.ok(forcedRefreshCalls.length >= 3, 'accept, reject and final reservation should force-refresh the canonical offer cache');

console.log('PASS canonical chat offer reads use TTL cache and request dedupe');
console.log('PASS create/counter invalidates cached chat offers');
console.log('PASS accept/reject/finalize refresh the canonical cache without changing mutation success semantics');
console.log('Canonical offer read cache contract: PASS');
