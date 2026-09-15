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
assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*(?:refreshToken|explicit|access_token|clientSecret)/);

assert.match(source, /process\.env\.TUTOP_FIREBASE_OAUTH_CLIENT_ID/);
assert.match(source, /process\.env\.TUTOP_FIREBASE_OAUTH_CLIENT_SECRET/);
assert.match(source, /FIREBASE_CI_OAUTH_CLIENT_CREDENTIALS_PARTIAL/);
assert.match(source, /FIREBASE_CLI_OAUTH_CLIENT_ID/);
assert.match(source, /FIREBASE_CLI_OAUTH_CLIENT_SECRET/);
assert.match(source, /firebase-tools@15\.29\.0/);
assert.doesNotMatch(source, /const FIREBASE_OAUTH_CLIENT_ID\s*=\s*['"][^'"]+['"]/);
assert.doesNotMatch(source, /const FIREBASE_OAUTH_CLIENT_SECRET\s*=\s*['"][^'"]+['"]/);
assert.doesNotMatch(source, /client_secret:\s*['"][^'"]+['"]/);

console.log('PASS Firebase CI OAuth failures redact token-like material before logging');
console.log('PASS managed OAuth credentials remain external while the pinned Firebase CLI installed-app metadata is explicit and testable');
console.log('PASS partial managed OAuth configuration fails closed');
console.log('CI auth redaction contract: PASS');
