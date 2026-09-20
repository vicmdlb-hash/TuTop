import fs from 'node:fs';
import assert from 'node:assert/strict';

const privacy=fs.readFileSync('public/privacy.html','utf8');
const preflight=fs.readFileSync('docs/CANDIDATE117_PLAY_DATA_SAFETY_PREFLIGHT.md','utf8');
const project=JSON.parse(fs.readFileSync('config/project.json','utf8'));
const gitignore=fs.readFileSync('.gitignore','utf8');
const aabWorkflow=fs.readFileSync('.github/workflows/candidate117-play-aab-prepare.yml','utf8');
const releaseGate=fs.readFileSync('scripts/play-release-gate.mjs','utf8');
const playVersion=fs.readFileSync('scripts/configure-android-play-version.mjs','utf8');

assert.match(privacy,/build117 \/ PR #97 \/ SHA a578a214f17f3a0ddb7c0d8c6039866f0252c015/);
assert.match(privacy,/No es una política legal aprobada para publicación/);
assert.match(privacy,/DEVICE_A_NOT_TESTED/);
assert.match(privacy,/Firebase AI Logic 17\.17\.0/);
assert.match(privacy,/SpeechRecognizer/);
assert.match(privacy,/preferencia offline desactivada/);
assert.match(privacy,/20 de septiembre de 2026/);

assert.match(preflight,/ENGINEERING PREFLIGHT — NOT A FINAL PLAY CONSOLE DECLARATION/);
assert.match(preflight,/a578a214f17f3a0ddb7c0d8c6039866f0252c015/);
assert.match(preflight,/HTTP 404/);
assert.match(preflight,/Target API compliance/);
assert.match(preflight,/targetSdkVersion=36/);
assert.match(preflight,/target API level gate is currently green/);
assert.match(preflight,/ACCESS_COARSE_LOCATION/);
assert.match(preflight,/RECORD_AUDIO/);
assert.match(preflight,/Firebase AI Logic/);
assert.match(preflight,/EXTRA_PREFER_OFFLINE=false/);
assert.match(preflight,/Production backend\/configuration status/);
assert.match(preflight,/must \*\*not\*\* be prepared by silently reusing staging/);
assert.match(preflight,/AAB \/ signing status/);
assert.match(preflight,/no release `signingConfig` is configured/);
assert.match(preflight,/AAB_PIPELINE_PREPARED_FAIL_CLOSED/);
assert.match(preflight,/PREPARE_SIGNED_AAB_NO_UPLOAD/);
assert.match(preflight,/no Play Console upload step/);
assert.match(preflight,/SOURCE_PREFLIGHT_PASS != LEGAL_APPROVAL != DEVICE_PASS != PLAY_APPROVED/);

assert.equal(project.productionPublishingAllowed,false);
assert.equal(project.billingAllowed,false);
assert.equal(project.distributionTarget,'github-actions-debug-apk-first');
assert.equal(project.futureDistributionTarget,'google-play-internal-app-sharing');

assert.match(aabWorkflow,/workflow_dispatch:/);
assert.doesNotMatch(aabWorkflow,/\npush:/);
assert.match(aabWorkflow,/PREPARE_SIGNED_AAB_NO_UPLOAD/);
assert.match(aabWorkflow,/bundleRelease/);
assert.match(aabWorkflow,/jarsigner -verify -strict/);
assert.match(aabWorkflow,/actions\/upload-artifact@v7/);
assert.doesNotMatch(aabWorkflow,/upload-google-play|gradle-play-publisher|play\.google\.com\/console/i);
assert.doesNotMatch(aabWorkflow,/keytool\s+/i);

assert.match(releaseGate,/productionPublishingAllowed!==true/);
assert.match(releaseGate,/PRODUCTION_PROJECT_MUST_NOT_BE_STAGING_OR_HISTORICAL/);
assert.match(releaseGate,/TUTOP_UPLOAD_KEYSTORE_B64/);
assert.match(releaseGate,/signing_key_generated:false/);
assert.match(playVersion,/PLAY_VERSION_CODE_MUST_EXCEED_90211|PLAY_VERSION_CODE_INVALID/);

for(const token of ['*.jks','*.keystore','android/key.properties','google-play*.json']) assert(gitignore.includes(token));

assert.doesNotMatch(privacy,/política legal aprobada(?! para publicación)/i);
console.log('PASS Candidate117 privacy draft stays non-approved and exact-authority aligned');
console.log('PASS Candidate117 Play/Data Safety preflight is exact-candidate scoped');
console.log('PASS Candidate117 target API 36 is documented as current Play-compliant');
console.log('PASS No deliberate production backend is invented or inherited from staging');
console.log('PASS Play publishing and billing remain fail-closed');
console.log('PASS signing secrets remain excluded from repository');
console.log('PASS AAB workflow is manual-only, no-Play-upload, and uses a pre-existing upload key');
console.log('PASS AAB gate refuses staging/historical Firebase and requires explicit production authorization');
