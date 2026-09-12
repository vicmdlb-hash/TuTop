import assert from 'node:assert/strict';
import { savedSearchNotificationDecision } from '../src/lib/savedSearchNotifications.ts';

const product = {
  titulo: 'Calculadora Casio científica FX-991',
  descripcion: 'Buen estado para ingeniería',
  categoria: 'Electrónica',
  marca: 'Casio',
  modelo: 'FX-991',
  precio_mxn: 450,
  estado: 'Activo',
  institution_id: 'uatx',
  campus_id: 'uatx-riberena',
  visibility_scope: 'campus',
};

const search = {
  query: 'calculadora casio',
  category: 'Electrónica',
  max_price_mxn: 500,
  institution_id: 'uatx',
  campus_id: 'uatx-riberena',
  visibility_scope: 'campus',
  notifications_enabled: true,
};

assert.deepEqual(savedSearchNotificationDecision(search, product), { eligible: true, reason: 'matched' });
assert.equal(savedSearchNotificationDecision({ ...search, notifications_enabled: false }, product).reason, 'notifications_disabled');
assert.equal(savedSearchNotificationDecision(search, { ...product, estado: 'Vendido' }).reason, 'listing_not_active');
assert.equal(savedSearchNotificationDecision(search, { ...product, precio_mxn: 501 }).reason, 'price_above_limit');
assert.equal(savedSearchNotificationDecision({ ...search, query: 'iphone' }, product).reason, 'query_mismatch');
assert.equal(savedSearchNotificationDecision(search, { ...product, campus_id: 'otro-campus' }).reason, 'campus_mismatch');
assert.equal(savedSearchNotificationDecision({ ...search, campus_id: undefined, visibility_scope: 'institution' }, { ...product, campus_id: 'otro-campus' }).eligible, true);
assert.equal(savedSearchNotificationDecision({ ...search, campus_id: undefined, institution_id: 'buap', visibility_scope: 'institution' }, product).reason, 'institution_mismatch');
assert.equal(savedSearchNotificationDecision({ ...search, campus_id: undefined, institution_id: undefined, visibility_scope: 'national' }, { ...product, visibility_scope: 'campus' }).reason, 'scope_national_mismatch');
assert.equal(savedSearchNotificationDecision({ ...search, campus_id: undefined, institution_id: undefined, visibility_scope: 'national' }, { ...product, visibility_scope: 'national' }).eligible, true);

console.log('PASS disabled alerts never notify');
console.log('PASS query/category/price constraints gate notifications');
console.log('PASS campus and institution scopes remain isolated');
console.log('PASS national alerts require national listings');
console.log('Saved-search notification tests: PASS');
