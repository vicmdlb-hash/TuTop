import assert from 'node:assert/strict';
import { deterministicMarketplaceNotificationId, projectMarketplaceNotifications } from './marketplace-notification-projection-lib.mjs';

const now = Date.parse('2026-09-16T03:00:00.000Z');
const chats = [{ id: 'chat-1', participants: ['buyer-1', 'seller-1'], product_id: 'listing-1' }];
const messages = [{ id: 'msg-1', chat_id: 'chat-1', sender_id: 'buyer-1', text: '¿Sigue disponible?', created_at: '2026-09-16T02:59:00.000Z' }];
const offers = [
  { id: 'offer-1', listing_id: 'listing-1', chat_id: 'chat-1', buyer_id: 'buyer-1', seller_id: 'seller-1', created_by: 'buyer-1', amount_mxn: 450, status: 'pending', created_at: '2026-09-16T02:58:00.000Z', updated_at: '2026-09-16T02:58:00.000Z' },
  { id: 'offer-2', listing_id: 'listing-1', chat_id: 'chat-1', buyer_id: 'buyer-1', seller_id: 'seller-1', created_by: 'seller-1', amount_mxn: 500, parent_offer_id: 'offer-1', status: 'pending', created_at: '2026-09-16T02:57:00.000Z', updated_at: '2026-09-16T02:57:00.000Z' },
];
const transactions = [{ id: 'tx-1', listing_id: 'listing-1', chat_id: 'chat-1', buyer_id: 'buyer-1', seller_id: 'seller-1', status: 'reserved', created_at: '2026-09-16T02:56:00.000Z', updated_at: '2026-09-16T02:56:00.000Z' }];

const projected = projectMarketplaceNotifications({ chats, messages, offers, transactions, now, lookbackMs: 3600_000 });
assert.equal(projected.length, 5, 'message + offer + counter + 2 reservation notifications');

const message = projected.find((item) => item.kind === 'new_message');
assert.equal(message?.recipient_uid, 'seller-1');
assert.equal(message?.chat_id, 'chat-1');
assert.equal(message?.listing_id, 'listing-1');

const offer = projected.find((item) => item.kind === 'offer_received');
assert.equal(offer?.recipient_uid, 'seller-1');
assert.match(offer?.body || '', /450/);

const counter = projected.find((item) => item.kind === 'counter_offer');
assert.equal(counter?.recipient_uid, 'buyer-1');

const reservations = projected.filter((item) => item.kind === 'reservation_created');
assert.deepEqual(new Set(reservations.map((item) => item.recipient_uid)), new Set(['buyer-1', 'seller-1']));
assert.ok(reservations.every((item) => item.transaction_id === 'tx-1'));

assert.equal(
  deterministicMarketplaceNotificationId('new_message', 'chat-1/msg-1', 'seller-1'),
  deterministicMarketplaceNotificationId('new_message', 'chat-1/msg-1', 'seller-1'),
  'notification IDs must be deterministic',
);

const duplicateInput = projectMarketplaceNotifications({ chats, messages: [...messages, ...messages], offers: [...offers, ...offers], transactions: [...transactions, ...transactions], now, lookbackMs: 3600_000 });
assert.equal(duplicateInput.length, projected.length, 'duplicate scans must collapse to deterministic IDs');

const invalid = projectMarketplaceNotifications({
  chats,
  messages: [{ id: 'bad', chat_id: 'chat-1', sender_id: 'attacker', text: 'x', created_at: '2026-09-16T02:59:00.000Z' }],
  offers: [{ id: 'bad-offer', buyer_id: 'buyer-1', seller_id: 'seller-1', created_by: 'attacker', status: 'pending', updated_at: '2026-09-16T02:59:00.000Z' }],
  transactions: [],
  now,
  lookbackMs: 3600_000,
});
assert.equal(invalid.length, 0, 'non-participant actors must never project notifications');

console.log('✅ Marketplace notification projection tests PASS');
