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
