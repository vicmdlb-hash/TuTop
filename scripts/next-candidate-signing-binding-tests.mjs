import assert from 'node:assert/strict';
import fs from 'node:fs';

const extract=fs.readFileSync('scripts/extract-next-candidate-apk-identity.mjs','utf8');
const sha256=fs.readFileSync('scripts/register-staging-android-sha256.mjs','utf8');
const sha1=fs.readFileSync('scripts/register-next-candidate-staging-native-key.mjs','utf8');
const audit=fs.readFileSync('scripts/audit-staging-offplay-app-check.mjs','utf8');
const external=fs.readFileSync('scripts/next-candidate-external-preapk-gate.mjs','utf8');

assert.match(extract,/APKSIGNER_REQUIRED/);
assert.match(extract,/Signer #1 certificate/);
assert.match(extract,/TUTOP_ANDROID_CERT_SHA1/);
assert.match(extract,/TUTOP_ANDROID_CERT_SHA256/);
assert.match(extract,/TUTOP_EXPECTED_ANDROID_CERT_SHA256/);
assert.doesNotMatch(extract,/keystore|storePassword|keyPassword/i);

assert.match(sha256,/BIND_EXACT_STAGING_ANDROID_SHA256/);
assert.match(sha256,/ANDROID_SHA256_READBACK_FAILED/);
assert.match(sha1,/BIND_NEXT_CANDIDATE_STAGING_NATIVE_KEY/);
assert.match(sha1,/NEXT_CANDIDATE_SHA1_READBACK_FAILED/);
assert.match(sha1,/API_TARGETS_CHANGED/);

assert.match(audit,/EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED/);
assert.match(external,/NEXT_CANDIDATE_SIGNED_CERT_SHA256_REQUIRED/);
assert.match(external,/NEXT_CANDIDATE_EXACT_ANDROID_SHA256_NOT_REGISTERED/);
assert.doesNotMatch(external,/NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED/);

console.log('PASS future candidate signing identity is extracted from the exact signed APK');
console.log('PASS exact SHA-1 API-key and SHA-256 Firebase bindings are guarded and read back before promotion');
console.log('PASS no private signing key is introduced by the source-only preparation');
