import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { collectCursorPages } from './firestore-query-pagination.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='ops/candidate117-erasure-synthetic-smoke';
const CANDIDATE_SHA='a578a214f17f3a0ddb7c0d8c6039866f0252c015';
const RULESET='projects/tutop-beta-vicmdlb-1356585881/rulesets/dc2d1f98-08bf-46b9-9bf5-d177e5a88c27';
const RULES_SHA='35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a';

function stop(x){throw new Error(x)}
if(process.env.GITHUB_ACTIONS!=='true')stop('GITHUB_ACTIONS_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)stop('OPS_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)stop('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_CANDIDATE117_BASE_SHA||'')!==CANDIDATE_SHA)stop('CANDIDATE117_BASE_SHA_REQUIRED');
if(String(process.env.TUTOP_ALLOW_SYNTHETIC_ERASURE||'')!=='candidate117-reviewed')stop('SYNTHETIC_ERASURE_OPT_IN_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','X-Goog-User-Project':PROJECT};
const firestoreBase='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';

async function request(url,options={},allow=[]){
 const r=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
 const t=await r.text();
 if(!r.ok&&!allow.includes(r.status))stop('HTTP_'+r.status+':'+t.slice(0,300));
 if(!t)return null;
 try{return JSON.parse(t)}catch{return t}
}
const billing=await request('https://cloudbilling.googleapis.com/v1/projects/'+PROJECT+'/billingInfo');
if(billing?.billingEnabled!==false)stop('BILLING_MUST_BE_DISABLED');
const release=await request('https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/releases/cloud.firestore');
if(String(release?.rulesetName||'')!==RULESET)stop('ACTIVE_RULESET_DRIFT');
const ruleset=await request('https://firebaserules.googleapis.com/v1/'+RULESET);
const rulesText=String((ruleset?.source?.files||[]).map(f=>f.content||'').join('\n')).replace(/\r\n/g,'\n');
if(crypto.createHash('sha256').update(rulesText).digest('hex')!==RULES_SHA)stop('ACTIVE_RULES_HASH_DRIFT');

function value(input){
 if(input===null)return {nullValue:null};
 if(input instanceof Date)return {timestampValue:input.toISOString()};
 if(typeof input==='string')return {stringValue:input};
 if(typeof input==='boolean')return {booleanValue:input};
 if(Number.isInteger(input))return {integerValue:String(input)};
 if(typeof input==='number')return {doubleValue:input};
 stop('UNSUPPORTED_VALUE');
}
function syntheticUid(){const uid=String(process.env.TUTOP_SYNTHETIC_UID||'').trim(); if(!uid)stop('SYNTHETIC_UID_NOT_SET'); return uid}
function assertSyntheticPath(path){
 const uid=syntheticUid();
 const clean=String(path||'');
 const exactUidCollections=['users','user_private','notification_preferences','verificationRequests','publicVerifications','reputation','moderationStatus','wallets','account_deletion_requests'];
 if(exactUidCollections.some(c=>clean===c+'/'+uid))return;
 if(clean.startsWith('audit_log/account-erasure-'+uid+'-'))return;
 if(clean.includes('erasure-'))return;
 if(clean.startsWith('chats/erasure-chat-')&&(clean.includes('/reads/'+uid)||clean.includes('/confirmations/'+uid)))return;
 stop('NON_SYNTHETIC_WRITE_BLOCKED:'+clean);
}
function queryRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>r?.document).filter(Boolean).map(d=>({name:String(d.name||''),path:String(d.name||'').split('/documents/')[1]||'',fields:d.fields||{}}))}
function structuredWhere(filters=[]){return filters.length===0?undefined:filters.length===1?{fieldFilter:{field:{fieldPath:filters[0].field},op:'EQUAL',value:value(filters[0].value)}}:{compositeFilter:{op:'AND',filters:filters.map(f=>({fieldFilter:{field:{fieldPath:f.field},op:'EQUAL',value:value(f.value)}}))}}}
async function runStructuredQuery(structuredQuery){return queryRows(await request('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents:runQuery',{method:'POST',body:JSON.stringify({structuredQuery})}))}

export async function adminGetDocument(path){const r=await request(firestoreBase+'/'+path,{method:'GET'},[404]); return r?.name?r:null}
export async function adminPatchDocument(path,fields){assertSyntheticPath(path);const mask=Object.keys(fields).map(f=>'updateMask.fieldPaths='+encodeURIComponent(f)).join('&');const payload={fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,value(v)]))};return request(firestoreBase+'/'+path+'?'+mask,{method:'PATCH',body:JSON.stringify(payload)})}
export async function adminDeleteDocument(path){assertSyntheticPath(path);return request(firestoreBase+'/'+path,{method:'DELETE'},[404])}
export async function adminRunQuery(collectionId,filters=[],limit=500){const w=structuredWhere(filters);return runStructuredQuery({from:[{collectionId}],...(w?{where:w}:{}),limit:Math.max(1,Math.min(1000,Number(limit)||500))})}
export async function adminRunQueryAll(collectionId,filters=[],pageSize=500){const w=structuredWhere(filters);return collectCursorPages(async({afterName,pageSize:size})=>runStructuredQuery({from:[{collectionId}],...(w?{where:w}:{}),orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],...(afterName?{startAt:{values:[{referenceValue:afterName}],before:false}}:{}),limit:size}),{pageSize})}
export async function adminListDocuments(collectionPath,pageSize=300){const results=[];let pageToken='';do{const q=new URLSearchParams({pageSize:String(Math.max(1,Math.min(1000,Number(pageSize)||300)))});if(pageToken)q.set('pageToken',pageToken);const raw=await request(firestoreBase+'/'+collectionPath.split('/').map(encodeURIComponent).join('/')+'?'+q,{method:'GET'},[404]);for(const d of raw?.documents||[])results.push({name:String(d.name||''),path:String(d.name||'').split('/documents/')[1]||'',fields:d.fields||{}});pageToken=String(raw?.nextPageToken||'')}while(pageToken);return results}
export async function adminDeleteTestUsers(localIds){const uid=syntheticUid();if(!Array.isArray(localIds)||localIds.length!==1||String(localIds[0])!==uid)stop('NON_SYNTHETIC_AUTH_DELETE_BLOCKED');return request('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchDelete',{method:'POST',body:JSON.stringify({localIds,force:true})})}
