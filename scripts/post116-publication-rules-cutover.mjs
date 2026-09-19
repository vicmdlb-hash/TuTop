import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='ops/post116-publication-rules-cutover';
const ACK='POST116_PUBLICATION_RULES_REPAIR_ONLY';
const ACTION_ID='post116-publication-rules-20260919-01';
const EXPECTED_RULESET='projects/tutop-beta-vicmdlb-1356585881/rulesets/be6a8b44-92c4-4f66-ac73-94ab69fe69be';
const EXPECTED_ACTIVE_SHA256='b903644ebb5b28b3aef4ab38131a8a79d86c7d3c0e552868601fbf4a69fdf572';
const RELEASE_NAME='projects/'+PROJECT+'/releases/cloud.firestore';
const TARGET_LINE='        && productMatchesSellerIdentity(request.resource.data, request.auth.uid)\n';

function stop(code){ throw new Error(code); }
function normalize(value){ return String(value||'').replace(/\r\n/g,'\n'); }
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function listingBlock(source){
  const start=source.indexOf('    match /listings_v2/{listingId} {');
  const end=source.indexOf('    match /offers/{offerId} {',start);
  if(start<0||end<0) stop('LISTINGS_V2_BLOCK_MISSING');
  return {start,end,text:source.slice(start,end)};
}
function count(haystack,needle){ return haystack.split(needle).length-1; }

if(!process.argv.includes('--apply')) stop('EXPLICIT_APPLY_REQUIRED');
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) stop('STAGING_PROJECT_REQUIRED');
if(process.env.GITHUB_REF_NAME!==BRANCH) stop('CUTOVER_BRANCH_REQUIRED');
if(process.env.TUTOP_POST116_RULES_ACK!==ACK) stop('CUTOVER_ACK_REQUIRED');
if(process.env.TUTOP_POST116_RULES_ACTION_ID!==ACTION_ID) stop('CUTOVER_ACTION_ID_REQUIRED');

const candidate=normalize(fs.readFileSync('firebase/firestore.v2.generated.rules','utf8'));
const candidateHash=sha256(candidate);
const candidateListing=listingBlock(candidate);
if(candidateListing.text.includes('productMatchesSellerIdentity(request.resource.data, request.auth.uid)')) stop('CANDIDATE_STALE_PROFILE_GATE_PRESENT');
if(!candidateListing.text.includes('validUniversityMetadata(request.resource.data)')) stop('CANDIDATE_CANONICAL_METADATA_GUARD_MISSING');
if(!candidateListing.text.includes('request.resource.data.seller_id == request.auth.uid')) stop('CANDIDATE_SELLER_AUTH_GUARD_MISSING');
if(!candidate.includes('email_verified == true')) stop('CANDIDATE_VERIFIED_EMAIL_GUARD_MISSING');

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
async function readRelease(){
  return request('https://firebaserules.googleapis.com/v1/'+RELEASE_NAME);
}
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
if(!beforeRuleset) stop('LIVE_RELEASE_RULESET_MISSING');
const beforeSource=await readRuleset(beforeRuleset);
const beforeHash=sha256(beforeSource);

if(beforeHash===candidateHash){
  const liveListing=listingBlock(beforeSource);
  if(liveListing.text.includes('productMatchesSellerIdentity(request.resource.data, request.auth.uid)')) stop('LIVE_CANDIDATE_HASH_BUT_GATE_PRESENT');
  const evidence={
    status:'ALREADY_APPLIED_VERIFIED',
    action_id:ACTION_ID,
    project:PROJECT,
    source_sha:process.env.GITHUB_SHA,
    live_ruleset:beforeRuleset,
    candidate_sha256:candidateHash,
    spend:0
  };
  fs.mkdirSync('staging-post116-repair',{recursive:true});
  fs.writeFileSync('staging-post116-repair/applied.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
  process.exit(0);
}

if(beforeRuleset!==EXPECTED_RULESET) stop('LIVE_RULESET_DRIFT');
if(beforeHash!==EXPECTED_ACTIVE_SHA256) stop('LIVE_RULES_HASH_DRIFT');

const activeListing=listingBlock(beforeSource);
if(count(activeListing.text,TARGET_LINE)!==1) stop('ACTIVE_TARGET_GATE_COUNT_NOT_ONE');
if(!activeListing.text.includes('validUniversityMetadata(request.resource.data)')) stop('ACTIVE_CANONICAL_METADATA_GUARD_MISSING');

const expectedCandidate=beforeSource.slice(0,activeListing.start)
  + activeListing.text.replace(TARGET_LINE,'')
  + beforeSource.slice(activeListing.end);
if(expectedCandidate!==candidate) stop('CANDIDATE_NOT_EXACT_ONE_LINE_REPAIR');

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

  const finalListing=listingBlock(readbackSource);
  if(finalListing.text.includes('productMatchesSellerIdentity(request.resource.data, request.auth.uid)')) stop('CUTOVER_GATE_STILL_PRESENT');
  if(!finalListing.text.includes('validUniversityMetadata(request.resource.data)')) stop('CUTOVER_CANONICAL_METADATA_GUARD_MISSING');

  const evidence={
    status:'APPLIED_AND_READBACK_VERIFIED',
    action_id:ACTION_ID,
    project:PROJECT,
    source_sha:process.env.GITHUB_SHA,
    rollback_ruleset:EXPECTED_RULESET,
    candidate_ruleset:candidateRuleset,
    before_sha256:beforeHash,
    candidate_sha256:candidateHash,
    exact_delta:'remove stale profile equality from listings_v2 create only',
    spend:0
  };
  fs.mkdirSync('staging-post116-repair',{recursive:true});
  fs.writeFileSync('staging-post116-repair/applied.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}catch(error){
  if(releasePatched && candidateRuleset){
    const current=await readRelease();
    const currentName=String(current.rulesetName||'');
    if(currentName===candidateRuleset){
      await patchRelease(EXPECTED_RULESET);
      const rollbackReadback=await readRelease();
      if(String(rollbackReadback.rulesetName||'')!==EXPECTED_RULESET) stop('ROLLBACK_READBACK_FAILED');
    }else if(currentName!==EXPECTED_RULESET){
      stop('CONCURRENT_RELEASE_CHANGE_NO_ROLLBACK');
    }
  }
  throw error;
}
