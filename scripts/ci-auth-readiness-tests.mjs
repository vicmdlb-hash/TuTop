import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ciAuthReadiness } from './ci-auth-readiness.mjs';

assert.deepEqual(ciAuthReadiness({ FIREBASE_TOKEN: 'legacy' }), {
  mode: 'legacy_firebase_token', ready: true, migration_ready: false, legacy_fallback_present: true,
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
assert.match(auth, /FIREBASE_TOKEN/);

console.log('PASS current FIREBASE_TOKEN remains a working fallback');
console.log('PASS externally-issued short-lived access token has precedence');
console.log('PASS WIF/ADC presence is detectable without pretending it is already wired');
console.log('CI auth migration readiness: PASS');
