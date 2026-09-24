import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BRANCH='candidate/tutop-121-post120-physical-repair';

function required(name){const v=String(process.env[name]||'').trim();if(!v)throw new Error('MISSING_'+name);return v;}
function normalize(value){const v=String(value||'').replace(/:/g,'').toUpperCase();if(!/^[0-9A-F]{64}$/.test(v))throw new Error('ANDROID_CERT_SHA256_INVALID');return v;}
function apk(value){const v=String(value||'').toLowerCase();if(!/^[0-9a-f]{64}$/.test(v))throw new Error('APK_SHA256_INVALID');return v;}

if(process.env.GITHUB_ACTIONS!=='true')throw new Error('GITHUB_ACTIONS_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)throw new Error('EXACT_BINDING_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_ANDROID_SHA256_BIND_ACK||'')!=='BIND_EXACT_STAGING_ANDROID_SHA256')throw new Error('EXPLICIT_SHA256_BIND_ACK_REQUIRED');

const sourceSha=required('GITHUB_SHA');
if(!/^[0-9a-f]{40}$/.test(sourceSha))throw new Error('SOURCE_SHA_INVALID');
const extractedSourceSha=required('TUTOP_NEXT_CANDIDATE_SOURCE_SHA');
if(!/^[0-9a-f]{40}$/.test(extractedSourceSha))throw new Error('EXTRACTED_SOURCE_SHA_INVALID');
if(extractedSourceSha!==sourceSha)throw new Error('CANDIDATE_SOURCE_SHA_MISMATCH');
const apkSha256=apk(required('TUTOP_NEXT_CANDIDATE_APK_SHA256'));
const sha256=normalize(required('TUTOP_ANDROID_CERT_SHA256'));

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'};
async function req(url,options={},allowed=[]){
  const response=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok&&!allowed.includes(response.status))throw new Error('HTTP_'+response.status);
  return {status:response.status,body};
}
const apps=await req(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.body.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.name)throw new Error('STAGING_ANDROID_APP_REQUIRED');
const before=await req(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
const existing=(before.body.certificates||[]).some(x=>x.certType==='SHA_256'&&normalize(x.shaHash)===sha256);
let mutated=false;
if(!existing){
  await req(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`,{
    method:'POST',
    body:JSON.stringify({name:'',shaHash:sha256,certType:'SHA_256'}),
  });
  mutated=true;
}
const after=await req(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
const verified=(after.body.certificates||[]).some(x=>x.certType==='SHA_256'&&normalize(x.shaHash)===sha256);
if(!verified)throw new Error('ANDROID_SHA256_READBACK_FAILED');
console.log(JSON.stringify({
  status:'PASS',project:PROJECT,package:PACKAGE,source_sha:sourceSha,apk_sha256:apkSha256,
  exact_sha256_registered:true,mutated,spend:0,production:false,play:false
},null,2));
