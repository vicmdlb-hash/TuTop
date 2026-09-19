import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts', 'utf8');
const national = fs.readFileSync('src/services/nationalBackend.ts', 'utf8');
const chatbot = fs.readFileSync('src/components/Chatbot.tsx', 'utf8');

function sourceFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const allSource = sourceFiles('src').map((file) => fs.readFileSync(file, 'utf8')).join('\n');

assert.match(app, /import '\.\/services\/nationalBackendCanonicalBridge';/);
assert.match(app, /bot: v2 \? <NationalPublishScreen key=\{user\.id\} \/> : <Chatbot \/>/);
assert.match(bridge, /if \(nationalSchemaEnabled\(\)\) \{/);
assert.match(bridge, /Object\.assign\(nationalBackend, \{/);

const canonicalMappings = {
  createOffer: 'canonicalOffersBackend.createOffer',
  createCounterOffer: 'canonicalOffersBackend.createCounterOffer',
  updateOffer: 'canonicalOffersBackend.updateOffer',
  acceptOfferAndCreateTransaction: 'canonicalTransactionRetryBackend.acceptOfferAndCreateTransaction',
  createTransactionFromAcceptedOffer: 'canonicalTransactionRetryBackend.createTransactionFromAcceptedOffer',
  loadTransactionForChat: 'canonicalTransactionsBackend.loadTransactionForChat',
  scheduleMeetup: 'canonicalTransactionsBackend.scheduleMeetup',
  confirmDelivery: 'canonicalTransactionsBackend.confirmDelivery',
  finalizeCompletedListing: 'canonicalTransactionsBackend.finalizeCompletedListing',
  disputeTransaction: 'canonicalTransactionsBackend.disputeTransaction',
  cancelTransaction: 'canonicalTransactionsBackend.cancelTransaction',
  requestMutualCancellation: 'canonicalTransactionsBackend.requestMutualCancellation',
  claimNoShow: 'canonicalTransactionsBackend.claimNoShow',
  releaseExpiredReservation: 'canonicalTransactionsBackend.releaseExpiredReservation',
};
for (const [method, provider] of Object.entries(canonicalMappings)) {
  assert.match(bridge, new RegExp(`${method}: ${provider.replaceAll('.', '\\.')}`), `${method} must remain bridged`);
}

// Legacy nationalBackend implementations may remain for V1 compatibility, but V2 must never rely on their products writes.
assert.match(national, /async createTransactionFromAcceptedOffer/);
assert.match(national, /products\/\$\{offer\.listing_id\}/);
assert.match(national, /async confirmDelivery/);
assert.match(national, /products\/\$\{transaction\.listing_id\}/);

// The only source-level enrichListing consumer is Chatbot, which App excludes when schema V2 is active.
assert.equal((allSource.match(/\.enrichListing\(/g) || []).length, 1);
assert.match(chatbot, /nationalBackend\.enrichListing\(/);
assert.equal((allSource.match(/\.loadListingMetadata\(/g) || []).length, 0);

// New V2 publishing must remain canonical and independent of Chatbot/enrichListing.
const nationalPublish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
assert.match(nationalPublish, /canonicalListingsBackend\.create/);
assert.doesNotMatch(nationalPublish, /enrichListing|createProduct|products\//);

console.log('PASS App installs the canonical backend bridge and excludes legacy Chatbot from V2 publishing');
console.log(`PASS all ${Object.keys(canonicalMappings).length} sensitive offer/transaction methods are explicitly bridged to canonical providers`);
console.log('PASS enrichListing(products) is confined to V1-only Chatbot and loadListingMetadata has no source consumer');
console.log('PASS NationalPublishScreen writes through canonicalListingsBackend without legacy product enrichment');
console.log('V2 canonical bridge coverage contract: PASS');
