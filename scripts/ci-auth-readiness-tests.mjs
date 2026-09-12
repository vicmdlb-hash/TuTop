import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ciAuthReadiness } from './ci-auth-readiness.mjs';

assert.deepEqual(ciAuthReadiness({ FIREBASE_TOKEN: 'legacy' }), {
  mode: 'refresh_token_missing_oauth_client_credentials', ready: false, migration_ready: false, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({
  FIREBASE_TOKEN: 'legacy',
  TUTOP_FIREBASE_OAUTH_CLIENT_ID: 'managed-id',
  TUTOP_FIREBASE_OAUTH_CLIENT_SECRET: 'managed-secret',
}), {
  mode: 'managed_firebase_refresh_token', ready: true, migration_ready: false, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({ TUTOP_FIREBASE_ACCESS_TOKEN: 'short', FIREBASE_TOKEN: 'legacy' }), {
  mode: 'short_lived_access_token', ready: true, migration_ready: true, legacy_fallback_present: true,
});
assert.deepEqual(ciAuthReadiness({ GOOGLE_GHA_CREDS_PATH: '/tmp/wif.json', FIREBASE_TOKEN: 'legacy' }), {
  mode: 'wif_adc_credentials_present', ready: false, migration_ready: true, legacy_fallback_present: true,
});
assert.equal(ciAuthReadiness({}).mode, 'missing');

const auth = fs.readFileSync('scripts/firebase-ci-auth.mjs', 'utf8');
assert(auth.indexOf('TUTOP_FIREBASE_ACCESS_TOKEN') < auth.indexOf('FIREBASE_TOKEN'), 'short-lived token must remain preferred');
assert.match(auth, /TUTOP_FIREBASE_OAUTH_CLIENT_ID/);
assert.match(auth, /TUTOP_FIREBASE_OAUTH_CLIENT_SECRET/);
assert.match(auth, /FIREBASE_CI_OAUTH_CLIENT_CREDENTIALS_MISSING/);
assert.doesNotMatch(auth, /const FIREBASE_OAUTH_CLIENT_(?:ID|SECRET)\s*=\s*['"][^'"]+['"]/);

console.log('PASS FIREBASE_TOKEN alone is fail-closed without externally managed OAuth client credentials');
console.log('PASS managed refresh-token fallback requires client ID + client secret from environment');
console.log('PASS externally-issued short-lived access token has precedence');
console.log('PASS WIF/ADC presence is detectable without pretending it is already wired');
console.log('CI auth migration readiness: PASS');
