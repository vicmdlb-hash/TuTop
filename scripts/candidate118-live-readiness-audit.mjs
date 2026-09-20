import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
if (String(process.env.TUTOP_FIREBASE_PROJECT_ID||'') !== PROJECT) throw new Error('STAGING_PROJECT_REQUIRED');
if (String(process.env.GITHUB_REF_NAME||'') !== 'ops/candidate118-live-readiness-audit') throw new Error('AUDIT_BRANCH_REQUIRED');

const token=await firebaseCiAccessToken();
const base=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};

function str(field){return String(field?.stringValue||'').trim();}
function bool(field){return field?.booleanValue===true;}

async function listCollection(collection){
  const docs=[];
  let pageToken='';
  do{
    const q=new URLSearchParams({pageSize:'1000'});
    if(pageToken)q.set('pageToken',pageToken);
    const response=await fetch(`${base}/${encodeURIComponent(collection)}?${q}`,{method:'GET',headers});
    const text=await response.text();
    if(!response.ok)throw new Error(`READ_${collection.toUpperCase()}_FAILED_${response.status}`);
    const body=text?JSON.parse(text):{};
    for(const document of body.documents||[]) docs.push(document.fields||{});
    pageToken=String(body.nextPageToken||'');
  }while(pageToken);
  return docs;
}

function histogram(values){
  const out={};
  for(const value of values){
    const key=value||'missing';
    out[key]=(out[key]||0)+1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));
}

const [admins,deletions,tokens,listings]=await Promise.all([
  listCollection('admins'),
  listCollection('account_deletion_requests'),
  listCollection('device_tokens'),
  listCollection('listings_v2'),
]);

const activeAdmins=admins.filter(d=>bool(d.active));
const evidence={
  status:'PASS',
  project:PROJECT,
  branch:process.env.GITHUB_REF_NAME,
  source_sha:process.env.GITHUB_SHA,
  read_only:true,
  mutations:0,
  admins:{
    total:admins.length,
    active:activeAdmins.length,
    active_roles:histogram(activeAdmins.map(d=>str(d.role))),
  },
  account_deletion_requests:{
    total:deletions.length,
    statuses:histogram(deletions.map(d=>str(d.status))),
  },
  device_tokens:{
    total:tokens.length,
    distinct_owners:new Set(tokens.map(d=>str(d.owner_uid)).filter(Boolean)).size,
    platforms:histogram(tokens.map(d=>str(d.platform))),
  },
  listings_v2:{
    total:listings.length,
    moderation_statuses:histogram(listings.map(d=>str(d.moderation_status))),
    statuses:histogram(listings.map(d=>str(d.status))),
  },
};

fs.mkdirSync('staging-readiness',{recursive:true});
fs.writeFileSync('staging-readiness/evidence.json',JSON.stringify(evidence,null,2)+'\n');

console.log(JSON.stringify(evidence));
console.log('PASS read-only live staging readiness audit; no document IDs, UIDs, emails or tokens emitted.');
