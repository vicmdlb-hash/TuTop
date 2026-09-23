import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BRANCH='ops/build120-auth-verification-readback';

function stop(code){throw new Error(code);}
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)stop('READBACK_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)stop('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:'Bearer '+token,'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'};

async function oauthGet(url,allowed=[]){
  const r=await fetch(url,{headers});
  const text=await r.text(); let body={};
  try{body=text?JSON.parse(text):{}}catch{}
  if(!r.ok&&!allowed.includes(r.status))throw new Error('HTTP_'+r.status);
  return {status:r.status,body};
}
async function publicGet(url){
  const r=await fetch(url);
  const text=await r.text(); let body={};
  try{body=text?JSON.parse(text):{}}catch{}
  return {
    status:r.status,
    error_status:String(body?.error?.status||''),
    error_reason:String(body?.error?.details?.[0]?.reason||body?.error?.message||'').slice(0,180),
  };
}
async function keyMeta(keyString){
  const lookup=await oauthGet('https://apikeys.googleapis.com/v2/keys:lookupKey?keyString='+encodeURIComponent(keyString));
  const name=String(lookup.body?.name||'');
  if(!name)stop('KEY_LOOKUP_MISSING');
  const meta=await oauthGet('https://apikeys.googleapis.com/v2/'+name);
  const r=meta.body?.restrictions||{};
  return {
    has_android_restriction:Boolean(r.androidKeyRestrictions),
    android_allowed_apps:Array.isArray(r.androidKeyRestrictions?.allowedApplications)?r.androidKeyRestrictions.allowedApplications.length:0,
    has_browser_restriction:Boolean(r.browserKeyRestrictions),
    browser_allowed_referrers:Array.isArray(r.browserKeyRestrictions?.allowedReferrers)?r.browserKeyRestrictions.allowedReferrers.length:0,
    api_targets:(r.apiTargets||[]).map(x=>String(x.service||'')).filter(Boolean).sort(),
  };
}

const androidApps=await oauthGet('https://firebase.googleapis.com/v1beta1/projects/'+PROJECT+'/androidApps?pageSize=100');
const androidApp=(androidApps.body.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!androidApp?.name)stop('ANDROID_APP_MISSING');
const androidCfg=await oauthGet('https://firebase.googleapis.com/v1beta1/'+androidApp.name+'/config');
const androidJson=JSON.parse(Buffer.from(androidCfg.body.configFileContents||'','base64').toString('utf8'));
const androidKeys=[...new Set((androidJson.client||[]).filter(c=>c.client_info?.android_client_info?.package_name===PACKAGE).flatMap(c=>(c.api_key||[]).map(k=>String(k.current_key||'').trim())).filter(Boolean))];
if(androidKeys.length!==1)stop('ANDROID_KEY_COUNT_'+androidKeys.length);
const androidKey=androidKeys[0];
const androidMeta=await keyMeta(androidKey);

// A browser-like request deliberately carries no x-android-package/cert headers.
// It does not mutate Auth and returns only status/reason.
const androidKeyBrowserProbe=await publicGet('https://identitytoolkit.googleapis.com/v1/projects?key='+encodeURIComponent(androidKey));

const webApps=await oauthGet('https://firebase.googleapis.com/v1beta1/projects/'+PROJECT+'/webApps?pageSize=100', [404]);
const webSummaries=[];
for(const app of webApps.body?.apps||[]){
  if(app.state==='DELETED')continue;
  const cfg=await oauthGet('https://firebase.googleapis.com/v1beta1/'+app.name+'/config');
  const key=String(cfg.body?.apiKey||'').trim();
  if(!key)continue;
  const meta=await keyMeta(key);
  const probe=await publicGet('https://identitytoolkit.googleapis.com/v1/projects?key='+encodeURIComponent(key));
  webSummaries.push({
    display_name:String(app.displayName||''),
    same_key_as_android:key===androidKey,
    restrictions:meta,
    browser_identitytoolkit_probe:probe,
  });
}

const auth=await oauthGet('https://identitytoolkit.googleapis.com/admin/v2/projects/'+PROJECT+'/config');
const verify=auth.body?.notification?.sendEmail?.verifyEmail||{};
const passwordReset=auth.body?.notification?.sendEmail?.resetPassword||{};
const authorizedDomains=Array.isArray(auth.body?.authorizedDomains)?auth.body.authorizedDomains.map(String).sort():[];

const result={
  status:'PASS',
  project:PROJECT,
  mutation:false,
  android_key:{
    restrictions:androidMeta,
    browser_identitytoolkit_probe:androidKeyBrowserProbe,
  },
  web_apps:webSummaries,
  auth:{
    email_enabled:auth.body?.signIn?.email?.enabled===true,
    password_required:auth.body?.signIn?.email?.passwordRequired!==false,
    authorized_domains:authorizedDomains,
    verify_email_template_present:Boolean(Object.keys(verify).length),
    verify_email_custom_action_url:Boolean(String(verify?.customizedActionUri||verify?.actionUrl||'').trim()),
    password_reset_template_present:Boolean(Object.keys(passwordReset).length),
  },
  interpretation:{
    android_key_browser_blocked:androidKeyBrowserProbe.status===403,
    separate_web_key_exists:webSummaries.some(x=>!x.same_key_as_android),
    web_key_browser_probe_ok:webSummaries.some(x=>x.browser_identitytoolkit_probe.status>=200&&x.browser_identitytoolkit_probe.status<400),
  }
};
console.log(JSON.stringify(result,null,2));
