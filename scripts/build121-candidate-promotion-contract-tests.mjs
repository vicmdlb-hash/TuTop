import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow=fs.readFileSync('.github/workflows/build121-post120-physical-repair.yml','utf8');
const packager=fs.readFileSync('scripts/package-build121-candidate.mjs','utf8');

assert.match(workflow,/candidate\/tutop-121-post120-physical-repair/);
assert.match(workflow,/ops\/build121-post120-physical-repair\.trigger/);
assert.match(workflow,/PROMOTE_TUTOP_BUILD121_FROM_PR120_GREEN/);
assert.match(workflow,/TUTOP_BETA_VERSION:\s*0\.9\.2-beta\.11/);
assert.match(workflow,/TUTOP_ANDROID_VERSION_CODE:\s*90215/);
assert.match(workflow,/TUTOP_AI_APP_CHECK_REQUIRED:\s*'true'/);
assert.match(workflow,/physical-qa-candidate-drift\.mjs --prebuild/);
assert.match(workflow,/Full source regression before artifact/);
assert.match(workflow,/Firestore \+ Storage successor security emulator/);
assert.match(workflow,/demo-tutop-build121/);
assert.match(workflow,/audit-staging-public-release-web\.mjs/);
assert.match(workflow,/audit-staging-auth-client-config\.mjs/);
assert.match(workflow,/audit-staging-auth-email-config\.mjs/);
assert.match(workflow,/audit-staging-offplay-app-check\.mjs/);
assert.match(workflow,/staging-topi-ai-runtime-smoke\.mjs/);
assert.match(workflow,/assembleDebug/);
assert.doesNotMatch(workflow,/assembleRelease|bundleRelease|bundleDebug/);

const extractIndex=workflow.indexOf('extract-next-candidate-apk-identity.mjs');
const sha256Index=workflow.indexOf('register-staging-android-sha256.mjs');
const sha1Index=workflow.indexOf('register-next-candidate-staging-native-key.mjs');
const appCheckIndex=workflow.lastIndexOf('audit-staging-offplay-app-check.mjs');
const promotionIndex=workflow.indexOf('next-candidate-external-preapk-gate.mjs');
const packageIndex=workflow.indexOf('package-build121-candidate.mjs');
const uploadIndex=workflow.indexOf('actions/upload-artifact@v7');
assert(extractIndex>0 && sha256Index>extractIndex && sha1Index>sha256Index);
assert(appCheckIndex>sha1Index && promotionIndex>appCheckIndex && packageIndex>promotionIndex && uploadIndex>packageIndex);

assert.match(workflow,/Prove no AAB \/ Play \/ production output/);
assert.doesNotMatch(workflow,/release-internal\.mjs|upload-internal-sharing\.mjs|androidpublisher|GOOGLE_PLAY/);
assert.match(workflow,/permissions:\s*\n\s*contents:\s*read/);

for(const token of [
  'candidate/tutop-121-post120-physical-repair',
  'mx.tutop.app',
  '0.9.2-beta.11',
  '90215',
  'TUTOP_NEXT_CANDIDATE_SOURCE_SHA',
  'TUTOP_NEXT_CANDIDATE_APK_SHA256',
  'TUTOP_ANDROID_CERT_SHA1',
  'TUTOP_ANDROID_CERT_SHA256',
  'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A_B',
]) assert(packager.includes(token), 'missing packager token '+token);

assert.match(packager,/EXACT_SOURCE_SHA_REQUIRED/);
assert.match(packager,/EXACT_CANDIDATE_BRANCH_REQUIRED/);
assert.match(packager,/EXTRACTED_SOURCE_SHA_MISMATCH/);
assert.match(packager,/APK_SHA256_ENV_MISMATCH/);
assert.match(packager,/ANDROID_VERSION_CODE_MISMATCH/);
assert.match(packager,/ANDROID_VERSION_NAME_MISMATCH/);
assert.match(packager,/real_two_device_fcm:'PENDING'/);
assert.match(packager,/physical_evidence:'NOT_TESTED'/);
assert.match(packager,/play:false/);
assert.match(packager,/production:false/);

console.log('PASS Build121 promotion is one-shot, candidate-branch scoped and source-gated before APK assembly');
console.log('PASS exact source/APK/package/certificate provenance is ordered before candidate upload');
console.log('PASS Build121 remains staging APK only: no AAB, Play or production path');
