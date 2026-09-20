import fs from 'node:fs';
import assert from 'node:assert/strict';

const EXPECTED_SHA='e93ca0bb237e7fa438df5801fc627f065d9441e6';
const privacy=fs.readFileSync('public/privacy.html','utf8');
const deletion=fs.readFileSync('public/delete-account.html','utf8');
const deletionClient=fs.readFileSync('public/delete-account.js','utf8');
const preflight=fs.readFileSync('docs/CANDIDATE118_PLAY_DATA_SAFETY_PREFLIGHT.md','utf8');
const project=JSON.parse(fs.readFileSync('config/project.json','utf8'));
const gitignore=fs.readFileSync('.gitignore','utf8');
const aabWorkflow=fs.readFileSync('.github/workflows/candidate118-play-aab-prepare.yml','utf8');
const releaseGate=fs.readFileSync('scripts/play-release-gate.mjs','utf8');
const playVersion=fs.readFileSync('scripts/configure-android-play-version.mjs','utf8');
const bootstrap=fs.readFileSync('scripts/android-bootstrap.mjs','utf8');
const caps=fs.readFileSync('scripts/android-native-capabilities.mjs','utf8');
const voice=fs.readFileSync('scripts/android-topi-voice-plugin.mjs','utf8');
const ai=fs.readFileSync('scripts/android-topi-ai-plugin.mjs','utf8');

assert.match(privacy,new RegExp(EXPECTED_SHA));
assert.match(privacy,/Build118 \/ PR #100/);
assert.match(privacy,/No es una política legal aprobada para publicación/);
assert.match(privacy,/DEVICE_A_NOT_TESTED/);
assert.match(privacy,/Firebase AI Logic 17\.17\.0/);
assert.match(privacy,/SpeechRecognizer/);
assert.match(privacy,/20 de septiembre de 2026/);

assert.match(deletion,/Eliminar cuenta TuTop/);
assert.match(deletion,/sin abrir ni reinstalar la app/i);
assert.match(deletion,/Solicitar eliminación de mi cuenta TuTop/);
assert.match(deletion,/script type="module" src="\/delete-account\.js"/);
assert.match(deletionClient,/accounts:signInWithPassword/);
assert.match(deletionClient,/account_deletion_requests/);
assert.doesNotMatch(deletionClient,/accounts:delete|batchDelete/);

assert.match(preflight,/ENGINEERING PREFLIGHT — NOT A FINAL PLAY CONSOLE DECLARATION/);
assert.match(preflight,new RegExp(EXPECTED_SHA));
assert.match(preflight,/targetSdkVersion=36/);
assert.match(preflight,/current live reachability is UNKNOWN/);
assert.match(preflight,/AAB_PIPELINE_PREPARED_FAIL_CLOSED/);
assert.match(preflight,/versionCode must be \*\*greater than 90212\*\*/);
assert.match(preflight,/ENGINEERING_PREFLIGHT != LEGAL_APPROVAL != DEVICE_PASS != SIGNED_RELEASE_AAB != PLAY_APPROVED/);

assert.match(bootstrap,/compileSdkVersion = 36/);
assert.match(bootstrap,/targetSdkVersion = 36/);
assert.match(caps,/ACCESS_COARSE_LOCATION/);
assert.match(caps,/RECORD_AUDIO/);
assert.match(caps,/ACCESS_FINE_LOCATION/);
assert.match(caps,/ACCESS_BACKGROUND_LOCATION/);
assert.match(voice,/EXTRA_PREFER_OFFLINE, false/);
assert.match(ai,/firebase-ai:17\.17\.0/);

assert.equal(project.productionPublishingAllowed,false);
assert.equal(project.billingAllowed,false);
assert.equal(project.distributionTarget,'github-actions-debug-apk-first');

assert.match(aabWorkflow,/workflow_dispatch:/);
assert.doesNotMatch(aabWorkflow,/\npush:/);
assert.match(aabWorkflow,/release\/candidate118-play-preflight/);
assert.match(aabWorkflow,/PREPARE_SIGNED_AAB_NO_UPLOAD/);
assert.match(aabWorkflow,/bundleRelease/);
assert.match(aabWorkflow,/jarsigner -verify -strict/);
assert.doesNotMatch(aabWorkflow,/upload-google-play|gradle-play-publisher|play\.google\.com\/console/i);
assert.doesNotMatch(aabWorkflow,/keytool\s+/i);

assert.match(releaseGate,/productionPublishingAllowed!==true/);
assert.match(releaseGate,/PRODUCTION_PROJECT_MUST_NOT_BE_STAGING_OR_HISTORICAL/);
assert.match(releaseGate,/PLAY_VERSION_CODE_MUST_EXCEED_90212/);
assert.match(releaseGate,/signing_key_generated:false/);
assert.match(playVersion,/code<=90212/);

for(const token of ['*.jks','*.keystore','android/key.properties','google-play*.json','public/tutop-web-config.json']) assert(gitignore.includes(token));

console.log('PASS Candidate118 exact authority + non-approved privacy draft');
console.log('PASS Candidate118 authenticated external deletion source is present but not deployed');
console.log('PASS Candidate118 source-level API/permissions/voice/AI release inventory');
console.log('PASS production publishing and billing remain fail-closed');
console.log('PASS manual AAB path has no Play upload and requires pre-existing signing/production inputs');
console.log('PASS current public URL reachability remains UNKNOWN until primary evidence');
