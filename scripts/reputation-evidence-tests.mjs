import assert from 'node:assert/strict';
import { sellerReputationEvidence } from '../src/lib/reputationEvidence.ts';

const none = sellerReputationEvidence('seller-1', [], []);
assert.equal(none.hasEvidence, false);
assert.equal(none.positiveRate, null);
assert.equal(none.completedSales, 0);
assert.equal(none.label, 'Sin historial todavía');

const reviews = sellerReputationEvidence('seller-1', [
  { evaluado_id: 'seller-1', calificacion: 'positive' },
  { evaluado_id: 'seller-1', calificacion: 'positive' },
  { evaluado_id: 'seller-1', calificacion: 'negative' },
  { evaluado_id: 'other', calificacion: 'positive' },
], [
  { vendedor_id: 'seller-1', entrega_confirmada: true },
]);
assert.equal(reviews.reviewCount, 3);
assert.equal(reviews.positiveReviews, 2);
assert.equal(reviews.positiveRate, 67);
assert.equal(reviews.completedSales, 1);
assert.equal(reviews.label, '67% cumplió · 3 reseñas');

const deliveriesOnly = sellerReputationEvidence('seller-2', [], [
  { vendedor_id: 'seller-2', entrega_confirmada: true },
  { vendedor_id: 'seller-2', entrega_confirmada: false },
  { vendedor_id: 'seller-2', entrega_confirmada: true },
]);
assert.equal(deliveriesOnly.reviewCount, 0);
assert.equal(deliveriesOnly.completedSales, 2);
assert.equal(deliveriesOnly.label, '2 entregas confirmadas');
assert.equal(deliveriesOnly.hasEvidence, true);

console.log('Evidence-based reputation tests passed.');
