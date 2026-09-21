import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateBuild120DeviceA } from './build120-physical-evidence-validator.mjs';

const candidate=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_BUILD120.json','utf8'));
const template=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_A_BUILD120.json','utf8'));
const matrix=JSON.parse(fs.readFileSync('docs/BUILD120_PHYSICAL_ACCEPTANCE_MATRIX.json','utf8'));

assert.equal(candidate.app_version,'0.9.2-beta.10');
assert.equal(candidate.build_commit_sha,'554f4ef6d0429b0059738d8cd6e1b6e4890bda91');
assert.equal(candidate.build_tree_sha,'61485d3c218cc553a230be09dab3217b2774b44e');
assert.equal(candidate.artifact_id,10622421310);
assert.equal(candidate.build_run_id,35560814829);
assert.equal(candidate.apk_sha256,'9855a2e51587f3115f9c270c28d61b1f5c4aa4db7813dacc16b3fe700d458cc0');
assert.equal(candidate.apk_signing_cert_sha1,'8FF8FEC3E281566856B68CE1E227BABEBF547309');
assert.equal(candidate.physical_state,'NOT_TESTED');
assert.equal(candidate.replacement_required,false);

const pending=validateBuild120DeviceA(template);
assert.equal(pending.causal_result,'pending');
assert.equal(pending.build118_photo_failures_cleared,false);
assert.equal(pending.build119_publication_defect_cleared,false);
assert.equal(pending.full_release_blocked,true);
assert.equal(pending.pending_cases,7);

const physical=structuredClone(template);
physical.device={slot:'A',label:'qa-device-a',manufacturer:'Example',model:'Physical',android_version:'15',installation:'reinstall',physical:true};
for(const key of Object.keys(physical.causal_cases))physical.causal_cases[key]='pass';
const causalPass=validateBuild120DeviceA(physical);
assert.equal(causalPass.causal_result,'pass');
assert.equal(causalPass.build118_photo_failures_cleared,true);
assert.equal(causalPass.build119_publication_defect_cleared,true);
assert.equal(causalPass.full_release_blocked,true);

const reactFail=structuredClone(physical);
reactFail.causal_cases.react_product_detail_no_crash='fail';
assert.equal(validateBuild120DeviceA(reactFail).causal_result,'fail');

const publicationFail=structuredClone(physical);
publicationFail.causal_cases.publication_national_without_shipping='fail';
assert.equal(validateBuild120DeviceA(publicationFail).causal_result,'fail');

const fake=structuredClone(physical);
fake.candidate.artifact_id+=1;
assert.equal(validateBuild120DeviceA(fake).causal_result,'fail');

const leak=structuredClone(physical);
leak.password='secret';
assert.equal(validateBuild120DeviceA(leak).causal_result,'fail');

assert.equal(matrix.candidate.artifact_id,candidate.artifact_id);
assert.equal(matrix.candidate.apk_sha256,candidate.apk_sha256);
assert.equal(matrix.truth,'CI_PASS_NEVER_EQUALS_DEVICE_PASS');
assert.deepEqual(matrix.phases[0].required_cases,Object.keys(template.causal_cases));
assert.equal(matrix.causal_release_blocked,true);
assert.equal(matrix.full_release_blocked,true);

console.log('PASS exact Build120 artifact identity is bound to a QA-only acceptance pack');
console.log('PASS all seven causal Device A cases start pending');
console.log('PASS causal PASS may clear the photo failure cluster and national-publication defect without implying release PASS');
console.log('PASS wrong artifact identity and sensitive evidence fail closed');
