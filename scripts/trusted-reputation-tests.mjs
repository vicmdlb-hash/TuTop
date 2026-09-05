import assert from 'node:assert/strict';
import { aggregateTrustedReputation } from '../src/lib/trustedReputation.ts';

const aggregate = aggregateTrustedReputation({
  subjectUid: 'user-1',
  transactions: [
    { chat_id: 'seller-good', buyer_id: 'buyer-a', seller_id: 'user-1', status: 'completed' },
    { chat_id: 'seller-bad', buyer_id: 'buyer-b', seller_id: 'user-1', status: 'completed' },
    { chat_id: 'buyer-good', buyer_id: 'user-1', seller_id: 'seller-a', status: 'completed' },
    { chat_id: 'cancelled', buyer_id: 'user-1', seller_id: 'seller-b', status: 'cancelled' },
    { chat_id: 'no-show', buyer_id: 'buyer-c', seller_id: 'user-1', status: 'no_show' },
    { chat_id: 'other', buyer_id: 'someone', seller_id: 'another', status: 'completed' },
  ],
  reviews: [
    { chat_id: 'seller-good', evaluado_id: 'user-1', calificacion: 'positive' },
    { chat_id: 'seller-bad', evaluado_id: 'user-1', calificacion: 'negative' },
    { chat_id: 'buyer-good', evaluado_id: 'user-1', calificacion: 'positive' },
    { chat_id: 'cancelled', evaluado_id: 'user-1', calificacion: 'positive' },
    { chat_id: 'other', evaluado_id: 'user-1', calificacion: 'positive' },
    { chat_id: 'seller-good', evaluado_id: 'someone-else', calificacion: 'positive' },
  ],
  reportsUpheld: 2.9,
});

assert.equal(aggregate.completed_transactions, 3);
assert.equal(aggregate.completed_as_seller, 2);
assert.equal(aggregate.completed_as_buyer, 1);
assert.equal(aggregate.seller_review_count, 2);
assert.equal(aggregate.seller_positive_count, 1);
assert.equal(aggregate.seller_positive_rate, 50);
assert.equal(aggregate.buyer_review_count, 1);
assert.equal(aggregate.buyer_positive_count, 1);
assert.equal(aggregate.buyer_positive_rate, 100);
assert.equal(aggregate.cancellations, 1);
assert.equal(aggregate.no_shows, 1);
assert.equal(aggregate.reports_upheld, 2);

const empty = aggregateTrustedReputation({ subjectUid: 'empty', transactions: [], reviews: [] });
assert.equal(empty.completed_transactions, 0);
assert.equal(empty.seller_positive_rate, null);
assert.equal(empty.buyer_positive_rate, null);
assert.equal(empty.reports_upheld, 0);

const untrustedReviewCannotCreateEvidence = aggregateTrustedReputation({
  subjectUid: 'user-2',
  transactions: [{ chat_id: 'pending-chat', buyer_id: 'buyer', seller_id: 'user-2', status: 'reserved' }],
  reviews: [{ chat_id: 'pending-chat', evaluado_id: 'user-2', calificacion: 'positive' }],
});
assert.equal(untrustedReviewCannotCreateEvidence.seller_review_count, 0);
assert.equal(untrustedReviewCannotCreateEvidence.seller_positive_rate, null);

console.log('PASS trusted reputation counts completed participant transactions only');
console.log('PASS seller and buyer evidence remain role-separated');
console.log('PASS reviews without completed transaction evidence are ignored');
console.log('Trusted reputation aggregation tests: PASS');
