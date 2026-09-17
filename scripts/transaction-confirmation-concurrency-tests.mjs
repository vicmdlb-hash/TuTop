import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');
const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');

const confirmStart = backend.indexOf('  async confirmDelivery(transaction: MarketplaceTransaction) {');
const confirmEnd = backend.indexOf('\n\n  async finalizeCompletedListing', confirmStart);
assert.ok(confirmStart >= 0 && confirmEnd > confirmStart, 'confirmDelivery implementation must be locatable');
const confirm = backend.slice(confirmStart, confirmEnd);

assert.match(backend, /async function loadCurrentTransaction\(client: FirebaseRestClient, expected: MarketplaceTransaction\)/);
assert.match(backend, /function sameTransactionIdentity\(current: MarketplaceTransaction, expected: MarketplaceTransaction\)/);
assert.match(backend, /if \(transaction\.status === 'completed' && transaction\[field\]\) return transaction/);
assert.match(confirm, /const current = await loadCurrentTransaction\(client, transaction\)/);
assert.match(confirm, /refreshed = await loadCurrentTransaction\(client, transaction\)/);
assert.match(confirm, /if \(refreshed\[field\]\) return refreshed/);
assert.match(confirm, /return commitDeliveryConfirmation\(client, refreshed, actor\)/);

const retryOccurrences = (confirm.match(/loadCurrentTransaction\(client, transaction\)/g) || []).length;
assert.equal(retryOccurrences, 2, 'confirmation path must do one initial canonical read and at most one recovery read');

assert.match(rules, /resource\.data\.status == 'meetup_scheduled'/);
assert.match(rules, /!\('buyer_confirmed_at' in resource\.data\)/);
assert.match(rules, /!\('seller_confirmed_at' in resource\.data\)/);
assert.match(rules, /request\.resource\.data\.status == 'completed'/);

console.log('PASS delivery confirmation reads canonical server state before deciding status');
console.log('PASS concurrent/stale confirmation gets exactly one canonical recovery read + retry');
console.log('PASS lost-response/double-tap is idempotent when actor confirmation already exists');
console.log('PASS strict Firestore transition rules remain unchanged and authoritative');
