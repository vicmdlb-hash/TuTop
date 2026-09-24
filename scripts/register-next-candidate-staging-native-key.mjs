import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BRANCH='candidate/tutop-121-post120-physical-repair';
const ACK='BIND_NEXT_CANDIDATE_STAGING_NATIVE_KEY';

function required(name){const v=String(process.env[name]||'').trim();if(!v)throw new Error('MISSING_'+name);return v;}
function sha1(v){const x=String(v||'').replace(/:/g,'').toUpperCase();if(!/^[0-9A-F]{40}$/.test(x))throw new Error('CERT_SHA1_INVALID');return x;}
function apk(v){const x=String(v||'').toLowerCase();if(!/^[0-9a-f]{64}$/.test(x))throw new Error('APK_SHA256_INVALID');return x;}

if(process.env.GITHUB_ACTIONS!=='true')throw new Error('GITHUB_ACTIONS_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)throw new Error('EXACT_BINDING_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_NEXT_CANDIDATE_NATIVE_KEY_ACK||'')!==ACK)throw new Error('NEXT_CANDIDATE_NATIVE_KEY_ACK_REQUIRED');

const sourceSha=required('GITHUB_SHA');
if(!/^[0-9a-f]{40}$/.test(sourceSha))throw new Error('SOURCE_SHA_INVALID');
const extractedSourceSha=required('TUTOP_NEXT_CANDIDATE_SOURCE_SHA');
if(!/^[0-9a-f]{40}$/.test(extractedSourceSha))throw new Error('EXTRACTED_SOURCE_SHA_INVALID');
if(extractedSourceSha!==sourceSha)throw new Error('CANDIDATE_SOURCE_SHA_MISMATCH');
const certSha1=sha1(required('TUTOP_ANDROID_CERT_SHA1'));
const apkSha256=apk(required('TUTOP_NEXT_CANDIDATE_APK_SHA256'));

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'};
async function req(url,options={}){
 const response=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
 const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{}
 if(!response.ok)throw new Error(`HTTP_${response.status}`);
 return body;
}
async function poll(name){
 for(let i=0;i<40;i+=1){
  const body=await req('https://apikeys.googleapis.com/v2/'+name);
  if(body?.done){if(body?.error)throw new Error('API_KEY_PATCH_OPERATION_FAILED');return;}
  await new Promise(resolve=>setTimeout(resolve,750));
 }
 throw new Error('API_KEY_PATCH_TIMEOUT');
}

const apps=await req(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.name)throw new Error('STAGING_ANDROID_APP_REQUIRED');
const cfg=await req(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
const native=JSON.parse(Buffer.from(cfg.configFileContents||'','base64').toString('utf8'));
const keys=[...new Set((native.client||[]).filter(c=>c.client_info?.android_client_info?.package_name===PACKAGE).flatMap(c=>(c.api_key||[]).map(k=>String(k.current_key||'').trim())).filter(Boolean))];
if(keys.length!==1)throw new Error('EXPECTED_ONE_ANDROID_API_KEY_GOT_'+keys.length);

const lookup=await req('https://apikeys.googleapis.com/v2/keys:lookupKey?keyString='+encodeURIComponent(keys[0]));
const keyName=String(lookup?.name||'');if(!keyName)throw new Error('API_KEY_LOOKUP_MISSING_NAME');
const before=await req('https://apikeys.googleapis.com/v2/'+keyName);
const restrictions=before?.restrictions||{};
const targets=Array.isArray(restrictions.apiTargets)?restrictions.apiTargets:[];
const services=new Set(targets.map(t=>String(t.service||'')));
for(const service of ['firebasevertexai.googleapis.com','firebaseinstallations.googleapis.com','fcmregistrations.googleapis.com']){
 if(!services.has(service))throw new Error('REQUIRED_API_TARGET_MISSING_'+service);
}
if(!restrictions.androidKeyRestrictions)throw new Error('ANDROID_KEY_RESTRICTION_NOT_PRESENT');
const allowed=Array.isArray(restrictions.androidKeyRestrictions.allowedApplications)?restrictions.androidKeyRestrictions.allowedApplications:[];
const exact=allowed.some(x=>String(x.packageName||'')===PACKAGE&&sha1(x.sha1Fingerprint)===certSha1);
let mutated=false;
if(!exact){
 const patched=await req('https://apikeys.googleapis.com/v2/'+keyName+'?updateMask=restrictions',{
  method:'PATCH',
  body:JSON.stringify({name:keyName,restrictions:{...restrictions,androidKeyRestrictions:{...restrictions.androidKeyRestrictions,allowedApplications:[...allowed,{packageName:PACKAGE,sha1Fingerprint:certSha1}]}}}),
 });
 if(patched?.name)await poll(patched.name);
 mutated=true;
}
const after=await req('https://apikeys.googleapis.com/v2/'+keyName);
const afterAllowed=after?.restrictions?.androidKeyRestrictions?.allowedApplications||[];
if(!afterAllowed.some(x=>String(x.packageName||'')===PACKAGE&&sha1(x.sha1Fingerprint)===certSha1))throw new Error('NEXT_CANDIDATE_SHA1_READBACK_FAILED');
if(JSON.stringify((after?.restrictions?.apiTargets||[]).map(x=>JSON.stringify(x)).sort())!==JSON.stringify(targets.map(x=>JSON.stringify(x)).sort()))throw new Error('API_TARGETS_CHANGED');

console.log(JSON.stringify({
 status:'PASS',project:PROJECT,package:PACKAGE,source_sha:sourceSha,
 apk_sha256:apkSha256,exact_sha1_registered:true,mutated,spend:0,production:false,play:false,
},null,2));
