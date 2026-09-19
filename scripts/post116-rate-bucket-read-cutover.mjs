import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='ops/post116-rate-bucket-read-cutover';
const ACK='POST116_RATE_BUCKET_READ_REPAIR_ONLY';
const ACTION_ID='post116-rate-bucket-read-20260919-01';
const EXPECTED_RULESET='projects/tutop-beta-vicmdlb-1356585881/rulesets/a10f5272-5fd8-4331-b9ba-a8f570a1be88';
const EXPECTED_ACTIVE_SHA256='5c77bdcf1ab3882d8b9f18a9acb7d49579cc6b9f5b339106a6484110e4a5bb6a';
const RELEASE_NAME='projects/'+PROJECT+'/releases/cloud.firestore';
const TARGET_LINE='      allow read: if signedIn() && resource.data.uid == request.auth.uid;\n';
const REPLACEMENT=`      allow read: if signedIn() && bucketId in [
        request.auth.uid + '-listing_create',
        request.auth.uid + '-chat_create',
        request.auth.uid + '-offer_create',
        request.auth.uid + '-message_create',
        request.auth.uid + '-report_create',
        request.auth.uid + '-demand_create'
      ];
`;

function stop(code){ throw new Error(code); }
function normalize(value){ return String(value||'').replace(/\r\n/g,'\n'); }
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function count(haystack,needle){ return haystack.split(needle).length-1; }
function rateBlock(source){
  const start=source.indexOf('    match /rate_limits/{bucketId} {');
  const end=source.indexOf('    match /device_tokens/{tokenId} {',start);
  if(start<0||end<0) stop('RATE_LIMIT_BLOCK_MISSING');
  return {start,end,text:source.slice(start,end)};
}
function listingBlock(source){
  const start=source.indexOf('    match /listings_v2/{listingId} {');
  const end=source.indexOf('    match /offers/{offerId} {',start);
  if(start<0||end<0) stop('LISTINGS_V2_BLOCK_MISSING');
  return source.slice(start,end);
}

if(!process.argv.includes('--apply')) stop('EXPLICIT_APPLY_REQUIRED');
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) stop('STAGING_PROJECT_REQUIRED');
if(process.env.GITHUB_REF_NAME!==BRANCH) stop('CUTOVER_BRANCH_REQUIRED');
if(process.env.TUTOP_RATE_BUCKET_READ_ACK!==ACK) stop('CUTOVER_ACK_REQUIRED');
if(process.env.TUTOP_RATE_BUCKET_READ_ACTION_ID!==ACTION_ID) stop('CUTOVER_ACTION_ID_REQUIRED');

const token=await firebaseCiAccessToken();
async function request(url,{method='GET',body}={}){
  const response=await fetch(url,{
    method,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const text=await response.text();
  let parsed={};
  try{ parsed=text?JSON.parse(text):{}; }catch{ parsed={}; }
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

const beforeRate=rateBlock(beforeSource);
if(count(beforeRate.text,TARGET_LINE)!==1) stop('ACTIVE_RATE_READ_TARGET_COUNT_NOT_ONE');
if(!beforeRate.text.includes("bucketId == request.auth.uid + '-' + request.resource.data.action")) stop('RATE_WRITE_OWNER_GUARD_MISSING');
if(!beforeSource.includes('email_verified == true')) stop('VERIFIED_EMAIL_GUARD_MISSING');
if(listingBlock(beforeSource).includes('productMatchesSellerIdentity(request.resource.data, request.auth.uid)')) stop('STALE_LISTING_PROFILE_GATE_REAPPEARED');

const candidate=beforeSource.slice(0,beforeRate.start)
  + beforeRate.text.replace(TARGET_LINE,REPLACEMENT)
  + beforeSource.slice(beforeRate.end);
const candidateHash=sha256(candidate);
const candidateRate=rateBlock(candidate);
if(candidateRate.text.includes(TARGET_LINE.trim())) stop('CANDIDATE_OLD_RATE_READ_GUARD_PRESENT');
for(const action of ['listing_create','chat_create','offer_create','message_create','report_create','demand_create']){
  if(!candidateRate.text.includes("request.auth.uid + '-"+action+"'")) stop('CANDIDATE_OWNER_BUCKET_MISSING_'+action);
}
if(listingBlock(candidate)!==listingBlock(beforeSource)) stop('LISTING_BLOCK_CHANGED_UNEXPECTEDLY');

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
  if(String(prePatch.rulesetName||'')!==EXPECTED_RULESET) stop('RELEASE_DRIFT_BEFORE_PATCH');

  await patchRelease(candidateRuleset);
  releasePatched=true;

  const readbackRelease=await readRelease();
  if(String(readbackRelease.rulesetName||'')!==candidateRuleset) stop('CUTOVER_RELEASE_READBACK_MISMATCH');
  const readbackSource=await readRuleset(candidateRuleset);
  if(sha256(readbackSource)!==candidateHash) stop('CUTOVER_SOURCE_HASH_MISMATCH');
  const finalRate=rateBlock(readbackSource);
  if(finalRate.text.includes(TARGET_LINE.trim())) stop('CUTOVER_OLD_RATE_READ_GUARD_STILL_PRESENT');
  for(const action of ['listing_create','chat_create','offer_create','message_create','report_create','demand_create']){
    if(!finalRate.text.includes("request.auth.uid + '-"+action+"'")) stop('CUTOVER_OWNER_BUCKET_MISSING_'+action);
  }
  if(listingBlock(readbackSource)!==listingBlock(beforeSource)) stop('CUTOVER_LISTING_BLOCK_DRIFT');

  const evidence={
    status:'APPLIED_AND_READBACK_VERIFIED',
    action_id:ACTION_ID,
    project:PROJECT,
    source_sha:process.env.GITHUB_SHA,
    rollback_ruleset:EXPECTED_RULESET,
    candidate_ruleset:candidateRuleset,
    before_sha256:beforeHash,
    candidate_sha256:candidateHash,
    exact_delta:'rate_limits read: resource-owner guard -> six deterministic own bucket IDs',
    billing_enabled:false,
    spend:0
  };
  fs.mkdirSync('staging-post116-rate-read-repair',{recursive:true});
  fs.writeFileSync('staging-post116-rate-read-repair/applied.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}catch(error){
  if(releasePatched && candidateRuleset){
    const current=await readRelease();
    const currentName=String(current.rulesetName||'');
    if(currentName===candidateRuleset){
      await patchRelease(EXPECTED_RULESET);
      const rollback=await readRelease();
      if(String(rollback.rulesetName||'')!==EXPECTED_RULESET) stop('ROLLBACK_READBACK_FAILED');
    }else if(currentName!==EXPECTED_RULESET){
      stop('CONCURRENT_RELEASE_CHANGE_NO_ROLLBACK');
    }
  }
  throw error;
}
