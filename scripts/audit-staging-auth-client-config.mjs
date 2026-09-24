import fs from 'node:fs';
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

const syntheticEmail='tutop-auth-key-probe-never-real@example.invalid';
const probe=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(sdk.apiKey)}`,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:syntheticEmail,password:'NeverARealTuTopPassword!9',returnSecureToken:true}),
});
const probeText=await probe.text();let probeBody={};try{probeBody=probeText?JSON.parse(probeText):{};}catch{}
const message=String(probeBody?.error?.message||'');
if(probe.ok) throw new Error('AUTH_KEY_PROBE_UNEXPECTED_SIGNIN');
if(/API_KEY_INVALID|PROJECT_DISABLED|CONFIGURATION_NOT_FOUND|INVALID_API_KEY/i.test(message)) {
  throw new Error('STAGING_AUTH_CLIENT_API_KEY_REJECTED');
}
// A valid key should reach normal credential handling. Enumeration protection commonly
// returns INVALID_LOGIN_CREDENTIALS; older projects may return EMAIL_NOT_FOUND/USER_NOT_FOUND.
if(!/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|USER_NOT_FOUND|INVALID_PASSWORD/i.test(message)) {
  throw new Error('STAGING_AUTH_CLIENT_KEY_PROBE_UNEXPECTED_'+message.replace(/[^A-Z0-9_]/gi,'_').slice(0,80));
}

console.log(JSON.stringify({
  status:'PASS',
  project:PROJECT,
  hosting_init_matches_firebase_web_config:true,
  auth_client_api_key_accepted:true,
  synthetic_probe_created_account:false,
  sent_email:false,
  mutation:false,
  spend:0,
},null,2));
console.log('PASS Hosting Firebase metadata and live Identity Toolkit client-key path agree for staging.');
