import assert from 'node:assert/strict';
import fs from 'node:fs';
const w=fs.readFileSync('.github/workflows/tutop-connected-staging-compile.yml','utf8');
assert.match(w,/TUTOP_ALLOW_STAGING_CONFIG_READ: read-only-v2/);
assert.match(w,/prepare-staging-v2-auth\.mjs/);
assert.match(w,/prepare-staging-android-app\.mjs/);
assert.match(w,/VITE_TUTOP_SCHEMA_V2: 'true'/);
assert.match(w,/VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED: 'false'/);
assert.match(w,/VITE_TUTOP_TOPI_REMOTE_ENABLED: 'false'/);
assert.match(w,/VITE_TUTOP_TOPI_GUIDED_BETA: 'true'/);
assert.match(w,/VITE_TUTOP_ENVIRONMENT: staging/);
assert.match(w,/verify-android-native-plugin-bundle/);
assert.doesNotMatch(w,/firebase:deploy|reset-staging|gh release|upload-artifact|TUTOP_ALLOW_FIREBASE_DEPLOY/);
// Real Firebase refresh credentials must never be present in the global job
// environment: only the two read-only GET audit steps need them.
const jobEnvironment=w.slice(w.indexOf('    env:'),w.indexOf('    steps:'));
assert.doesNotMatch(jobEnvironment,/FIREBASE_TOKEN|TUTOP_FIREBASE_OAUTH_CLIENT_(?:ID|SECRET)/,
  'Firebase credentials must not be globally accessible to npm, Vite or Gradle');
const readStep=w.slice(w.indexOf('      - name: Fetch existing Firebase Web and Android V2 configs READ ONLY'),
  w.indexOf('      - name: Export masked Firebase client bundle environment'));
const auditStep=w.slice(w.indexOf('      - name: Read back off-Play App Check policy for physical QA, no Firebase writes'),
  w.indexOf('      - name: Always remove temporary Firebase client configs'));
for(const step of [readStep,auditStep]){
  assert.match(step,/        env:\n          FIREBASE_TOKEN: \$\{\{ secrets\.FIREBASE_TOKEN \}\}/);
  assert.match(step,/TUTOP_FIREBASE_OAUTH_CLIENT_ID: \$\{\{ secrets\.FIREBASE_OAUTH_CLIENT_ID \}\}/);
  assert.match(step,/TUTOP_FIREBASE_OAUTH_CLIENT_SECRET: \$\{\{ secrets\.FIREBASE_OAUTH_CLIENT_SECRET \}\}/);
}
assert.equal((w.match(/FIREBASE_TOKEN: \$\{\{ secrets\.FIREBASE_TOKEN \}\}/g)||[]).length,2);
assert.match(w,/test "\$\(git rev-parse HEAD\^\)" = '[0-9a-f]{40}'/);
console.log('PASS staging Firebase refresh credentials only visible to two read-only GET steps');
console.log('PASS connected staging Android compile is read-only and never uploads APK or deploys Firebase');


// Private beta: public GitHub artifacts may never expose a plaintext Firebase-connected APK.
const encryptedQa = fs.readFileSync('.github/workflows/tutop-private-qa-encrypted-apk.yml','utf8');
assert.match(encryptedQa, /^on:\n  push:\n    branches:\n      - integration\/tutop-121-122-fcm-owner-ci-20261022\n    paths:\n      - ops\/private-qa-apk\.trigger/m);
assert.doesNotMatch(encryptedQa, /workflow_dispatch:|\n  schedule:|\n  pull_request:/);
assert.match(encryptedQa, /^permissions:\n  contents: read/m);
assert.doesNotMatch(encryptedQa, /firebase:deploy|reset-staging|gh release|--apply|contents: write|TUTOP_ALLOW_FIREBASE_DEPLOY/);
assert.match(encryptedQa, /test "\$\(git diff --name-only HEAD\^ HEAD\)" = 'ops\/private-qa-apk\.trigger'/);
assert.match(encryptedQa, /test "\$\(git rev-parse HEAD\^\)" = "\$expected_parent"/);
assert.match(encryptedQa, /TUTOP_ALLOW_STAGING_CONFIG_READ: read-only-v2/);
assert.match(encryptedQa, /VITE_TUTOP_TOPI_REMOTE_ENABLED: 'false'/);
assert.match(encryptedQa, /VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED: 'false'/);
for (const name of ['TUTOP_QA_JKS_BASE64','TUTOP_QA_JKS_PASSWORD','TUTOP_QA_KEY_ALIAS','TUTOP_QA_KEY_PASSWORD']) {
  assert.match(encryptedQa, new RegExp(name + ': \\$\\{\\{ secrets\\.' + name + ' \\}\\}'));
}
assert.match(encryptedQa, /TUTOP_QA_AGE_RECIPIENT: \$\{\{ vars\.TUTOP_QA_AGE_RECIPIENT \}\}/);
assert.match(encryptedQa, /filippo\.io\/age\/cmd\/age@v1\.2\.1/);
assert.match(encryptedQa, /TUTOP_EXPECTED_ANDROID_CERT_SHA256=\$certificate/);
const flowOrder = [
  'Re-sign ephemeral debug APK using owner-controlled QA signing certificate',
  'Read back off-Play App Check policy for physical QA, no Firebase writes',
  'Encrypt signed APK for private owner custody and remove plaintext',
  'Upload only encrypted APK and non-sensitive provenance (1 day)',
];
let last = -1;
for (const name of flowOrder) {
  const at = encryptedQa.indexOf(name);
  assert(at > last, 'signature/binding/encryption/upload ordering must fail closed: ' + name);
  last = at;
}
const upload = encryptedQa.split('      - name: Upload only encrypted APK and non-sensitive provenance (1 day)')[1]
  ?.split('      - name: Always remove temporary Firebase client configs')[0];
assert(upload);
assert.match(upload, /TuTop-Private-QA\.apk\.age/);
assert.match(upload, /TuTop-Private-QA\.provenance\.txt/);
assert.doesNotMatch(upload, /(?:^|\n)\s+\$\{\{ runner\.temp \}\}\/TuTop-Private-QA\.apk(?:\n|$)/);
assert.match(encryptedQa, /rm -f "\$RUNNER_TEMP\/TuTop-Private-QA\.apk"/);
assert.match(encryptedQa, /retention-days: 1/);
console.log('PASS private QA encryption gate: no plaintext artifact, trigger-guarded, owner signing, exact App Check, read-only Firebase');
