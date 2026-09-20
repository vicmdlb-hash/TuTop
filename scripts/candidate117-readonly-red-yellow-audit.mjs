import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { collectCursorPages } from './firestore-query-pagination.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'').trim()!==PROJECT) throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const base='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','X-Goog-User-Project':PROJECT};

async function req(url,{method='GET',body}={},allow=[]){
  const r=await fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const t=await r.text();
  if(!r.ok && !allow.includes(r.status)) throw new Error('HTTP_'+r.status+' '+method+' '+url+' '+t.slice(0,240));
  if(!t) return null;
  try{return JSON.parse(t)}catch{return t}
}
function sval(doc,key){return String(doc?.fields?.[key]?.stringValue||'')}
function bval(doc,key){return doc?.fields?.[key]?.booleanValue===true}
function hashUid(uid){return crypto.createHash('sha256').update(uid).digest('hex').slice(0,12)}
function rows(raw){return (Array.isArray(raw)?raw:[]).map(x=>x?.document).filter(Boolean).map(d=>({name:String(d.name||''),path:String(d.name||'').split('/documents/')[1]||'',fields:d.fields||{}}))}
function fval(x){if(typeof x==='string')return {stringValue:x}; if(typeof x==='boolean')return {booleanValue:x}; throw new Error('UNSUPPORTED_FILTER')}
function where(filters){return filters.length===1?{fieldFilter:{field:{fieldPath:filters[0].field},op:'EQUAL',value:fval(filters[0].value)}}:{compositeFilter:{op:'AND',filters:filters.map(f=>({fieldFilter:{field:{fieldPath:f.field},op:'EQUAL',value:fval(f.value)}}))}}}
async function runQueryAll(collectionId,filters=[],pageSize=500){
  const w=filters.length?where(filters):undefined;
  return collectCursorPages(async({afterName,pageSize:size})=>{
    const q={from:[{collectionId}],...(w?{where:w}:{}),orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],...(afterName?{startAt:{values:[{referenceValue:afterName}],before:false}}:{}),limit:size};
    return rows(await req('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents:runQuery',{method:'POST',body:{structuredQuery:q}}));
  },{pageSize});
}
async function listDocs(path,pageSize=500){
  const out=[]; let pageToken='';
  do{
    const q=new URLSearchParams({pageSize:String(pageSize)}); if(pageToken)q.set('pageToken',pageToken);
    const raw=await req(base+'/'+path+'?'+q.toString(),{},[404]);
    for(const d of raw?.documents||[])out.push({name:String(d.name||''),path:String(d.name||'').split('/documents/')[1]||'',fields:d.fields||{}});
    pageToken=String(raw?.nextPageToken||'');
  }while(pageToken);
  return out;
}
async function getDoc(path){const r=await req(base+'/'+path,{},[404]);return r?.name?r:null}

const release=await req('https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/releases/cloud.firestore');
const rulesetName=String(release?.rulesetName||'');
const ruleset=rulesetName?await req('https://firebaserules.googleapis.com/v1/'+rulesetName):null;
const rulesText=String((ruleset?.source?.files||[]).map(f=>f.content||'').join('\n')).replace(/\r\n/g,'\n');
const rulesSha=crypto.createHash('sha256').update(rulesText).digest('hex');
let billingEnabled=null;
try{const b=await req('https://cloudbilling.googleapis.com/v1/projects/'+PROJECT+'/billingInfo');billingEnabled=b?.billingEnabled===true}catch{}

const admins=await listDocs('admins');
const allowedRoles=new Set(['super_admin','trust_safety','moderator','institution_moderator','verification_reviewer','support']);
const adminSummary={
  total:admins.length,
  active:admins.filter(d=>bval(d,'active')).length,
  active_moderation:admins.filter(d=>bval(d,'active')&&['super_admin','trust_safety','moderator','institution_moderator'].includes(sval(d,'role'))).length,
  roleless_active:admins.filter(d=>bval(d,'active')&&!sval(d,'role')).length,
  unknown_role_active:admins.filter(d=>bval(d,'active')&&sval(d,'role')&&!allowedRoles.has(sval(d,'role'))).length,
};
const pendingListings=(await runQueryAll('listings_v2',[{field:'moderation_status',value:'pending'}],500)).length;

