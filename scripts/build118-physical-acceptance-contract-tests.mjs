import fs from 'node:fs';
import assert from 'node:assert/strict';
import { candidateExactHeadIdentityValid, verifyCurrentCandidateRuntime } from './physical-qa-candidate-drift.mjs';

const candidate=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json','utf8'));
const a=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_A_0.9.json','utf8'));
const b=JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_DEVICE_B_0.9.json','utf8'));
const fcm=JSON.parse(fs.readFileSync('docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json','utf8'));
const appCheck=JSON.parse(fs.readFileSync('docs/APP_CHECK_PHYSICAL_EVIDENCE_TEMPLATE.json','utf8'));
const matrix=JSON.parse(fs.readFileSync('docs/BUILD118_PHYSICAL_ACCEPTANCE_MATRIX.json','utf8'));

assert.equal(candidate.app_version,'0.9.2-beta.8');
assert.equal(candidate.build_commit_sha,'e93ca0bb237e7fa438df5801fc627f065d9441e6');
assert.equal(candidate.artifact_id,10609901887);
assert.equal(candidate.build_run_id,35526553288);
assert.equal(candidate.build_tree_sha,'237e43fc4752f4c8ce2f4301b9a155af4a3270c9');
assert.equal(candidate.apk_sha256,'6fadbdb05d6d3b2386eeffc3e2885e9f406190ed9710914048bd1a14a69ac8f7');
assert.equal(candidate.apk_size_bytes,21551791);
assert.equal(candidate.physical_release_candidate,true);
assert.equal(candidate.candidate_status,'active_exact_head');
assert.equal(candidate.replacement_required,false);
assert(candidateExactHeadIdentityValid(candidate));

const drift=verifyCurrentCandidateRuntime();
assert.equal(drift.runtime_refs_fresh,true);
assert.equal(drift.identity_valid,true);

for(const bundle of [a,b]){
  assert.equal(bundle.app_version,candidate.app_version);
  assert.equal(bundle.candidate.artifact_id,candidate.artifact_id);
  assert.equal(bundle.candidate.apk_sha256,candidate.apk_sha256);
  assert.equal(bundle.device.physical,false);
  assert(Object.values(bundle.required_cases).every(v=>v==='pending'));
  assert.equal(bundle.diagnostic_report,null);
  assert.equal(bundle.fcm_fixture_report,null);
  assert.equal(bundle.app_check_evidence,null);
}
assert.equal(fcm.candidate.artifact_id,candidate.artifact_id);
assert.equal(fcm.candidate.apk_sha256,candidate.apk_sha256);
assert(fcm.scenarios.every(s=>Array.isArray(s.events)&&s.events.length===0));
assert.equal(appCheck.candidate_artifact_id,candidate.artifact_id);
assert.equal(appCheck.app_check_token_observed,false);
assert.equal(appCheck.device_count,0);
assert(appCheck.devices.every(d=>d.physical===false&&d.app_check_token_observed===false));

const expected=[10,11,12,20,31,33,35,36,37,38,39,44,45,50,52,56,60,62];
assert.deepEqual([...matrix.issue_ids].sort((x,y)=>x-y),expected);
assert.equal(matrix.issue_count,18);
assert.equal(matrix.release_blocked,true);
assert.deepEqual(matrix.completed_issue_ids,[]);
assert(matrix.sessions.some(s=>s.id==='A_CORE'&&s.cases.includes('publish_listing_same_path_as_build116')));
assert(matrix.sessions.some(s=>s.id==='A_CORE'&&s.cases.includes('publication_session_self_heal_if_needed')));
assert(matrix.sessions.some(s=>s.id==='MODERATION'&&s.status==='blocked_external_admin_identity'));
assert(matrix.sessions.every(s=>s.status!=='pass'));

console.log('PASS Build118 exact artifact/runtime bound to Physical QA');
console.log('PASS Device A/B + FCM + App Check reset to pending/false for Build118');
console.log('PASS 18 open physical/operational issues mapped to causal sessions');
console.log('PASS publication self-heal is explicitly observable but not pre-passed');
console.log('PASS no physical PASS fabricated');
