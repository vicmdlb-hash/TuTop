import fs from 'node:fs';
import assert from 'node:assert/strict';

const screen=fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const backend=fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const network=fs.readFileSync('src/lib/universityNetwork.ts','utf8');

assert.doesNotMatch(screen,/nationalShippingValid/,'UI must not hard-block national visibility when shipping is off');
assert.doesNotMatch(screen,/LISTING_NATIONAL_SHIPPING_REQUIRED/,'UI must not retain the retired national-shipping error contract');
assert.doesNotMatch(screen,/Para publicar en Todo México debes activar Envío externo acordado/);
assert.doesNotMatch(backend,/LISTING_NATIONAL_SHIPPING_REQUIRED/,'backend must not conflate visibility scope with delivery method');
assert.doesNotMatch(backend,/visibility_scope === ['"]national['"][\s\S]{0,80}shipping_available/);
assert.match(screen,/if \(!deliveryMethods\.length\) return setMessage\('Selecciona al menos una forma de entrega\.'\);/);
assert.match(backend,/LISTING_DELIVERY_INVALID/,'at least one delivery method remains mandatory');
assert.match(network,/Todo México[\s\S]*elige una forma de entrega que realmente puedas cumplir/);

console.log('PASS national visibility and shipping are independent');
console.log('PASS publication still requires at least one explicit delivery method');
console.log('PASS UI copy matches backend publication policy');