const requests=await listDocs('account_deletion_requests');
const statusCounts={};
for(const d of requests){const s=sval(d,'status')||'unknown';statusCounts[s]=(statusCounts[s]||0)+1}
const actionable=requests.filter(d=>['pending','processing'].includes(sval(d,'status')));

const directNames=['user_private','notification_preferences','verificationRequests','publicVerifications','reputation','moderationStatus','wallets','users'];
const queryDeletes=[['device_tokens','owner_uid'],['notification_receipts','owner_uid'],['favorites','uid'],['saved_searches','owner_uid'],['wallet_transactions','user_id']];
const withdrawals=[['listings_v2','seller_id'],['demand_requests','buyer_id']];
const retainedOps=[['transactions_v2','buyer_id'],['transactions_v2','seller_id'],['listing_reservation_locks','buyer_id'],['listing_reservation_locks','seller_id'],['offers','buyer_id'],['offers','seller_id'],['chats','buyer_id'],['chats','seller_id'],['reviews','evaluador_id'],['reviews','evaluado_id'],['reports','created_by']];
const terminal=new Set(['completed','cancelled','expired','no_show']);
const erasure=[];

for(const request of actionable){
  const uid=sval(request,'uid')||request.path.split('/').pop()||'';
  if(!uid)continue;
  let directPresent=0;
  for(const c of directNames)if(await getDoc(c+'/'+uid))directPresent++;
  const deleteCounts={};
  for(const [c,f] of queryDeletes)deleteCounts[c]=(await runQueryAll(c,[{field:f,value:uid}],500)).length;
  const withdrawalCounts={};
  for(const [c,f] of withdrawals)withdrawalCounts[c]=(await runQueryAll(c,[{field:f,value:uid}],500)).length;
  const retainedCounts={}; const chatPaths=new Set(); const txMap=new Map();
  for(const [c,f] of retainedOps){
    const docs=await runQueryAll(c,[{field:f,value:uid}],500);
    if(docs.length)retainedCounts[c]=(retainedCounts[c]||0)+docs.length;
    if(c==='chats')for(const d of docs)chatPaths.add(d.path);
    if(c==='transactions_v2')for(const d of docs)txMap.set(d.path,d);
  }
  const nested={messages:0,reads:0,confirmations:0};
  for(const chat of chatPaths)for(const sub of Object.keys(nested))nested[sub]+=(await listDocs(chat+'/'+sub,500)).length;
  const blockers=[...txMap.values()].map(d=>sval(d,'status')||'unknown').filter(s=>!terminal.has(s));
  erasure.push({
    uid_hash:hashUid(uid),
    request_status:sval(request,'status'),
    direct_documents_present:directPresent,
    delete_query_counts:deleteCounts,
    withdrawal_counts:withdrawalCounts,
    retained_counts:retainedCounts,
    nested_chat_counts:nested,
    active_transaction_blockers:blockers.length,
    blocker_statuses:[...new Set(blockers)].sort(),
    dry_run_only:true
  });
}

const report={
  audit:'candidate117-readonly-red-yellow',
  source_sha:String(process.env.GITHUB_SHA||''),
  project:PROJECT,
  mutation_count:0,
  production:false,
  billing_enabled:billingEnabled,
  active_ruleset:rulesetName,
  active_rules_sha256:rulesSha,
  expected_candidate117_rules_sha256:'35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a',
  rules_match_candidate117:rulesSha==='35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a',
  moderation:{...adminSummary,pending_listings:pendingListings,ready_for_real_approval:adminSummary.active_moderation>0},
  deletion_requests:{total:requests.length,status_counts:statusCounts,actionable:actionable.length,dry_runs:erasure},
  conclusion:{
    moderation:adminSummary.active_moderation>0?'ACTIVE_MODERATOR_PRESENT':'HUMAN_ADMIN_BOOTSTRAP_STILL_REQUIRED',
    erasure:actionable.length?'REAL_REQUESTS_READONLY_PLANNED':'NO_PENDING_OR_PROCESSING_REQUEST_TO_DRY_RUN',
  }
};
fs.mkdirSync('candidate117-readonly-audit',{recursive:true});
fs.writeFileSync('candidate117-readonly-audit/audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
