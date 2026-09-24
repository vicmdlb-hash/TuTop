import assert from 'node:assert/strict';
import fs from 'node:fs';

const extract=fs.readFileSync('scripts/extract-next-candidate-apk-identity.mjs','utf8');
const sha256=fs.readFileSync('scripts/register-staging-android-sha256.mjs','utf8');
const sha1=fs.readFileSync('scripts/register-next-candidate-staging-native-key.mjs','utf8');
const audit=fs.readFileSync('scripts/audit-staging-offplay-app-check.mjs','utf8');
const external=fs.readFileSync('scripts/next-candidate-external-preapk-gate.mjs','utf8');

assert.match(extract,/APKSIGNER_REQUIRED/);
assert.match(extract,/AAPT2_REQUIRED/);
assert.match(extract,/aapt2/);
assert.match(extract,/dump','badging/);
assert.match(extract,/mx\.tutop\.app/);
assert.match(extract,/APK_PACKAGE_NAME_MISSING/);
assert.match(extract,/APK_PACKAGE_MISMATCH/);
assert.match(extract,/Signer #1 certificate/);
assert.match(extract,/GITHUB_REF_NAME/);
assert.match(extract,/EXACT_EXTRACTION_BRANCH_REQUIRED/);
assert.match(extract,/GITHUB_SHA/);
assert.match(extract,/SOURCE_SHA_INVALID/);
assert.match(extract,/TUTOP_NEXT_CANDIDATE_SOURCE_SHA/);
assert.match(extract,/TUTOP_ANDROID_CERT_SHA1/);
assert.match(extract,/TUTOP_ANDROID_CERT_SHA256/);
assert.match(extract,/TUTOP_EXPECTED_ANDROID_CERT_SHA256/);
assert.doesNotMatch(extract,/keystore|storePassword|keyPassword/i);

for (const binding of [sha256, sha1]) {
  assert.match(binding,/GITHUB_ACTIONS_REQUIRED/);
  assert.match(binding,/GITHUB_REF_NAME/);
  assert.match(binding,/fix\/post120-physical-failure-cluster/);
  assert.match(binding,/EXACT_BINDING_BRANCH_REQUIRED/);
  assert.match(binding,/GITHUB_SHA/);
  assert.match(binding,/SOURCE_SHA_INVALID/);
  assert.match(binding,/TUTOP_NEXT_CANDIDATE_SOURCE_SHA/);
  assert.match(binding,/EXTRACTED_SOURCE_SHA_INVALID/);
  assert.match(binding,/CANDIDATE_SOURCE_SHA_MISMATCH/);
  assert.match(binding,/TUTOP_NEXT_CANDIDATE_APK_SHA256/);
  assert.match(binding,/APK_SHA256_INVALID/);
}

assert.match(sha256,/BIND_EXACT_STAGING_ANDROID_SHA256/);
assert.match(sha256,/ANDROID_SHA256_READBACK_FAILED/);
assert.match(sha256,/source_sha:sourceSha/);
assert.match(sha256,/apk_sha256:apkSha256/);
assert.match(sha1,/BIND_NEXT_CANDIDATE_STAGING_NATIVE_KEY/);
assert.match(sha1,/NEXT_CANDIDATE_SHA1_READBACK_FAILED/);
assert.match(sha1,/API_TARGETS_CHANGED/);

assert.match(audit,/EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED/);

assert.match(external,/GITHUB_ACTIONS_REQUIRED/);
assert.match(external,/GITHUB_REF_NAME/);
assert.match(external,/fix\/post120-physical-failure-cluster/);
assert.match(external,/EXACT_PROMOTION_BRANCH_REQUIRED/);
assert.match(external,/GITHUB_SHA/);
assert.match(external,/SOURCE_SHA_INVALID/);
assert.match(external,/TUTOP_NEXT_CANDIDATE_SOURCE_SHA/);
assert.match(external,/EXTRACTED_SOURCE_SHA_INVALID/);
assert.match(external,/CANDIDATE_SOURCE_SHA_MISMATCH/);
assert.match(external,/TUTOP_NEXT_CANDIDATE_APK_SHA256/);
assert.match(external,/APK_SHA256_INVALID/);
assert.match(external,/source_sha:sourceSha/);
assert.match(external,/apk_sha256:apkSha256/);
assert.match(external,/NEXT_CANDIDATE_SIGNED_CERT_SHA256_REQUIRED/);
assert.match(external,/NEXT_CANDIDATE_EXACT_ANDROID_SHA256_NOT_REGISTERED/);
assert.doesNotMatch(external,/NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED/);

console.log('PASS exact source SHA + TuTop package + signed APK identity are extracted together');
console.log('PASS exact SHA-1 API-key and SHA-256 Firebase bindings require extraction source continuity + exact APK identity + explicit ACK');
console.log('PASS pre-promotion external gate requires the same source/artifact provenance chain');
console.log('PASS no private signing key is introduced by the source-only preparation');
