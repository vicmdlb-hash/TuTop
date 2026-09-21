import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const path='docs/PHYSICAL_QA_CANDIDATE_BUILD119.json';
const candidate=JSON.parse(fs.readFileSync(path,'utf8'));

function gitObject(repoPath){
  return execFileSync('git',['rev-parse',`HEAD:${repoPath}`],{encoding:'utf8'}).trim();
}

const errors=[];
if(candidate.schema!=='tutop.build119-physical-qa-candidate.v1')errors.push('schema');
if(candidate.build_commit_sha!=='90b2f1806b83aad2d9b67a5cde791eec8b3c9b82')errors.push('build_commit_sha');
if(candidate.artifact_id!==10614734857)errors.push('artifact_id');
if(candidate.build_run_id!==35543305250)errors.push('build_run_id');
if(candidate.apk_sha256!=='9a145c5be6d2a7bd6f845c394e6a6d7d0a1f3200223b64783845ecf20f6be283')errors.push('apk_sha256');
if(candidate.apk_signing_cert_sha1!=='A0808BC19687D3594DFD6785DF5A5ACED475F938')errors.push('apk_signing_cert_sha1');
if(candidate.physical_state!=='NOT_TESTED')errors.push('physical_state_must_start_not_tested');
if(candidate.qa_binding_status!=='active_exact_artifact'||candidate.replacement_required!==false)errors.push('binding_status');

for(const [repoPath,expected] of Object.entries(candidate.client_runtime_refs||{})){
  let actual='';
  try{actual=gitObject(repoPath);}catch{errors.push(`runtime_missing:${repoPath}`);continue;}
  if(actual!==expected)errors.push(`runtime_drift:${repoPath}`);
}

if(errors.length){
  console.error(JSON.stringify({status:'FAIL',errors},null,2));
  process.exit(2);
}
console.log(JSON.stringify({
  status:'PASS',
  candidate_sha:candidate.build_commit_sha,
  artifact_id:candidate.artifact_id,
  runtime_refs:Object.keys(candidate.client_runtime_refs).length,
  physical_state:candidate.physical_state,
  note:'QA-only branch has not changed exact Build119 runtime refs.'
},null,2));
