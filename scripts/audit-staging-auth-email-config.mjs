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
let callbackUrl=null;
try { callbackUrl=callbackUri ? new URL(callbackUri) : null; } catch { callbackUrl=null; }
const callbackPath=callbackUrl?.pathname || '';
const customHandlerConfigured=callbackPath==='/auth-action.html' || callbackPath==='/auth-action';
const state={
  status:'READ_ONLY',
  project:PROJECT,
  callback_uri_configured:Boolean(callbackUri),
  callback_uri_origin:callbackUrl?.origin || (callbackUri ? 'INVALID' : null),
  callback_uri_path:callbackPath || null,
  custom_tutop_handler_configured:customHandlerConfigured,
  authorized_domain_count:domains.length,
  has_default_firebase_domain:domains.some(d=>d.endsWith('.firebaseapp.com')||d.endsWith('.web.app')),
  mutation:false,
  spend:0,
};
console.log(JSON.stringify(state,null,2));
if(callbackUri && state.callback_uri_origin==='INVALID') throw new Error('AUTH_EMAIL_CALLBACK_URI_INVALID');
if(!callbackUri) console.log('GATE FUTURE_AUTH_HANDLER_CALLBACK_REQUIRED: Firebase email callback is not configured.');
else if(!customHandlerConfigured) console.log('GATE FUTURE_AUTH_CUSTOM_HANDLER_REQUIRED: Firebase Auth still points to a non-TuTop email action handler.');
else console.log('PASS Firebase Auth points to the TuTop email action handler; exact public reachability still requires Hosting readback.');
