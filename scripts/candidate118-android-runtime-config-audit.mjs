import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};

async function get(url){
  const r=await fetch(url,{headers});
  const text=await r.text();
  let body={};
  try{body=text?JSON.parse(text):{};}catch{}
  return {ok:r.ok,status:r.status,body};
}
const apps=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
if(!apps.ok)throw new Error(`ANDROID_APPS_READ_${apps.status}`);
const app=(apps.body.apps||[]).find(x=>x.packageName==='mx.tutop.app'&&x.state!=='DELETED');
if(!app?.name)throw new Error('ANDROID_APP_NOT_FOUND');
const cfg=await get(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
if(!cfg.ok)throw new Error(`ANDROID_CONFIG_READ_${cfg.status}`);
const native=JSON.parse(Buffer.from(cfg.body.configFileContents||'','base64').toString('utf8'));
const keys=[...new Set((native.client||[]).filter(c=>c.client_info?.android_client_info?.package_name==='mx.tutop.app').flatMap(c=>(c.api_key||[]).map(k=>String(k.current_key||'').trim())).filter(Boolean))];

const keyEvidence=[];
for(const key of keys){
  const lookup=await get(`https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(key)}`);
  if(!lookup.ok||!lookup.body?.name){
    keyEvidence.push({lookup_status:lookup.status,readable:false});
    continue;
  }
  const detail=await get(`https://apikeys.googleapis.com/v2/${lookup.body.name}`);
  const restrictions=detail.body?.restrictions||{};
  const targets=Array.isArray(restrictions.apiTargets)?restrictions.apiTargets.map(t=>String(t.service||'')).filter(Boolean):[];
  const androidApps=restrictions.androidKeyRestrictions?.allowedApplications||[];
  keyEvidence.push({
    lookup_status:lookup.status,
    detail_status:detail.status,
    readable:detail.ok,
    api_targets:targets,
    firebase_ai_allowed:targets.length===0||targets.includes('firebasevertexai.googleapis.com'),
    generative_language_allowed:targets.length===0||targets.includes('generativelanguage.googleapis.com'),
    android_application_restricted:Boolean(restrictions.androidKeyRestrictions),
    allowed_android_packages:[...new Set(androidApps.map(x=>String(x.packageName||'')).filter(Boolean))],
    allowed_certificate_count:androidApps.filter(x=>String(x.sha256Fingerprint||'').trim()).length,
  });
}
const services={};
for(const service of ['firebasevertexai.googleapis.com','generativelanguage.googleapis.com','fcm.googleapis.com']){
  const r=await get(`https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}`);
  services[service]={status:r.status,state:r.body?.state||'UNKNOWN'};
}
console.log(JSON.stringify({
 status:'PASS',read_only:true,mutations:0,
 android_app_present:true,
 android_api_key_count:keys.length,
 keys:keyEvidence,
 services,
}));
