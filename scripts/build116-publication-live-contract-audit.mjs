import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const project='tutop-beta-vicmdlb-1356585881';
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==project) throw new Error('STAGING_PROJECT_REQUIRED');
const token=await firebaseCiAccessToken();
const headers={Authorization:'Bearer '+token};

async function json(url, options={}) {
  const response=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const body=await response.text();
  if(!response.ok) throw new Error('READ_FAILED:'+response.status+':'+body.slice(0,300));
  return body?JSON.parse(body):null;
}
async function maybeDoc(path) {
  const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'+path;
  const response=await fetch(url,{headers});
  if(response.status===404) return null;
  const body=await response.text();
  if(!response.ok) throw new Error('DOC_READ_FAILED:'+response.status+':'+body.slice(0,300));
  return JSON.parse(body);
}
function field(doc,key) {
  const v=doc?.fields?.[key];
  if(!v) return undefined;
  if('stringValue' in v) return v.stringValue;
  if('integerValue' in v) return Number(v.integerValue);
  if('booleanValue' in v) return v.booleanValue;
  if('doubleValue' in v) return v.doubleValue;
  if('timestampValue' in v) return v.timestampValue;
  return undefined;
}
async function listCollection(path) {
  const all=[]; let pageToken='';
  do {
    const q=new URLSearchParams({pageSize:'1000'});
    if(pageToken)q.set('pageToken',pageToken);
    const raw=await json('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'+path+'?'+q);
    all.push(...(raw?.documents||[]));
    pageToken=String(raw?.nextPageToken||'');
  } while(pageToken);
  return all;
}

const release=await json('https://firebaserules.googleapis.com/v1/projects/'+project+'/releases/cloud.firestore');
const ruleset=await json('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
const activeRules=(ruleset.source?.files||[]).map(f=>f.content||'').join('\n');
const activeSha=crypto.createHash('sha256').update(activeRules).digest('hex');

const generated=fs.readFileSync('firebase/firestore.v2.generated.rules','utf8');
const generatedSha=crypto.createHash('sha256').update(generated).digest('hex');

const institutions=await listCollection('institutions');
const campuses=await listCollection('campuses');
const institutionIds=new Set(institutions.map(d=>String(d.name||'').split('/').pop()));
const campusById=new Map(campuses.map(d=>[String(d.name||'').split('/').pop(),String(field(d,'institution_id')||'')]));

const users=await listCollection('users');
const profile={
  total:users.length,
  missing_or_invalid_name:0,
  missing_or_invalid_facultad:0,
  avatar_over_limit:0,
  missing_institution_id:0,
  missing_campus_id:0,
  institution_catalog_missing:0,
  campus_catalog_missing:0,
  campus_institution_mismatch:0,
  would_fail_identity_update_shape:0,
};
for(const d of users){
  const name=String(field(d,'nombre')??'');
  const faculty=field(d,'facultad');
  const avatar=field(d,'avatar_url');
  const institution=String(field(d,'institution_id')??'');
  const campus=String(field(d,'campus_id')??'');
  let bad=false;
  if(name.length<2||name.length>80){profile.missing_or_invalid_name++;bad=true;}
  if(typeof faculty!=='string'||faculty.length>120){profile.missing_or_invalid_facultad++;bad=true;}
  if(typeof avatar==='string'&&avatar.length>120000){profile.avatar_over_limit++;bad=true;}
  if(!institution){profile.missing_institution_id++;}
  else if(!institutionIds.has(institution)){profile.institution_catalog_missing++;bad=true;}
  if(!campus){profile.missing_campus_id++;}
  else if(!campusById.has(campus)){profile.campus_catalog_missing++;bad=true;}
  else if(institution&&campusById.get(campus)!==institution){profile.campus_institution_mismatch++;bad=true;}
  if(bad)profile.would_fail_identity_update_shape++;
}

const privateDocs=await listCollection('user_private');
const authModes={};
for(const d of privateDocs){
  const mode=String(field(d,'auth_mode')||'missing');
  authModes[mode]=(authModes[mode]||0)+1;
}
const createdTimes=users.map(d=>Date.parse(String(field(d,'created_at')||''))).filter(Number.isFinite).sort((a,b)=>a-b);
const resetMarker=await maybeDoc('staging_maintenance/staging-reset-2026-09-13-physical-failures-1');
const maintenance=resetMarker ? {
  present:true,
  completed_at:field(resetMarker,'completed_at')||null,
  auth_users_deleted:Number(field(resetMarker,'auth_users_deleted')||0),
  firestore_documents_deleted:Number(field(resetMarker,'firestore_documents_deleted')||0),
} : {present:false};
const deletionRequests=await listCollection('account_deletion_requests');

const buckets=await listCollection('rate_limits');
const listingBuckets=buckets.filter(d=>field(d,'action')==='listing_create');
const rate={
  listing_buckets:listingBuckets.length,
  count_ge_8:listingBuckets.filter(d=>Number(field(d,'count')||0)>=8).length,
  max_count:listingBuckets.reduce((m,d)=>Math.max(m,Number(field(d,'count')||0)),0),
};

let authTotal=0, authVerified=0, authEmail=0, authPhoneAlias=0, pageToken='';
do{
  const raw=await json('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:query',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({maxResults:1000,...(pageToken?{nextPageToken:pageToken}:{})}),
  });
  for(const u of raw?.users||[]){
    authTotal++;
    if(u.emailVerified===true)authVerified++;
    const email=String(u.email||'');
    if(email){authEmail++;if(/^phone-[a-f0-9]+@auth\.tutop\.app$/i.test(email))authPhoneAlias++;}
  }
  pageToken=String(raw?.nextPageToken||'');
}while(pageToken);

const knownCatalog={
  uatx_exists:institutionIds.has('uatx'),
  uatx_riberena_exists:campusById.has('uatx-riberena'),
  uatx_riberena_parent:campusById.get('uatx-riberena')||null,
};

const evidence={
  read_only:true,
  project,
  source_sha:process.env.GITHUB_SHA,
  active_ruleset:release.rulesetName,
  active_rules_sha256:activeSha,
  generated_rules_sha256:generatedSha,
  active_equals_generated:activeSha===generatedSha,
  requires_verified_email:activeRules.includes('email_verified == true'),
  supports_verified_email_bootstrap:activeRules.includes('email_password_verified_beta'),
  catalog:{institutions:institutions.length,campuses:campuses.length,...knownCatalog},
  profile_aggregate:{
    ...profile,
    earliest_created_at:createdTimes.length?new Date(createdTimes[0]).toISOString():null,
    latest_created_at:createdTimes.length?new Date(createdTimes.at(-1)).toISOString():null,
  },
  private_profile_aggregate:{total:privateDocs.length,auth_modes:authModes},
  staging_reset:maintenance,
  account_deletion_requests:deletionRequests.length,
  listing_rate_aggregate:rate,
  auth_aggregate:{total:authTotal,email_accounts:authEmail,email_verified:authVerified,phone_alias_accounts:authPhoneAlias},
  no_uid_or_email_logged:true,
};
console.log(JSON.stringify(evidence,null,2));
