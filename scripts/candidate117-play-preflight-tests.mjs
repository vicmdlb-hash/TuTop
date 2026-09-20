import fs from 'node:fs';
import assert from 'node:assert/strict';

const privacy=fs.readFileSync('public/privacy.html','utf8');
const preflight=fs.readFileSync('docs/CANDIDATE117_PLAY_DATA_SAFETY_PREFLIGHT.md','utf8');
const project=JSON.parse(fs.readFileSync('config/project.json','utf8'));
const gitignore=fs.readFileSync('.gitignore','utf8');

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
assert.match(preflight,/ACCESS_COARSE_LOCATION/);
assert.match(preflight,/RECORD_AUDIO/);
assert.match(preflight,/Firebase AI Logic/);
assert.match(preflight,/EXTRA_PREFER_OFFLINE=false/);
assert.match(preflight,/Production backend\/configuration status/);
assert.match(preflight,/must \*\*not\*\* be prepared by silently reusing staging/);
assert.match(preflight,/AAB \/ signing status/);
assert.match(preflight,/no release `signingConfig` is configured/);
assert.match(preflight,/no `bundleRelease` pipeline/);
assert.match(preflight,/SOURCE_PREFLIGHT_PASS != LEGAL_APPROVAL != DEVICE_PASS != PLAY_APPROVED/);

assert.equal(project.productionPublishingAllowed,false);
assert.equal(project.billingAllowed,false);
assert.equal(project.distributionTarget,'github-actions-debug-apk-first');
assert.equal(project.futureDistributionTarget,'google-play-internal-app-sharing');

for(const token of ['*.jks','*.keystore','android/key.properties','google-play*.json']) assert(gitignore.includes(token));

assert.doesNotMatch(privacy,/política legal aprobada(?! para publicación)/i);
console.log('PASS Candidate117 privacy draft stays non-approved and exact-authority aligned');
console.log('PASS Candidate117 Play/Data Safety preflight is exact-candidate scoped');
console.log('PASS No deliberate production backend is invented or inherited from staging');
console.log('PASS Play publishing and billing remain fail-closed');
console.log('PASS signing secrets remain excluded from repository');
