import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const w=fs.readFileSync('.github/workflows/tutop-connected-staging-compile.yml','utf8').replace(/\r\n?/g, '\n');
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
const encryptedQa = fs.readFileSync('.github/workflows/tutop-private-qa-encrypted-apk.yml','utf8').replace(/\r\n?/g, '\n');
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
// Fail before build when private QA signing custody is absent or debug-only.
const privatePreflight = encryptedQa.slice(
  encryptedQa.indexOf('      - name: Verify isolated source and no mutation permissions'),
  encryptedQa.indexOf('      - name: Node 22'),
);
for (const name of ['TUTOP_QA_JKS_BASE64','TUTOP_QA_JKS_PASSWORD','TUTOP_QA_KEY_ALIAS','TUTOP_QA_KEY_PASSWORD']) {
  assert(privatePreflight.includes(name + ': '), 'QA credentials must be checked before compilation: ' + name);
}
assert.match(privatePreflight, /QA signing secrets not configured/);
assert.match(privatePreflight, /Android debug key cannot sign QA/);
const privateSigner = encryptedQa.slice(
  encryptedQa.indexOf('      - name: Re-sign ephemeral debug APK using owner-controlled QA signing certificate'),
  encryptedQa.indexOf('      - name: Read back off-Play App Check policy for physical QA, no Firebase writes'),
);
assert.match(privateSigner, /debug_certificate=/);
assert.match(privateSigner, /QA signer must differ from ephemeral debug signer/);
assert.match(privateSigner, /debug alias rejected at signing/);
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
// Prevent a later workflow edit from uploading plaintext APKs, a wildcard, or a whole temp directory.
// Checking only that the encrypted path is present would not catch an additional artifact.
const artifactPathsBlock = upload.match(/^          path: \|\r?\n((?:^            [^\r\n]+\r?\n)+)/m)?.[1];
assert(artifactPathsBlock, 'private QA artifact path block must be explicit');
const artifactPaths = artifactPathsBlock.trim().split(/\r?\n/).map(line => line.trim());
assert.deepEqual(artifactPaths, [
  '${{ runner.temp }}/TuTop-Private-QA.apk.age',
  '${{ runner.temp }}/TuTop-Private-QA.provenance.txt',
], 'encrypted QA artifact allowlist must remain exact: no plaintext APKs, wildcard, or extra uploads');
assert.equal((encryptedQa.match(/uses:\s*actions\/upload-artifact@/g) || []).length, 1,
  'private QA workflow must have exactly one artifact-upload action');
assert.doesNotMatch(upload, /(?:^|\n)\s+\$\{\{ runner\.temp \}\}\/TuTop-Private-QA\.apk(?:\n|$)/);
assert.match(encryptedQa, /rm -f "\$RUNNER_TEMP\/TuTop-Private-QA\.apk"/);
assert.match(encryptedQa, /retention-days: 1/);
console.log('PASS private QA encryption gate: no plaintext artifact, trigger-guarded, owner signing, exact App Check, read-only Firebase');


