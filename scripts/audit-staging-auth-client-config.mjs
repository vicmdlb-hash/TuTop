import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const HOST='https://tutop-beta-vicmdlb-1356585881.web.app';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT) throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
async function adminGet(url){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT}});
  const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok) throw new Error(`ADMIN_HTTP_${response.status}`);
  return body;
}

const apps=await adminGet(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps?pageSize=100`);
const webApp=(apps.apps||[]).find(x=>x.state!=='DELETED');
if(!webApp?.name||!webApp?.appId) throw new Error('STAGING_WEB_APP_REQUIRED');
const sdk=await adminGet(`https://firebase.googleapis.com/v1beta1/${webApp.name}/config`);
if(!sdk?.apiKey||sdk?.projectId!==PROJECT||!sdk?.appId) throw new Error('STAGING_WEB_CONFIG_INVALID');

const initResponse=await fetch(`${HOST}/__/firebase/init.json`,{headers:{'Cache-Control':'no-cache'}});
const initText=await initResponse.text();let init={};try{init=initText?JSON.parse(initText):{};}catch{}
if(!initResponse.ok) throw new Error(`HOSTING_INIT_HTTP_${initResponse.status}`);
if(init.projectId!==PROJECT) throw new Error('HOSTING_INIT_PROJECT_MISMATCH');
if(String(init.apiKey||'')!==String(sdk.apiKey)) throw new Error('HOSTING_INIT_API_KEY_MISMATCH');
if(String(init.appId||'')!==String(sdk.appId)) throw new Error('HOSTING_INIT_APP_ID_MISMATCH');

// Validate the client key through read-only API Keys metadata instead of repeatedly
// issuing synthetic password sign-ins, which can trigger Identity Toolkit abuse/rate limits.
const lookup=await adminGet(`https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(sdk.apiKey)}`);
const keyName=String(lookup?.name||'').trim();
if(!keyName) throw new Error('STAGING_AUTH_CLIENT_API_KEY_LOOKUP_MISSING');
const key=await adminGet(`https://apikeys.googleapis.com/v2/${keyName}`);
if(String(key?.name||'')!==keyName) throw new Error('STAGING_AUTH_CLIENT_API_KEY_READBACK_MISMATCH');

const targets=Array.isArray(key?.restrictions?.apiTargets)?key.restrictions.apiTargets:[];
const services=new Set(targets.map(x=>String(x?.service||'')).filter(Boolean));
const identityToolkitAllowed=targets.length===0 || services.has('identitytoolkit.googleapis.com');
if(!identityToolkitAllowed) throw new Error('STAGING_AUTH_CLIENT_KEY_IDENTITY_TOOLKIT_NOT_ALLOWED');

console.log(JSON.stringify({
  status:'PASS',
  project:PROJECT,
  hosting_init_matches_firebase_web_config:true,
  auth_client_api_key_lookup:true,
  identity_toolkit_allowed:identityToolkitAllowed,
  api_target_restriction_mode:targets.length===0?'UNRESTRICTED_API_TARGETS':'EXPLICIT_API_TARGETS',
  synthetic_credential_probe:false,
  sent_email:false,
  mutation:false,
  spend:0,
},null,2));
console.log('PASS Hosting Firebase metadata, Firebase web config and read-only API-key restrictions agree for staging Auth.');
