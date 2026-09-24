import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT) throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const response=await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,{
  headers:{Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT},
});
const text=await response.text();
let body={};
try{body=text?JSON.parse(text):{};}catch{}
if(!response.ok) throw new Error(`AUTH_CONFIG_READ_FAILED_${response.status}`);

const callbackUri=String(body?.notification?.sendEmail?.callbackUri||'').trim();
const domains=Array.isArray(body?.authorizedDomains)?body.authorizedDomains.map(String):[];
const state={
  status:'READ_ONLY',
  project:PROJECT,
  callback_uri_configured:Boolean(callbackUri),
  callback_uri_origin:callbackUri ? (()=>{try{return new URL(callbackUri).origin}catch{return 'INVALID'}})() : null,
  authorized_domain_count:domains.length,
  has_default_firebase_domain:domains.some(d=>d.endsWith('.firebaseapp.com')||d.endsWith('.web.app')),
  mutation:false,
  spend:0,
};
console.log(JSON.stringify(state,null,2));
if(callbackUri && state.callback_uri_origin==='INVALID') throw new Error('AUTH_EMAIL_CALLBACK_URI_INVALID');
if(!callbackUri) console.log('GATE FUTURE_AUTH_HANDLER_CALLBACK_REQUIRED: custom handler source exists but Firebase email callback is not configured.');
else console.log('INFO Firebase Auth email callback is configured; exact public reachability still requires Hosting readback.');
