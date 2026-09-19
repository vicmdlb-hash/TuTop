import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeTopiStructuredAttributes } from '../src/lib/topiStructuredAttributes.ts';

const comida = sanitizeTopiStructuredAttributes({
  ingredients: 'chocolate, leche, huevo',
  allergens: 'huevo y leche',
  availability: 'hoy 14:00–18:00',
  phone: '246 123 4567',
  unknown_private: 'secret',
}, 'Postres', 'Brownies con chocolate, leche y huevo. Contiene huevo y leche. Disponibles hoy 14:00–18:00.');
assert.deepEqual(comida, {
  ingredients: 'chocolate, leche, huevo',
  allergens: 'huevo y leche',
  availability: 'hoy 14:00–18:00',
});

const inventedAllergen = sanitizeTopiStructuredAttributes({
  ingredients: 'avena y plátano',
  allergens: 'nueces',
  availability: 'hoy',
}, 'Comida', 'Vendo avena con plátano, disponible hoy.');
assert.equal(inventedAllergen?.allergens, undefined, 'allergens need explicit user evidence');

const unsupportedNone = sanitizeTopiStructuredAttributes({
  allergens: 'ninguno conocido',
}, 'Comida', 'Vendo galletas caseras.');
assert.equal(unsupportedNone, undefined, 'model cannot invent “no allergens”');

const supportedNone = sanitizeTopiStructuredAttributes({
  allergens: 'ninguno conocido',
}, 'Comida', 'Galletas caseras; no contiene alérgenos conocidos.');
assert.equal(supportedNone?.allergens, 'ninguno conocido');

const rentExact = sanitizeTopiStructuredAttributes({
  monthly_price: 2800,
  deposit: 2800,
  included_services: 'agua e internet',
  approximate_zone: 'Calle Reforma 123',
  campus_distance: '10 min',
  room_type: 'individual',
}, 'Cuartos & Renta', 'Cuarto individual a 10 min del campus, zona Calle Reforma 123, incluye agua e internet, renta y depósito 2800.');
assert.equal(rentExact?.approximate_zone, undefined, 'exact-looking address must be rejected');
assert.equal(rentExact?.monthly_price, 2800);
assert.equal(rentExact?.campus_distance, '10 min');

const rentZone = sanitizeTopiStructuredAttributes({
  approximate_zone: 'zona centro, a 10 min del campus',
  campus_distance: '10 min',
  room_type: 'individual',
}, 'Cuartos & Renta', 'Cuarto individual por zona centro, a 10 min del campus.');
assert.equal(rentZone?.approximate_zone, 'zona centro, a 10 min del campus');

const transport = sanitizeTopiStructuredAttributes({
  origin_zone: 'centro',
  destination_zone: 'campus principal',
  departure_window: '06:45–07:00',
  rideshare_cost_share: 35,
  available_seats: 3,
  extra: 'ignored',
}, 'Transporte', 'Salgo del centro al campus principal entre 06:45 y 07:00, cooperación 35, tengo 3 lugares.');
assert.equal(transport?.rideshare_cost_share, 35);
assert.equal((transport as any)?.extra, undefined);

const assistant = fs.readFileSync('src/services/assistantProvider.ts','utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
assert.match(assistant, /sanitizeTopiStructuredAttributes/);
assert.match(assistant, /structured_fields/);
assert.match(assistant, /"attributes":object\?/);
assert.match(assistant, /Nunca inventes alérgenos/);
assert.match(publish, /\{ \.\.\.suggestion\.attributes, \.\.\.current \}/, 'manual user values must win over AI suggestions');
assert.match(publish, /setAdvancedOpen\(true\)/);

console.log('PASS Topi structured compose allowlists category fields, requires explicit safety evidence and preserves manual user values');
