import assert from 'node:assert/strict';
import fs from 'node:fs';
import { redactTopiRemoteText } from '../src/lib/topiPrivacy.ts';

const email = redactTopiRemoteText('Escríbeme a vendedor@example.com por favor');
assert.equal(email.text?.includes('vendedor@example.com'), false);
assert.ok(email.redactions.includes('email'));

const phone = redactTopiRemoteText('Mi WhatsApp: 2461234567');
assert.equal(phone.text?.includes('2461234567'), false);
assert.ok(phone.redactions.includes('phone'));

const formattedPhone = redactTopiRemoteText('Contacto 246 123 4567');
assert.equal(formattedPhone.text?.includes('246 123 4567'), false);
assert.ok(formattedPhone.redactions.includes('phone'));

const otp = redactTopiRemoteText('Código de verificación: 839201');
assert.equal(otp.text?.includes('839201'), false);
assert.ok(otp.redactions.includes('otp'));

const token = redactTopiRemoteText('Bearer abcdefghijklmnop.123456789');
assert.equal(token.text?.includes('abcdefghijklmnop.123456789'), false);
assert.ok(token.redactions.includes('token'));

const productFacts = redactTopiRemoteText('Vendo iPhone 13 de 128 GB en $12,500, batería 88%');
assert.equal(productFacts.text, 'Vendo iPhone 13 de 128 GB en $12,500, batería 88%');
assert.deepEqual(productFacts.redactions, []);

const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
const provider = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');

assert.match(publish, /locationOptIn\?: boolean/);
assert.match(publish, /const \[locationOptIn, setLocationOptIn\]/);
assert.match(publish, /const location = locationOptIn \? approxLocation : null/);
assert.doesNotMatch(publish, /approxLocation \|\| await requestApproxLocation/);
assert.match(publish, /Hay una ubicación aproximada disponible en este dispositivo, pero no se incluirá en este anuncio/);
assert.match(publish, /Quitar/);
assert.match(publish, /TuTop no adjunta automáticamente fotos, tokens ni ubicación del dispositivo a Topi/);
assert.match(publish, /result\.privacyRedactions/);

assert.match(provider, /redactTopiRemoteText\(context\.prompt, 1200\)/);
assert.match(provider, /redactTopiRemoteText\(draft\.titulo, 120\)/);
assert.match(provider, /redactTopiRemoteText\(draft\.descripcion, 1200\)/);
assert.match(provider, /prompt: privacy\.prompt/);
assert.doesNotMatch(provider, /prompt: String\(context\.prompt \|\| ''\)\.slice/);

const nearby = fs.readFileSync('src/lib/nearbyMarketplace.ts', 'utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx', 'utf8');
assert.match(nearby, /export function clearCachedApproxLocation\(\)/);
assert.match(nearby, /localStorage\.removeItem\(LOCATION_KEY\)/);
assert.match(gate, /clearCachedApproxLocation/);
const clearIndex = gate.indexOf('clearCachedApproxLocation()');
const authClearIndex = gate.indexOf('verifiedEmailBetaAuth.signOut()', clearIndex);
assert(clearIndex >= 0 && authClearIndex > clearIndex, 'location cache must be cleared at the account boundary before auth teardown');

console.log('PASS post-build116 privacy: explicit listing-location opt-in + conservative Topi remote PII redaction');
