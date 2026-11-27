import fs from 'node:fs';
import assert from 'node:assert/strict';

const conversation = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
const card = fs.readFileSync('src/components/TransactionReservationCard.tsx', 'utf8');
const reviewBridge = fs.readFileSync('src/services/v2StoreReviewMutationBridge.ts', 'utf8');
const transactionBackend = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');
const onlineBackend = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');
const rules = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');
const reconciliation = fs.readFileSync('src/lib/reservationReconciliation.ts', 'utf8');
const store = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

assert.match(conversation, /const v2 = nationalSchemaEnabled\(\)/);
assert.match(conversation, /const canonicalCompleted = canonicalTransaction\?\.status === 'completed'/);
assert.match(conversation, /const deliveryCompleted = v2 \? canonicalCompleted : Boolean\(chat\?\.entrega_confirmada\)/);
assert.match(conversation, /const userConfirmed = v2 \? canonicalUserConfirmed : legacyUserConfirmed/);
assert.match(conversation, /syncCanonicalTransaction = useCallback/);
assert.match(conversation, /entrega_confirmada: completed/);
assert.match(conversation, /confirmaciones_entrega: \{ comprador: buyerConfirmed, vendedor: sellerConfirmed \}/);
assert.match(conversation, /<TransactionReservationCard[^>]*transactionHint=\{canonicalTransaction\}[^>]*onTransactionChange=\{syncCanonicalTransaction\}/);
assert.match(conversation, /!v2 && !deliveryCompleted/);
assert.match(conversation, /En V2 la única confirmación válida es la de la tarjeta/);
assert.match(conversation, /deliveryCompleted && !alreadyReviewed/);
const legacyConfirmCalls = conversation.match(/confirmDelivery\(chatId\)/g) || [];
assert.equal(legacyConfirmCalls.length, 1, 'ChatConversation sólo debe conservar una llamada legacy confirmDelivery(chatId)');
assert.match(
  conversation,
  /\{!v2 && !deliveryCompleted && <button[^>]*onClick=\{\(\) => \{ confirmDelivery\(chatId\); feedbackSuccess\(\); \}\}/,
  'la única llamada legacy confirmDelivery(chatId) debe quedar protegida por el render guard !v2 && !deliveryCompleted',
);

assert.match(card, /transactionHint\?: MarketplaceTransaction \| null/);
assert.match(card, /onTransactionChange\?: \(transaction: MarketplaceTransaction \| null\) => void/);
assert.match(card, /nationalBackend\.confirmDelivery\(transaction\)/);
assert.match(card, /if \(!transactionHint \|\| transactionHint\.chat_id !== chatId\) return/);
assert.match(card, /setTransaction\(transactionHint\)/);
assert.match(card, /onTransactionChange\?\.\(currentAccount && transaction\?\.chat_id === chatId/);
assert.match(card, /transaction\.buyer_id === currentUserId \|\| transaction\.seller_id === currentUserId/);
assert.match(card, /: null\);/, 'stale or unauthorized transaction must not propagate to parent');
assert.match(card, /Operación completada y publicación cerrada como Vendido/);
assert.doesNotMatch(card, /finalizeCompletedListing/);
assert.doesNotMatch(card, /Sincronizar publicación como Vendido/);

assert.match(transactionBackend, /if \(status === 'completed'\) \{/);
assert.match(transactionBackend, /patchWrite\(client, `listings_v2\/\$\{transaction\.listing_id\}`, \{ status: 'sold_out', updated_at: at \}\)/);
assert.doesNotMatch(transactionBackend, /status === 'completed' && actor === transaction\.seller_id/);

assert.match(rules, /buyer-second completion atomically sells canonical listing/);
assert.match(rules, /seller-second completion atomically sells canonical listing/);
assert.match(rules, /function buyerCompletionClosesListing\(listingId\)/);
assert.match(rules, /let lock = getAfter\(\/databases\/\$\(database\)\/documents\/listing_reservation_locks\/\$\(listingId\)\)/);
assert.match(rules, /let tx = getAfter\(\/databases\/\$\(database\)\/documents\/transactions_v2\/\$\(lock\.data\.transaction_id\)\)/);
assert.match(rules, /buyerCompletionClosesListing\(listingId\)/);
assert.doesNotMatch(rules, /completionTxAfter\(listingId\)|reservationLockAfter\(listingId\)/);
assert.match(rules, /data\.status == 'sold_out'/);
assert.match(rules, /buyer_confirmed_at == request\.resource\.data\.updated_at/);

assert.match(reviewBridge, /if \(!chat \|\| !chat\.entrega_confirmada\) return false/);
assert.match(rules, /reviews require completed V2 transaction/);
assert.match(rules, /data\.status == 'completed'/);
assert.match(rules, /data\.buyer_confirmed_at is timestamp/);
assert.match(rules, /data\.seller_confirmed_at is timestamp/);

// Trusted reconciliation remains only as historical/drift repair, not as normal completion authority.
assert.match(reconciliation, /repair_completed_listing/);
assert.match(reconciliation, /completed_listing_already_sold/);

// Legacy confirmation remains available for V1 compatibility, but V2 ChatConversation must not use it.
assert.match(store, /confirmDelivery: \(chatId\) =>/);
assert.match(store, /onlineBackend\.confirmDelivery\(chatId\)/);
assert.match(onlineBackend, /async confirmDelivery\(chatId: string\)/);
assert.match(onlineBackend, /chats\/\$\{chatId\}\/confirmations\/\$\{uid\}/);
assert.match(conversation, /!v2 && !deliveryCompleted/);

console.log('PASS transactions_v2 is the sole V2 delivery-completion authority');
console.log('PASS either participant confirming second atomically completes the transaction and closes listings_v2 as sold_out');
console.log('PASS buyer sold-out authority is narrowly bound to its exact lock and second-confirmation timestamp');
console.log('PASS buyer-second authorization uses one helper with lock+transaction getAfter access only');
console.log('PASS canonical transaction state projects locally into chat compatibility fields without legacy confirmation writes');
console.log('PASS newly created transactions surface through transactionHint without polling or duplicate reads');
console.log('PASS review UI/bridge is unlocked only after canonical completed transaction projection');
console.log('PASS trusted reconciliation remains a drift/historical repair path only');
console.log('PASS legacy chat confirmations remain V1-only compatibility behavior through the store → onlineBackend boundary');
// Execute actual delivery-confirmation helper with no credentials or Firebase.
// Version preconditions prevent a stale first/second confirmation from updating
// the transaction or selling the listing after a competing state change.
const { stripTypeScriptTypes } = await import('node:module');
function completionSection(startToken, endToken) {
  const start = transactionBackend.indexOf(startToken);
  const end = transactionBackend.indexOf(endToken, start);
  assert(start >= 0 && end > start, 'completion helper source unavailable');
  return transactionBackend.slice(start, end);
}
const completionSource = [
  completionSection('function sameTransactionIdentity(', '\nasync function loadCurrentTransaction('),
  completionSection('function actorConfirmationField(', '\nasync function commitDeliveryConfirmation('),
  completionSection('async function commitDeliveryConfirmation(', '\nexport const canonicalTransactionsBackend'),
].join('\n');
const observedCommits = [];
const confirmWithVersion = new Function('nowIso', 'canActOnTransaction', 'transactionStatusForAction',
  'patchWrite', 'assertReservationLockConsistent',
  stripTypeScriptTypes(completionSource) + '\nreturn commitDeliveryConfirmation;'
)(
  () => '2026-11-12T20:00:00.000Z',
  () => true,
  (transaction, actor) => actor === 'seller-a' && transaction.buyer_confirmed_at ? 'completed' : transaction.status,
  (_client, path, fields) => ({ update: path, fields }),
  async () => {},
);
const baseline = {
  id: 'tx-guarded', listing_id: 'listing-a', chat_id: 'chat-a',
  buyer_id: 'buyer-a', seller_id: 'seller-a', accepted_offer_id: 'offer-a',
  agreed_amount_mxn: 125, status: 'reserved', updated_at: '2026-11-12T19:00:00.000Z',
};
const TX_UPDATE_TIME = '2026-11-12T19:00:10.123456789Z';
function isolatedClient(transaction, canonical = { id: transaction.id, data: { ...transaction }, updateTime: TX_UPDATE_TIME }) {
  return {
    getDocument: async path => {
      assert.equal(path, 'transactions_v2/tx-guarded', 'only canonical transaction is read');
      return canonical;
    },
    commit: async writes => { observedCommits.push(writes); },
  };
}
const confirmedBuyer = await confirmWithVersion(isolatedClient(baseline), baseline, 'buyer-a');
assert.equal(confirmedBuyer.status, 'reserved');
assert.equal(observedCommits.length, 1);
assert.equal(observedCommits[0].length, 1);
assert.equal(observedCommits[0][0].currentDocument.updateTime, TX_UPDATE_TIME);
assert.equal(observedCommits[0][0].fields.buyer_confirmed_at, '2026-11-12T20:00:00.000Z');
const second = { ...baseline, buyer_confirmed_at: '2026-11-12T19:20:00.000Z' };
const completed = await confirmWithVersion(isolatedClient(second), second, 'seller-a');
assert.equal(completed.status, 'completed');
assert.equal(observedCommits[1].length, 2);
assert.equal(observedCommits[1][0].currentDocument.updateTime, TX_UPDATE_TIME,
  'second confirmation and sold_out must be in the same versioned commit');
assert.equal(observedCommits[1][1].fields.status, 'sold_out');
const beforeFailure = observedCommits.length;
for (const badCanonical of [
  { id: baseline.id, data: { ...baseline, status: 'disputed' }, updateTime: TX_UPDATE_TIME },
  { id: baseline.id, data: { ...baseline, seller_confirmed_at: '2026-11-12T19:10:00.000Z' }, updateTime: TX_UPDATE_TIME },
  { id: baseline.id, data: { ...baseline, updated_at: '2026-11-12T19:40:00.000Z' }, updateTime: TX_UPDATE_TIME },
]) {
  await assert.rejects(confirmWithVersion(isolatedClient(baseline, badCanonical), baseline, 'buyer-a'),
    /TRANSACTION_CHANGED/);
}
await assert.rejects(confirmWithVersion(isolatedClient(baseline, { id: baseline.id, data: baseline }), baseline, 'buyer-a'),
  /TRANSACTION_VERSION_UNKNOWN/);
assert.equal(observedCommits.length, beforeFailure, 'no write when server state or version is untrustworthy');
console.log('PASS both delivery confirmations use exact transaction updateTime; stale states cannot complete or sell listing (synthetic)');

console.log('V2 canonical completion contract: PASS');
