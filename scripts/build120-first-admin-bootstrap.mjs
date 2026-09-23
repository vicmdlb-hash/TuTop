import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { validateFirstAdminBootstrap } from './first-admin-bootstrap-gate-lib.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const apply=process.argv.includes('--apply');
const uid=String(process.env.TUTOP_FIRST_ADMIN_UID||'').trim();
const ack=String(process.env.TUTOP_FIRST_ADMIN_ACK||'').trim();
const token=await firebaseCiAccessToken();
const root=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Goog-User-Project':PROJECT};

async function req(url,options={},allow=[]){
  const r=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const text=await r.text();let body={};
  try{body=text?JSON.parse(text):{}}catch{}
  if(!r.ok&&!allow.includes(r.status))throw new Error('HTTP_'+r.status);
  return {status:r.status,body};
}
function val(v){if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='string')return {stringValue:v};return {nullValue:null};}
async function countActiveAdmins(){
  const body={structuredAggregationQuery:{aggregations:[{alias:'count',count:{}}],structuredQuery:{from:[{collectionId:'admins'}],where:{fieldFilter:{field:{fieldPath:'active'},op:'EQUAL',value:{booleanValue:true}}}}}};
  const r=await req(root+':runAggregationQuery',{method:'POST',body:JSON.stringify(body)});
  return Number(r.body?.[0]?.result?.aggregateFields?.count?.integerValue||0);
}
async function authUserExists(){
  if(!uid)return false;
  const r=await req(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,{method:'POST',body:JSON.stringify({localId:[uid]})},[400,404]);
  return Array.isArray(r.body?.users)&&r.body.users.some(u=>String(u.localId||'')===uid);
}
async function profileExists(){
  if(!uid)return false;
  const r=await req(`${root}/users/${encodeURIComponent(uid)}`,{},[404]);
  return r.status===200;
}

if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(process.env.GITHUB_ACTIONS!=='true')throw new Error('GITHUB_ACTIONS_REQUIRED');

const [adminsActive,authExists,profile]=await Promise.all([countActiveAdmins(),authUserExists(),profileExists()]);
const gate=validateFirstAdminBootstrap({projectId:PROJECT,uid,ack,apply,adminsActive,authUserExists:authExists,profileExists:profile});
console.log(JSON.stringify({status:gate.ok?'PASS':'BLOCKED',mode:apply?'apply':'dry-run',code:gate.code,admins_active:adminsActive,auth_user_exists:authExists,profile_exists:profile,uid_supplied:Boolean(uid),mutation:false},null,2));
if(!gate.ok)throw new Error(gate.code);
if(!apply){
  console.log('PASS first-admin bootstrap dry-run only; no mutation.');
  process.exit(0);
}

const at=new Date().toISOString();
const docBody={fields:{
  active:val(true),
  role:val('owner'),
  source:val('explicit_first_admin_bootstrap'),
  created_at:{timestampValue:at},
  updated_at:{timestampValue:at},
}};
await req(`${root}/admins/${encodeURIComponent(uid)}`,{method:'PATCH',body:JSON.stringify(docBody)});
const readback=await req(`${root}/admins/${encodeURIComponent(uid)}`);
if(readback.body?.fields?.active?.booleanValue!==true)throw new Error('ADMIN_READBACK_FAILED');
console.log(JSON.stringify({status:'PASS',mode:'apply',code:'FIRST_ADMIN_BOOTSTRAPPED',admins_active_before:adminsActive,readback_active:true,mutation:true},null,2));
