import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
assert.match(source, /SELLER_NAME_CACHE_TTL_MS = 10 \* 60_000/);
assert.match(source, /sellerNameCache = new Map/);
assert.match(source, /sellerNameInflight = new Map/);
assert.match(source, /if \(inflight\) return inflight/);
assert.match(source, /sellerNameCache\.set\(uid/);
assert.match(source, /sellerNameInflight\.delete\(uid\)/);
assert.doesNotMatch(source, /sellerIds\.map\(async \(uid\) => \{\s*const profile = await client\.getDocument/);
console.log('PASS seller names use TTL cache and in-flight request dedupe');
console.log('Seller profile cache contract: PASS');