// PRIVATE_QA_RULES_GATE_SYNTHETIC_CONTRACT: execute the actual inline gate
// with a hermetic fake Firebase API, never using credentials or the network.
const privateGate = encryptedQa.match(/# PRIVATE_QA_STAGING_RULES_EXACT_MATCH_REQUIRED[\s\S]*?node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/);
assert(privateGate, 'the encrypted QA path must contain its own fail-closed Rules gate');
assert(encryptedQa.indexOf('npm run v2:rules:prepare') < encryptedQa.indexOf('      - name: Fetch existing Firebase Web and Android V2 configs READ ONLY'));
assert(encryptedQa.indexOf('# PRIVATE_QA_STAGING_RULES_EXACT_MATCH_REQUIRED') < encryptedQa.indexOf('      - name: Build connected Firebase app web code'));
const gateProgram = privateGate[1]
  .replace("import fs from 'node:fs';", '')
  .replace("import {firebaseCiAccessToken} from './scripts/firebase-ci-auth.mjs';", '');
assert.doesNotMatch(gateProgram, /\bimport\b|\brequire\s*\(/);
const root = 'projects/tutop-beta-vicmdlb-1356585881';
const releaseName = root + '/releases/cloud.firestore';
const rulesetName = root + '/rulesets/synthetic-ruleset-1';
const desiredRules = 'rules_version = "2";\nservice cloud.firestore {}\n';
const releaseFixture = { name: releaseName, rulesetName };
const ruleFixture = { name: rulesetName, source: { files: [{ content: desiredRules }] } };
function mockGate({
  env = {}, desired = desiredRules, responses = [releaseFixture, ruleFixture, releaseFixture],
} = {}) {
  const requests = [], messages = [];
  const context = {
    process: { env: {
      GITHUB_REF_NAME: 'integration/tutop-121-122-fcm-owner-ci-20261022',
      TUTOP_FIREBASE_PROJECT_ID: 'tutop-beta-vicmdlb-1356585881',
      TUTOP_ALLOW_STAGING_CONFIG_READ: 'read-only-v2',
      ...env,
    } },
    fs: { readFileSync(path, encoding) {
      assert.equal(path, 'firebase/firestore.v2.generated.rules');
      assert.equal(encoding, 'utf8');
      return desired;
    } },
    firebaseCiAccessToken: async () => 'synthetic-token-not-a-credential',
    AbortSignal: { timeout(ms) { assert.equal(ms, 20000); return {}; } },
    console: { log: (...args) => messages.push(args.join(' ')) },
    fetch: async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token-not-a-credential');
      assert.equal(options.headers['X-Goog-User-Project'], 'tutop-beta-vicmdlb-1356585881');
      const i = requests.length;
      requests.push(url);
      const expected = [releaseName, rulesetName, releaseName][i];
      assert.equal(url, 'https://firebaserules.googleapis.com/v1/' + expected);
      assert(i < responses.length, 'unexpected mock request');
      const fixture = responses[i];
      if (typeof fixture === 'number') return { ok: false, status: fixture };
      return { ok: true, json: async () => fixture };
    },
  };
  const result = vm.runInNewContext('(async()=>{\n' + gateProgram + '\n})()', context, {
    timeout: 1000, contextCodeGeneration: { strings: false, wasm: false },
  });
  return { result, requests, messages };
}
const passing = mockGate();
await passing.result;
assert.equal(passing.requests.length, 3);
assert.deepEqual(passing.messages, ['PRIVATE_QA_STAGING_RULES_EXACT_MATCH_READ_ONLY_PASS']);
const crlf = mockGate({ responses: [releaseFixture, {
  ...ruleFixture, source: { files: [{ content: desiredRules.replace(/\n/g, '\r\n') }] },
}, releaseFixture] });
await crlf.result;
assert.equal(crlf.requests.length, 3);
const drift = mockGate({ responses: [releaseFixture, {
  ...ruleFixture, source: { files: [{ content: desiredRules + '// drift\n' }] },
}] });
await assert.rejects(drift.result, /PRIVATE_QA_STAGING_RULES_SOURCE_DEPLOY_DRIFT/);
assert.equal(drift.requests.length, 2);
const ambiguous = mockGate({ responses: [releaseFixture, {
  ...ruleFixture, source: { files: [{ content: desiredRules }, { content: desiredRules }] },
}] });
await assert.rejects(ambiguous.result, /PRIVATE_QA_RULESET_SOURCE_AMBIGUOUS/);
const foreign = mockGate({ responses: [{ ...releaseFixture, rulesetName: 'projects/foreign/rulesets/x' }] });
await assert.rejects(foreign.result, /PRIVATE_QA_RULESET_IDENTITY_REJECTED/);
assert.equal(foreign.requests.length, 1);
const concurrent = mockGate({ responses: [releaseFixture, ruleFixture, {
  ...releaseFixture, rulesetName: root + '/rulesets/synthetic-ruleset-2',
}] });
await assert.rejects(concurrent.result, /PRIVATE_QA_RULESET_CHANGED_DURING_PREFLIGHT/);
const denied = mockGate({ responses: [403] });
await assert.rejects(denied.result, /PRIVATE_QA_RULES_GET_HTTP_403/);
const wrongProject = mockGate({ env: { TUTOP_FIREBASE_PROJECT_ID: 'foreign' }, responses: [] });
await assert.rejects(wrongProject.result, /PRIVATE_QA_RULES_CONTEXT_REJECTED/);
assert.equal(wrongProject.requests.length, 0);
const emptyCandidate = mockGate({ desired: '', responses: [releaseFixture, ruleFixture] });
await assert.rejects(emptyCandidate.result, /PRIVATE_QA_STAGING_RULES_SOURCE_DEPLOY_DRIFT/);
console.log('PASS private QA staging Rules gate: 9 synthetic exact-match, drift and fail-closed cases; no network');
