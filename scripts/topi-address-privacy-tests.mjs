import assert from 'node:assert/strict';
import { redactTopiRemoteText } from '../src/lib/topiPrivacy.ts';

// Remote Topi receives user-entered text, not only structured public listing fields.
const samples = [
  ['Vivo en calle 5 de Mayo 123, colonia Centro', '5 de Mayo 123'],
  ['Entregar en avenida Juárez número 45', 'Juárez número 45'],
  ['Mi dirección es privada los Pinos 24, por favor', 'los Pinos 24'],
];
for (const [input, secret] of samples) {
  const output = redactTopiRemoteText(input);
  assert(!output.text?.includes(secret), `street address survived remote redaction: ${secret}`);
  assert(output.redactions.includes('address'), 'address redaction must be observable without logging PII');
}

const productFacts = 'Vendo iPhone 13 de 128 GB en $12,500, batería 88%';
assert.equal(redactTopiRemoteText(productFacts).text, productFacts, 'ordinary product facts must remain');

const email = redactTopiRemoteText('contacto vendedor@example.com');
assert(!email.text?.includes('vendedor@example.com'));
assert(email.redactions.includes('email'));


const clippingBoundaryCases = [
  ['X'.repeat(72) + ' cliente@example.com', 'email', 'cliente@'],
  ['X'.repeat(72) + ' 2461234567', 'phone', '246123'],
  ['X'.repeat(72) + ' avenida Reforma 123', 'address', 'avenida'],
  ['X'.repeat(72) + ' sk-proj-abcdefghijklmnop12345', 'token', 'sk-proj'],
];
for (const [input, label, exposed] of clippingBoundaryCases) {
  const output = redactTopiRemoteText(input, 80);
  assert(output.redactions.includes(label),
    `remote redactor must detect ${label} even when its span crosses the outbound limit`);
  assert(!output.text?.includes(exposed),
    `remote redactor must not expose a partial ${label} before clipping`);
  assert((output.text?.length || 0) <= 80, 'remote text must respect its outbound cap');
}
assert.equal(redactTopiRemoteText('Vendo laptop con 256 GB', 80).text, 'Vendo laptop con 256 GB',
  'safe product text remains unchanged');

console.log('PASS Topi remote text address redaction (source-only; no provider or device acceptance)');
