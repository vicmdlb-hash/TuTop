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
const firebaseDefaultHandler=callbackPath==='/__/auth/action'
  && Boolean(callbackUrl)
  && [`${PROJECT}.firebaseapp.com`, `${PROJECT}.web.app`].includes(callbackUrl.hostname);
const handlerMode=customHandlerConfigured ? 'TUTOP_CUSTOM' : firebaseDefaultHandler ? 'FIREBASE_DEFAULT_MANAGED' : 'UNKNOWN';
const state={
  status:'READ_ONLY',
  project:PROJECT,
  callback_uri_configured:Boolean(callbackUri),
  callback_uri_origin:callbackUrl?.origin || (callbackUri ? 'INVALID' : null),
  callback_uri_path:callbackPath || null,
  auth_email_handler_mode:handlerMode,
  custom_tutop_handler_configured:customHandlerConfigured,
  firebase_default_handler:firebaseDefaultHandler,
  authorized_domain_count:domains.length,
  has_default_firebase_domain:domains.some(d=>d.endsWith('.firebaseapp.com')||d.endsWith('.web.app')),
  mutation:false,
  spend:0,
};
console.log(JSON.stringify(state,null,2));
if(callbackUri && state.callback_uri_origin==='INVALID') throw new Error('AUTH_EMAIL_CALLBACK_URI_INVALID');
if(!callbackUri) throw new Error('FUTURE_AUTH_HANDLER_CALLBACK_REQUIRED');
if(handlerMode==='UNKNOWN') throw new Error('FUTURE_AUTH_HANDLER_UNRECOGNIZED');
if(handlerMode==='FIREBASE_DEFAULT_MANAGED') console.log('INFO AUTH_EMAIL_HANDLER_MODE=FIREBASE_DEFAULT_MANAGED; current staging route is readable but successor pre-APK remains blocked on manual Firebase Console custom Action URL.');
else console.log('PASS AUTH_EMAIL_HANDLER_MODE=TUTOP_CUSTOM; exact public reachability remains a separate gate.');
