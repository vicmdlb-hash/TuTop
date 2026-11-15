import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const generator = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs', 'utf8');

assert.match(rules, /function commerceAccountEligible\(uid\)/);
assert.match(rules, /!exists\(deletion\)[\s\S]*status == 'rejected'/);

for (const collection of ['products', 'favorites', 'seller_follows', 'demand_requests', 'saved_searches', 'bids']) {
  const section = rules.match(new RegExp(`match \\/${collection}\\/\\{[^}]+\\} \\{([\\s\\S]*?)(?=\\n    match \\/|\\n  \\})`));
  assert(section, `Falta seccion ${collection}`);
  assert.match(section[1], /allow create:[\s\S]*commerceAccountEligible\(request\.auth\.uid\)/, `${collection} debe cerrar admision al owner`);
}

for (const collection of ['chats', 'offers', 'transactions_v2']) {
  const section = rules.match(new RegExp(`match \\/${collection}\\/\\{[^}]+\\} \\{([\\s\\S]*?)(?=\\n    match \\/|\\n  \\})`));
  assert(section, `Falta seccion ${collection}`);
  assert.match(section[1], /commerceAccountsEligible\(request\.resource\.data\.buyer_id, request\.resource\.data\.seller_id\)/, `${collection} debe comprobar buyer y seller`);
}

assert.match(generator, /match \/listings_v2\/\{listingId\}[\s\S]*allow create:[\s\S]*commerceAccountEligible\(request\.auth\.uid\)/);
assert.doesNotMatch(rules.match(/match \/reviews\/\{reviewId\}[\s\S]*?(?=\n    match \/)/)?.[0] || '', /commerceAccountEligible/, 'Una reseña cierra una operación existente y debe seguir permitida');

console.log('PASS pending/processing/completed deletion requests close new marketplace admission');
console.log('PASS rejected deletion requests restore admission');
console.log('PASS active-operation completion surfaces remain available');
