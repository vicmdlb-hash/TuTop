import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='candidate/tutop-117-all-fixes';
const ACK='CANDIDATE117_STAGING_RULES_AND_PUBLICATION_ONLY';
const EXPECTED_RULESET='projects/tutop-beta-vicmdlb-1356585881/rulesets/e6380a3e-cf93-4893-9305-53de1ce160fa';
const EXPECTED_ACTIVE_SHA256='f5228c47a6aa27bef169ff4c59b18322f6c605b925b4ff2e3eb955f9af8011a5';
const RELEASE_NAME='projects/'+PROJECT+'/releases/cloud.firestore';
const CANDIDATE_PATH='firebase/firestore.v2.generated.rules';

function stop(code){ throw new Error(code); }
function normalize(value){ return String(value||'').replace(/\r\n/g,'\n'); }
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }

if(!process.argv.includes('--apply-and-prove')) stop('EXPLICIT_APPLY_AND_PROVE_REQUIRED');
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) stop('STAGING_PROJECT_REQUIRED');
if(process.env.GITHUB_REF_NAME!==BRANCH) stop('CANDIDATE117_BRANCH_REQUIRED');
if(process.env.TUTOP_CANDIDATE117_RULES_ACK!==ACK) stop('CANDIDATE117_ACK_REQUIRED');
if(!fs.existsSync(CANDIDATE_PATH)) stop('CANDIDATE_RULES_MISSING');
if(!fs.existsSync('.tutop-staging-web-config.json')) stop('STAGING_WEB_CONFIG_MISSING');

const token=await firebaseCiAccessToken();
async function request(url,{method='GET',body}={}){
  const response=await fetch(url,{
    method,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const text=await response.text();
  let parsed={};
  try{ parsed=text?JSON.parse(text):{}; }catch{ parsed={raw:text.slice(0,300)}; }
  if(!response.ok) stop('HTTP_'+response.status+'_'+method);
  return parsed;
}
async function readRuleset(name){
  const ruleset=await request('https://firebaserules.googleapis.com/v1/'+name);
  return normalize((ruleset?.source?.files||[]).map(file=>file.content||'').join('\n'));
}
async function readRelease(){ return request('https://firebaserules.googleapis.com/v1/'+RELEASE_NAME); }
async function patchRelease(rulesetName){
  return request('https://firebaserules.googleapis.com/v1/'+RELEASE_NAME,{
    method:'PATCH',
    body:{release:{name:RELEASE_NAME,rulesetName},updateMask:'rulesetName'}
  });
}

const billing=await request('https://cloudbilling.googleapis.com/v1/projects/'+PROJECT+'/billingInfo');
if(billing.billingEnabled===true) stop('SPEND_ZERO_BILLING_ENABLED');
if(billing.billingEnabled!==false) stop('SPEND_ZERO_BILLING_UNKNOWN');

const beforeRelease=await readRelease();
const beforeRuleset=String(beforeRelease.rulesetName||'');
if(beforeRuleset!==EXPECTED_RULESET) stop('LIVE_RULESET_DRIFT');
const beforeSource=await readRuleset(beforeRuleset);
const beforeHash=sha256(beforeSource);
if(beforeHash!==EXPECTED_ACTIVE_SHA256) stop('LIVE_RULES_HASH_DRIFT');

const candidate=normalize(fs.readFileSync(CANDIDATE_PATH,'utf8'));
const candidateHash=sha256(candidate);
if(candidateHash===beforeHash) stop('CANDIDATE_RULES_NOT_DIFFERENT');
for(const tokenText of [
  "request.auth.uid + '-listing_create'",
  'availability_status',
  'email_verified == true',
  'listing_reservation_locks'
]){
  if(!candidate.includes(tokenText)) stop('CANDIDATE_RULES_GUARD_MISSING_'+tokenText.replace(/[^A-Za-z0-9]+/g,'_'));
}
if(candidate.includes("allow read: if signedIn() && resource.data.uid == request.auth.uid;")) {
  stop('OLD_RATE_BUCKET_READ_GUARD_REAPPEARED');
}

let candidateRuleset='';
let releasePatched=false;
try{
  const created=await request('https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/rulesets',{
    method:'POST',
    body:{source:{files:[{name:'firestore.rules',content:candidate}]}}
  });
  candidateRuleset=String(created.name||'');
  if(!candidateRuleset) stop('CANDIDATE_RULESET_CREATE_NO_NAME');

  const createdSource=await readRuleset(candidateRuleset);
  if(sha256(createdSource)!==candidateHash) stop('CREATED_RULESET_HASH_MISMATCH');

  const prePatch=await readRelease();
  if(String(prePatch.rulesetName||'')!==beforeRuleset) stop('RELEASE_DRIFT_BEFORE_PATCH');

  await patchRelease(candidateRuleset);
  releasePatched=true;

  const readbackRelease=await readRelease();
  if(String(readbackRelease.rulesetName||'')!==candidateRuleset) stop('CUTOVER_RELEASE_READBACK_MISMATCH');
  const readbackSource=await readRuleset(candidateRuleset);
  if(sha256(readbackSource)!==candidateHash) stop('CUTOVER_SOURCE_HASH_MISMATCH');

  const proof=spawnSync(process.execPath,[
    '--experimental-strip-types',
    '--experimental-loader','./scripts/node-ts-extension-loader.mjs',
    'scripts/candidate117-client-equivalent-live-smoke.mjs'
  ],{stdio:'inherit',env:process.env});
  if(proof.status!==0) stop('CANDIDATE117_LIVE_PUBLICATION_PROOF_FAILED');

  const finalRelease=await readRelease();
  if(String(finalRelease.rulesetName||'')!==candidateRuleset) stop('RELEASE_DRIFT_AFTER_PROOF');

  const evidence={
    status:'APPLIED_AND_LIVE_PUBLICATION_VERIFIED',
    project:PROJECT,
    source_sha:process.env.GITHUB_SHA,
    rollback_ruleset:beforeRuleset,
    candidate_ruleset:candidateRuleset,
    before_sha256:beforeHash,
    candidate_sha256:candidateHash,
    billing_enabled:false,
    live_publication_pass:true,
    synthetic_cleanup_required:true,
    spend:0,
    production:false
  };
  fs.mkdirSync('staging-candidate117-rules-cutover',{recursive:true});
  fs.writeFileSync('staging-candidate117-rules-cutover/applied.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}catch(error){
  if(releasePatched && candidateRuleset){
    const current=await readRelease();
    const currentName=String(current.rulesetName||'');
    if(currentName===candidateRuleset){
      await patchRelease(beforeRuleset);
      const rollback=await readRelease();
      if(String(rollback.rulesetName||'')!==beforeRuleset) stop('ROLLBACK_READBACK_FAILED');
      console.error(JSON.stringify({rollback:'PASS',restored_ruleset:beforeRuleset}));
    }else if(currentName!==beforeRuleset){
      stop('CONCURRENT_RELEASE_CHANGE_NO_ROLLBACK');
    }
  }
  throw error;
}
