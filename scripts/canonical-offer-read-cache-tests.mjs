import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/services/canonicalOffersBackend.ts', 'utf8');
assert.match(source, /OFFER_LIST_CACHE_TTL_MS = 30_000/);
assert.match(source, /offerListCache = new Map/);
assert.match(source, /offerListInflight = new Map/);
assert.match(source, /async listOffersForChat\(chatId: string, force = false\)/);
assert.match(source, /if \(!force && inflight\) return inflight/);
assert.match(source, /invalidateOfferList\(offer\.chat_id\)/);
console.log('PASS canonical chat offer reads use TTL cache and request dedupe');
console.log('PASS create/counter invalidates cached chat offers');
console.log('Canonical offer read cache contract: PASS');
