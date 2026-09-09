import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('scripts/firebase-ci-auth.mjs', 'utf8');

assert.match(source, /function redactOAuthDetail/);
for (const field of ['access_token', 'refresh_token', 'id_token', 'assertion', 'client_secret']) {
  assert.match(source, new RegExp(field));
}
assert.match(source, /\[REDACTED\]/);
assert.match(source, /redactOAuthDetail\(await response\.text\(\)\)/);
assert.doesNotMatch(source, /throw new Error\(`No se pudo intercambiar FIREBASE_TOKEN[^`]*\$\{await response\.text\(\)\}/);
assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*(?:refreshToken|explicit|access_token)/);

console.log('PASS Firebase CI OAuth failures redact token-like material before logging');
console.log('CI auth redaction contract: PASS');
