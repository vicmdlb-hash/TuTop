import assert from 'node:assert/strict';
import fs from 'node:fs';
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


const disguisedAddress = redactTopiRemoteText('Entregar en zona Reforma 123, por favor');
assert(!disguisedAddress.text?.includes('Reforma 123'),
  'an unprefixed house number disguised as an approximate zone must be omitted');
assert(disguisedAddress.redactions.includes('address'));
const disguisedColonyAddress = redactTopiRemoteText('Paso por colonia Los Pinos 24');
assert(!disguisedColonyAddress.text?.includes('Los Pinos 24'));
assert(disguisedColonyAddress.redactions.includes('address'));
for (const coarse of ['Cuarto en zona centro a 10 min del campus', 'Cuarto en zona 20 de Noviembre', 'Zona centro 24/7']) {
  const result = redactTopiRemoteText(coarse);
  assert.equal(result.text, coarse, 'do not mask valid neighborhood, distance or availability facts');
}


const labeledCredentials = [
  ['Mi contraseña: ClaveSegura9347, vendo bicicleta', 'ClaveSegura9347'],
  ['Mi password=AbcX9300!; busco una laptop', 'AbcX9300!'],
  ['Mi PIN: 8877, necesito comprar algo', '8877'],
  ['Clave de acceso: correct horse battery staple; no publicar', 'horse battery staple'],
  ['Mi contraseña es ClaveSegura9347, vendo bicicleta', 'ClaveSegura9347'],
  ['Mi PIN de acceso es 8877, necesito comprar algo', '8877'],
  ['Mi clave secreta es correct horse battery staple; no publicar', 'horse battery staple'],
];
for (const [input, secret] of labeledCredentials) {
  const output = redactTopiRemoteText(input);
  assert(!output.text?.includes(secret), 'labeled credential must not be sent to remote AI');
  assert(output.redactions.includes('credential'), 'labeled credential must produce redaction evidence');
}
const productUnchanged = 'Vendo router con clave WiFi impresa en la caja y 4 puertos';
assert.equal(redactTopiRemoteText(productUnchanged).text, productUnchanged,
  'ordinary product description should not be mistaken for a disclosed credential');

// Topi Help previously truncated typed text before using this redactor.
// Every span crossing its 900-character outbound limit must be fully detected.
const helpService = fs.readFileSync('src/services/topiConsumerSupport.ts', 'utf8');
const helpNormalizer = helpService.slice(
  helpService.indexOf('function safeQuestion('), helpService.indexOf('function resolveRoute('),
);
assert(helpNormalizer.includes('function safeQuestion('), 'support question normalizer must exist');
assert.doesNotMatch(helpNormalizer, /\.slice\(0,\s*900\)/,
  'Topi Help must not clip its question before PII redaction');
assert.match(helpService, /redactTopiRemoteText\(clean,\s*900\)/,
  'remote support text must still enforce the 900-character cap after redaction');
const helpBoundaryCases = [
  ['X'.repeat(892) + ' correo@example.com', 'email', 'correo@'],
  ['X'.repeat(892) + ' 2461234567', 'phone', '246123'],
  ['X'.repeat(892) + ' OTP: 481593', 'otp', '481593'],
  ['X'.repeat(892) + ' sk-proj-abcdefghijklmnop12345', 'token', 'sk-proj'],
  ['X'.repeat(892) + ' calle Reforma 123', 'address', 'Reforma'],
  ['X'.repeat(892) + ' mi contraseña es ClaveSegura9347', 'credential', 'ClaveSegura'],
];
for (const [input, redaction, fragment] of helpBoundaryCases) {
  const sanitized = redactTopiRemoteText(input, 900);
  assert(sanitized.redactions.includes(redaction), `missing Topi Help ${redaction} boundary redaction`);
  assert(!sanitized.text?.includes(fragment), `partial ${redaction} leaked into Topi Help prompt`);
  assert((sanitized.text?.length || 0) <= 900, 'Topi Help must retain its outbound size limit');
}

console.log('PASS Topi remote text address redaction (source-only; no provider or device acceptance)');
