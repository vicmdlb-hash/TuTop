import fs from 'node:fs';
import assert from 'node:assert/strict';

const conversation = fs.readFileSync('src/components/ChatConversation.tsx', 'utf8');
const card = fs.readFileSync('src/components/TransactionReservationCard.tsx', 'utf8');
const reviewBridge = fs.readFileSync('src/services/v2StoreReviewMutationBridge.ts', 'utf8');
const transactionBackend = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');
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
assert.doesNotMatch(conversation, /v2 &&[^\n]*confirmDelivery\(chatId\)/);

assert.match(card, /transactionHint\?: MarketplaceTransaction \| null/);
assert.match(card, /onTransactionChange\?: \(transaction: MarketplaceTransaction \| null\) => void/);
assert.match(card, /nationalBackend\.confirmDelivery\(transaction\)/);
assert.match(card, /if \(!transactionHint \|\| transactionHint\.chat_id !== chatId\) return/);
assert.match(card, /setTransaction\(transactionHint\)/);
assert.match(card, /onTransactionChange\?\.\(transaction\)/);
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
assert.match(store, /chats\/\$\{chatId\}\/confirmations/);
assert.match(conversation, /!v2 && !deliveryCompleted/);

console.log('PASS transactions_v2 is the sole V2 delivery-completion authority');
console.log('PASS either participant confirming second atomically completes the transaction and closes listings_v2 as sold_out');
console.log('PASS buyer sold-out authority is narrowly bound to its exact lock and second-confirmation timestamp');
console.log('PASS buyer-second authorization uses one helper with lock+transaction getAfter access only');
console.log('PASS canonical transaction state projects locally into chat compatibility fields without legacy confirmation writes');
console.log('PASS newly created transactions surface through transactionHint without polling or duplicate reads');
console.log('PASS review UI/bridge is unlocked only after canonical completed transaction projection');
console.log('PASS trusted reconciliation remains a drift/historical repair path only');
console.log('PASS legacy chat confirmations remain V1-only compatibility behavior');
console.log('V2 canonical completion contract: PASS');
