import fs from 'node:fs';
import assert from 'node:assert/strict';

const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const leanChat = fs.readFileSync('src/services/v2LeanChatSnapshotBridge.ts', 'utf8');
const listings = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');

const limits = {
  chats: 60,
  favorites: 200,
  ownReviews: 100,
  receivedReviews: 100,
  walletTransactions: 100,
  canonicalListingScope: 30,
};

assert.match(online, /const leanV2 = v2SnapshotMode\(\)/);
assert.match(online, /leanV2 \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('products'/);
assert.match(online, /leanV2 \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('bids'/);

assert.match(online, new RegExp(`runQuery<any>\\('chats',[\\s\\S]*?,\\s*${limits.chats}\\)`));
assert.match(online, new RegExp(`runQuery<any>\\('favorites',[\\s\\S]*?,\\s*${limits.favorites}\\)`));
assert.equal((online.match(new RegExp(`runQuery<any>\\('reviews',[\\s\\S]*?,\\s*${limits.ownReviews}\\)`, 'g')) || []).length >= 2, true);
assert.match(online, new RegExp(`runQuery<any>\\('wallet_transactions',[\\s\\S]*?,\\s*${limits.walletTransactions}\\)`));
assert.match(listings, /limitPerScope \|\| 30/);
assert.match(leanChat, /readAt >= lastMessageAt\) return 0/);
assert.match(leanChat, /firestoreMessageCountBackend\.countAfter/);

const fixedSingleDocs = 5; // profile, wallet, public verification, admin, moderation
const directRootDocumentCeiling = fixedSingleDocs
  + limits.chats
  + limits.favorites
  + limits.ownReviews
  + limits.receivedReviews
  + limits.walletTransactions;

assert.equal(directRootDocumentCeiling, 565);

console.log(`PASS V2 root snapshot direct-document ceiling frozen at ${directRootDocumentCeiling} docs before chat subreads/canonical listing hydration`);
console.log('PASS legacy products/bids remain zero-read in V2');
console.log('PASS chat unread path remains aggregation-capable and zero-message-read when already read');
console.log('Budget note: this is a fail-closed ceiling, not a target; future work should lower wallet/review/favorite caps only after lazy consumers exist.');
console.log('V2 snapshot budget contract: PASS');
