import fs from 'node:fs';
import assert from 'node:assert/strict';

const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const leanChat = fs.readFileSync('src/services/v2LeanChatSnapshotBridge.ts', 'utf8');
const listings = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
const cutoverBridge = fs.readFileSync('src/services/v2CostCutoverSnapshotBridge.ts', 'utf8');
const favoritesBackend = fs.readFileSync('src/services/visibleFavoritesBackend.ts', 'utf8');

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

const preparedReviewsCutoverRoot = directRootDocumentCeiling - limits.ownReviews - limits.receivedReviews;
const preparedReviewsWalletRoot = preparedReviewsCutoverRoot - limits.walletTransactions;
const preparedAllThreeRoot = preparedReviewsWalletRoot - limits.favorites;
assert.equal(preparedReviewsCutoverRoot, 365);
assert.equal(preparedReviewsWalletRoot, 265);
assert.equal(preparedAllThreeRoot, 65);

assert.match(cutoverBridge, /favoritesCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('favorites'/);
assert.match(cutoverBridge, /reviewsCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('reviews'/);
assert.match(cutoverBridge, /walletCutover \? Promise\.resolve\(\[\] as FirestoreDocument<any>\[\]\) : client\.runQuery<any>\('wallet_transactions'/);
assert.match(favoritesBackend, /MAX_VISIBLE_FAVORITES = 120/);
assert.match(favoritesBackend, /MAX_IN_VALUES = 30/);

console.log(`PASS current V2 root snapshot direct-document ceiling remains frozen at ${directRootDocumentCeiling}`);
console.log(`PASS prepared root targets are reviews=${preparedReviewsCutoverRoot}, reviews+wallet=${preparedReviewsWalletRoot}, all-three=${preparedAllThreeRoot}`);
console.log('PASS all-three target excludes visible favorite membership reads, which remain separately bounded to currently hydrated listings (max 120, IN batches max 30)');
console.log('PASS legacy products/bids remain zero-read in V2 and chat unread remains aggregation-capable');
console.log('Budget note: 365/265/65 are PREPARED targets, not active runtime claims until the corresponding staging-only flags pass real gates.');
console.log('V2 snapshot budget contract: PASS');
