import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const path='docs/PHYSICAL_QA_CANDIDATE_BUILD120.json';
const candidate=JSON.parse(fs.readFileSync(path,'utf8'));
function gitObject(repoPath){return execFileSync('git',['rev-parse',`HEAD:${repoPath}`],{encoding:'utf8'}).trim();}

const errors=[];
if(candidate.schema!=='tutop.build120-physical-qa-candidate.v1')errors.push('schema');
if(candidate.build_commit_sha!=='554f4ef6d0429b0059738d8cd6e1b6e4890bda91')errors.push('build_commit_sha');
if(candidate.artifact_id!==10622421310)errors.push('artifact_id');
if(candidate.build_run_id!==35560814829)errors.push('build_run_id');
if(candidate.apk_sha256!=='9855a2e51587f3115f9c270c28d61b1f5c4aa4db7813dacc16b3fe700d458cc0')errors.push('apk_sha256');
if(candidate.apk_signing_cert_sha1!=='8FF8FEC3E281566856B68CE1E227BABEBF547309')errors.push('apk_signing_cert_sha1');
if(candidate.physical_state!=='NOT_TESTED')errors.push('physical_state_must_start_not_tested');
if(candidate.qa_binding_status!=='active_exact_artifact'||candidate.replacement_required!==false)errors.push('binding_status');

for(const [repoPath,expected] of Object.entries(candidate.client_runtime_refs||{})){
  let actual='';
  try{actual=gitObject(repoPath);}catch{errors.push(`runtime_missing:${repoPath}`);continue;}
  if(actual!==expected)errors.push(`runtime_drift:${repoPath}`);
}
if(errors.length){console.error(JSON.stringify({status:'FAIL',errors},null,2));process.exit(2);}
console.log(JSON.stringify({
  status:'PASS',candidate_sha:candidate.build_commit_sha,artifact_id:candidate.artifact_id,
  runtime_refs:Object.keys(candidate.client_runtime_refs).length,physical_state:candidate.physical_state,
  note:'QA-only branch has not changed exact Build120 runtime refs.'
},null,2));
