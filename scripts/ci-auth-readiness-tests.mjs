import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ciAuthReadiness } from './ci-auth-readiness.mjs';

assert.deepEqual(ciAuthReadiness({ FIREBASE_TOKEN: 'legacy' }), {
  mode: 'firebase_cli_refresh_token', ready: true, migration_ready: false, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({
  FIREBASE_TOKEN: 'legacy',
  TUTOP_FIREBASE_OAUTH_CLIENT_ID: 'managed-id',
  TUTOP_FIREBASE_OAUTH_CLIENT_SECRET: 'managed-secret',
}), {
  mode: 'managed_firebase_refresh_token', ready: true, migration_ready: false, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({
  FIREBASE_TOKEN: 'legacy',
  TUTOP_FIREBASE_OAUTH_CLIENT_ID: 'managed-id',
}), {
  mode: 'refresh_token_partial_oauth_client_credentials', ready: false, migration_ready: false, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({ TUTOP_FIREBASE_ACCESS_TOKEN: 'short', FIREBASE_TOKEN: 'legacy' }), {
  mode: 'short_lived_access_token', ready: true, migration_ready: true, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({ GOOGLE_GHA_CREDS_PATH: '/tmp/wif.json' }), {
  mode: 'wif_adc_credentials_present', ready: false, migration_ready: true, legacy_fallback_present: false,
});
assert.equal(ciAuthReadiness({}).mode, 'missing');

const auth = fs.readFileSync('scripts/firebase-ci-auth.mjs', 'utf8');
assert.match(
  auth,
  /const explicit = String\(process\.env\.TUTOP_FIREBASE_ACCESS_TOKEN[\s\S]*if \(explicit\) return explicit;[\s\S]*const refreshToken = String\(process\.env\.FIREBASE_TOKEN/,
  'short-lived token must remain preferred before refresh-token exchange',
);
assert.match(auth, /TUTOP_FIREBASE_OAUTH_CLIENT_ID/);
assert.match(auth, /TUTOP_FIREBASE_OAUTH_CLIENT_SECRET/);
assert.match(auth, /FIREBASE_CI_OAUTH_CLIENT_CREDENTIALS_PARTIAL/);
assert.match(auth, /FIREBASE_CLI_OAUTH_CLIENT_ID/);
assert.match(auth, /FIREBASE_CLI_OAUTH_CLIENT_SECRET/);
assert.doesNotMatch(auth, /const FIREBASE_OAUTH_CLIENT_(?:ID|SECRET)\s*=\s*['"][^'"]+['"]/);

console.log('PASS FIREBASE_TOKEN alone is ready through the pinned Firebase CLI installed-app refresh flow');
console.log('PASS managed refresh-token credentials override the CLI metadata when fully configured');
console.log('PASS partial managed OAuth configuration fails closed');
console.log('PASS externally-issued short-lived access token has precedence');
console.log('PASS WIF/ADC presence is detectable without pretending it is already wired');
console.log('CI auth migration readiness: PASS');
