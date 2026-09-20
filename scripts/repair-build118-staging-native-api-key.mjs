import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BUILD118_SOURCE='e93ca0bb237e7fa438df5801fc627f065d9441e6';
const BUILD118_APK_SHA256='6fadbdb05d6d3b2386eeffc3e2885e9f406190ed9710914048bd1a14a69ac8f7';
const BUILD118_CERT_SHA1='50612E68A13CBF438A2355151135A8D08C126177';
const ACK='BUILD118_EXACT_APK_CERT';

if(String(process.env.GITHUB_REF_NAME||'')!=='fix/build118-deviceA-physical-failures')throw new Error('REPAIR_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_STAGING_NATIVE_KEY_REPAIR_ACK||'')!==ACK)throw new Error('EXPLICIT_REPAIR_ACK_REQUIRED');

const token=await firebaseCiAccessToken();
const authHeaders={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'};

async function request(url,options={},allowed=[]){
  const response=await fetch(url,{...options,headers:{...authHeaders,...(options.headers||{})}});
  const text=await response.text();
  let body={};
  try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok&&!allowed.includes(response.status))throw new Error(`HTTP_${response.status}`);
  return {status:response.status,body};
}
async function poll(name){
  for(let i=0;i<40;i++){
    const r=await request(`https://apikeys.googleapis.com/v2/${name}`);
    if(r.body?.done){
      if(r.body?.error)throw new Error('API_KEY_PATCH_OPERATION_FAILED');
      return;
    }
    await new Promise(r=>setTimeout(r,750));
  }
  throw new Error('API_KEY_PATCH_TIMEOUT');
}

const apps=await request(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.body.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.name)throw new Error('EXPECTED_ANDROID_APP_NOT_FOUND');
const cfg=await request(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
const native=JSON.parse(Buffer.from(cfg.body.configFileContents||'','base64').toString('utf8'));
if(native.project_info?.project_id!==PROJECT)throw new Error('ANDROID_CONFIG_PROJECT_MISMATCH');
const keys=[...new Set((native.client||[])
  .filter(c=>c.client_info?.android_client_info?.package_name===PACKAGE)
  .flatMap(c=>(c.api_key||[]).map(k=>String(k.current_key||'').trim()))
  .filter(Boolean))];
if(keys.length!==1)throw new Error(`EXPECTED_ONE_ANDROID_API_KEY_GOT_${keys.length}`);

const lookup=await request(`https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(keys[0])}`);
const keyName=String(lookup.body?.name||'');
if(!keyName)throw new Error('API_KEY_LOOKUP_MISSING_NAME');
const before=await request(`https://apikeys.googleapis.com/v2/${keyName}`);
const restrictions=before.body?.restrictions||{};
const targets=Array.isArray(restrictions.apiTargets)?restrictions.apiTargets:[];
const services=new Set(targets.map(t=>String(t.service||'')));
for(const required of ['firebasevertexai.googleapis.com','firebaseinstallations.googleapis.com','fcmregistrations.googleapis.com']){
  if(!services.has(required))throw new Error(`REQUIRED_API_TARGET_MISSING_${required}`);
}
if(!restrictions.androidKeyRestrictions)throw new Error('ANDROID_KEY_RESTRICTION_NOT_PRESENT');
const allowed=Array.isArray(restrictions.androidKeyRestrictions.allowedApplications)
  ? restrictions.androidKeyRestrictions.allowedApplications : [];
const normalize=(v)=>String(v||'').replace(/:/g,'').toUpperCase();
const exact=allowed.some(x=>String(x.packageName||'')===PACKAGE&&normalize(x.sha1Fingerprint)===BUILD118_CERT_SHA1);

let mutated=false;
if(!exact){
  const nextRestrictions={
    ...restrictions,
    androidKeyRestrictions:{
      ...restrictions.androidKeyRestrictions,
      allowedApplications:[
        ...allowed,
        {packageName:PACKAGE,sha1Fingerprint:BUILD118_CERT_SHA1},
      ],
    },
  };
  const patched=await request(
    `https://apikeys.googleapis.com/v2/${keyName}?updateMask=restrictions`,
    {method:'PATCH',body:JSON.stringify({name:keyName,restrictions:nextRestrictions})}
  );
  if(patched.body?.name)await poll(patched.body.name);
  mutated=true;
}

const after=await request(`https://apikeys.googleapis.com/v2/${keyName}`);
const afterAllowed=after.body?.restrictions?.androidKeyRestrictions?.allowedApplications||[];
const verified=afterAllowed.some(x=>String(x.packageName||'')===PACKAGE&&normalize(x.sha1Fingerprint)===BUILD118_CERT_SHA1);
if(!verified)throw new Error('EXACT_BUILD118_ANDROID_APPLICATION_RESTRICTION_NOT_VERIFIED');

const evidence={
  status:'PASS',
  project:PROJECT,
  package:PACKAGE,
  build118_source_sha:BUILD118_SOURCE,
  build118_apk_sha256:BUILD118_APK_SHA256,
  exact_apk_cert_sha1:BUILD118_CERT_SHA1,
  before_allowed_application_count:allowed.length,
  after_allowed_application_count:afterAllowed.length,
  exact_build118_app_allowed:true,
  api_targets_preserved:targets.length===(after.body?.restrictions?.apiTargets||[]).length,
  mutated,
  spend:0,
  production:false,
};
fs.mkdirSync('staging-readiness',{recursive:true});
fs.writeFileSync('staging-readiness/build118-native-key-repair.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
console.log('PASS exact Build118 Android package+signing certificate is allowed on the staging Firebase API key; existing API targets preserved.');
