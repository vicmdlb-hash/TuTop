import assert from 'node:assert/strict';
import { inAppNotificationDestination } from '../src/lib/inAppNotificationRouting.ts';

const base = {
  id: 'n1',
  kind: 'system',
  title: 'TuTop',
  body: 'Evento',
  created_at: '2026-09-21T00:00:00.000Z',
  read: false,
};

assert.deepEqual(inAppNotificationDestination({ ...base, kind: 'message', chat_id: 'chat-1', product_id: 'listing-1' }), { kind: 'chat', chatId: 'chat-1' });
assert.deepEqual(inAppNotificationDestination({ ...base, product_id: 'listing-1' }), { kind: 'product', productId: 'listing-1' });
assert.deepEqual(inAppNotificationDestination({ ...base, transaction_id: 'tx-1' }), { kind: 'transaction', transactionId: 'tx-1' });
assert.deepEqual(inAppNotificationDestination({ ...base, kind: 'search', saved_search_id: 'search-1' }), { kind: 'tab', tab: 'feed' });
assert.deepEqual(inAppNotificationDestination({ ...base, kind: 'offer', offer_id: 'offer-1' }), { kind: 'tab', tab: 'inbox' });
assert.deepEqual(inAppNotificationDestination({ ...base, kind: 'reservation' }), { kind: 'tab', tab: 'inbox' });
assert.deepEqual(inAppNotificationDestination({ ...base, kind: 'verification' }), { kind: 'tab', tab: 'profile' });
assert.deepEqual(inAppNotificationDestination({ ...base, kind: 'system' }), { kind: 'none' });

console.log('PASS in-app notification routing covers chat, listing, transaction, saved search, offer/reservation and verification destinations');
