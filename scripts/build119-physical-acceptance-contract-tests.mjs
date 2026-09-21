import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateBuild119DeviceA } from './build119-physical-evidence-validator.mjs';

const candidate=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_BUILD119.json','utf8'));
const template=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_A_BUILD119.json','utf8'));
const matrix=JSON.parse(fs.readFileSync('docs/BUILD119_PHYSICAL_ACCEPTANCE_MATRIX.json','utf8'));

assert.equal(candidate.app_version,'0.9.2-beta.9');
assert.equal(candidate.build_commit_sha,'90b2f1806b83aad2d9b67a5cde791eec8b3c9b82');
assert.equal(candidate.build_tree_sha,'9b85669b70be8872e421a1438a44dd7c44ef06e5');
assert.equal(candidate.artifact_id,10614734857);
assert.equal(candidate.build_run_id,35543305250);
assert.equal(candidate.apk_sha256,'9a145c5be6d2a7bd6f845c394e6a6d7d0a1f3200223b64783845ecf20f6be283');
assert.equal(candidate.physical_state,'NOT_TESTED');
assert.equal(candidate.replacement_required,false);

const pending=validateBuild119DeviceA(template);
assert.equal(pending.causal_result,'pending');
assert.equal(pending.build119_failures_cleared,false);
assert.equal(pending.full_release_blocked,true);
assert.equal(pending.pending_cases,6);

const physical=structuredClone(template);
physical.device={slot:'A',label:'qa-device-a',manufacturer:'Example',model:'Physical',android_version:'15',installation:'reinstall',physical:true};
for(const key of Object.keys(physical.causal_cases))physical.causal_cases[key]='pass';
const causalPass=validateBuild119DeviceA(physical);
assert.equal(causalPass.causal_result,'pass');
assert.equal(causalPass.build119_failures_cleared,true);
assert.equal(causalPass.full_release_blocked,true);

const reactFail=structuredClone(physical);
reactFail.causal_cases.react_product_detail_no_crash='fail';
assert.equal(validateBuild119DeviceA(reactFail).causal_result,'fail');

const fake=structuredClone(physical);
fake.candidate.artifact_id+=1;
assert.equal(validateBuild119DeviceA(fake).causal_result,'fail');

const leak=structuredClone(physical);
leak.password='secret';
assert.equal(validateBuild119DeviceA(leak).causal_result,'fail');

assert.equal(matrix.candidate.artifact_id,candidate.artifact_id);
assert.equal(matrix.candidate.apk_sha256,candidate.apk_sha256);
assert.equal(matrix.truth,'CI_PASS_NEVER_EQUALS_DEVICE_PASS');
assert.equal(matrix.phases[0].id,'A_CAUSAL');
assert.deepEqual(matrix.phases[0].required_cases,Object.keys(template.causal_cases));
assert.equal(matrix.causal_release_blocked,true);
assert.equal(matrix.full_release_blocked,true);

console.log('PASS exact Build119 artifact identity is bound to a QA-only acceptance pack');
console.log('PASS all six causal Device A cases start pending');
console.log('PASS physical causal PASS can clear the Build118 failure cluster without implying full release PASS');
console.log('PASS wrong artifact identity and sensitive evidence fail closed');
