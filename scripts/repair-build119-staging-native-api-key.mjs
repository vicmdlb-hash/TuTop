import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BRANCH='candidate/tutop-119-deviceA-repair';
const ACK='BUILD119_EXACT_APK_CERT';

function required(name){
  const value=String(process.env[name]||'').trim();
  if(!value)throw new Error('MISSING_'+name);
  return value;
}
function normalizeSha1(value){
  const clean=String(value||'').replace(/:/g,'').toUpperCase();
  if(!/^[0-9A-F]{40}$/.test(clean))throw new Error('BUILD119_CERT_SHA1_INVALID');
  return clean;
}
function normalizeSha256(value){
  const clean=String(value||'').trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(clean))throw new Error('BUILD119_APK_SHA256_INVALID');
  return clean;
}

if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)throw new Error('BUILD119_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_BUILD119_NATIVE_KEY_ACK||'')!==ACK)throw new Error('EXPLICIT_BUILD119_BINDING_ACK_REQUIRED');

const sourceSha=required('GITHUB_SHA');
if(!/^[0-9a-f]{40}$/.test(sourceSha))throw new Error('BUILD119_SOURCE_SHA_INVALID');
const certSha1=normalizeSha1(required('TUTOP_BUILD119_CERT_SHA1'));
const apkSha256=normalizeSha256(required('TUTOP_BUILD119_APK_SHA256'));

const token=await firebaseCiAccessToken();
const authHeaders={Authorization:'Bearer '+token,'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'};

async function request(url,options={},allowed=[]){
  const response=await fetch(url,{...options,headers:{...authHeaders,...(options.headers||{})}});
  const text=await response.text();
  let body={};
  try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok&&!allowed.includes(response.status))throw new Error('HTTP_'+response.status);
  return {status:response.status,body};
}
async function poll(name){
  for(let i=0;i<40;i++){
    const r=await request('https://apikeys.googleapis.com/v2/'+name);
    if(r.body?.done){
      if(r.body?.error)throw new Error('API_KEY_PATCH_OPERATION_FAILED');
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,750));
  }
  throw new Error('API_KEY_PATCH_TIMEOUT');
}

const apps=await request('https://firebase.googleapis.com/v1beta1/projects/'+PROJECT+'/androidApps?pageSize=100');
const app=(apps.body.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.name)throw new Error('EXPECTED_ANDROID_APP_NOT_FOUND');

const cfg=await request('https://firebase.googleapis.com/v1beta1/'+app.name+'/config');
const native=JSON.parse(Buffer.from(cfg.body.configFileContents||'','base64').toString('utf8'));
if(native.project_info?.project_id!==PROJECT)throw new Error('ANDROID_CONFIG_PROJECT_MISMATCH');

const keys=[...new Set((native.client||[])
  .filter(c=>c.client_info?.android_client_info?.package_name===PACKAGE)
  .flatMap(c=>(c.api_key||[]).map(k=>String(k.current_key||'').trim()))
  .filter(Boolean))];
if(keys.length!==1)throw new Error('EXPECTED_ONE_ANDROID_API_KEY_GOT_'+keys.length);

const lookup=await request('https://apikeys.googleapis.com/v2/keys:lookupKey?keyString='+encodeURIComponent(keys[0]));
const keyName=String(lookup.body?.name||'');
if(!keyName)throw new Error('API_KEY_LOOKUP_MISSING_NAME');

const before=await request('https://apikeys.googleapis.com/v2/'+keyName);
const restrictions=before.body?.restrictions||{};
const targets=Array.isArray(restrictions.apiTargets)?restrictions.apiTargets:[];
const services=new Set(targets.map(t=>String(t.service||'')));
for(const requiredService of [
  'firebasevertexai.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
]){
  if(!services.has(requiredService))throw new Error('REQUIRED_API_TARGET_MISSING_'+requiredService);
}
if(!restrictions.androidKeyRestrictions)throw new Error('ANDROID_KEY_RESTRICTION_NOT_PRESENT');

const allowed=Array.isArray(restrictions.androidKeyRestrictions.allowedApplications)
  ? restrictions.androidKeyRestrictions.allowedApplications : [];
const exact=allowed.some(x=>String(x.packageName||'')===PACKAGE&&normalizeSha1(x.sha1Fingerprint)===certSha1);

let mutated=false;
if(!exact){
  const nextRestrictions={
    ...restrictions,
    androidKeyRestrictions:{
      ...restrictions.androidKeyRestrictions,
      allowedApplications:[
        ...allowed,
        {packageName:PACKAGE,sha1Fingerprint:certSha1},
      ],
    },
  };
  const patched=await request(
    'https://apikeys.googleapis.com/v2/'+keyName+'?updateMask=restrictions',
    {method:'PATCH',body:JSON.stringify({name:keyName,restrictions:nextRestrictions})},
  );
  if(patched.body?.name)await poll(patched.body.name);
  mutated=true;
}

const after=await request('https://apikeys.googleapis.com/v2/'+keyName);
const afterTargets=after.body?.restrictions?.apiTargets||[];
const afterAllowed=after.body?.restrictions?.androidKeyRestrictions?.allowedApplications||[];
const verified=afterAllowed.some(x=>String(x.packageName||'')===PACKAGE&&normalizeSha1(x.sha1Fingerprint)===certSha1);
if(!verified)throw new Error('EXACT_BUILD119_ANDROID_APPLICATION_RESTRICTION_NOT_VERIFIED');

const beforeServices=targets.map(t=>JSON.stringify(t)).sort();
const afterServices=afterTargets.map(t=>JSON.stringify(t)).sort();
if(JSON.stringify(beforeServices)!==JSON.stringify(afterServices))throw new Error('API_TARGETS_CHANGED_UNEXPECTEDLY');

const evidence={
  status:'PASS',
  project:PROJECT,
  package:PACKAGE,
  build119_source_sha:sourceSha,
  build119_apk_sha256:apkSha256,
  exact_apk_cert_sha1:certSha1,
  before_allowed_application_count:allowed.length,
  after_allowed_application_count:afterAllowed.length,
  exact_build119_app_allowed:true,
  api_targets_preserved:true,
  mutated,
  spend:0,
  production:false,
  play:false,
};
fs.mkdirSync('staging-readiness',{recursive:true});
fs.writeFileSync('staging-readiness/build119-native-key-binding.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
console.log('PASS exact Build119 Android package+signing certificate is allowed on staging Firebase API key; API targets preserved.');
