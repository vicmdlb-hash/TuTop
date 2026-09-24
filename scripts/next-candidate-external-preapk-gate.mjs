import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT) throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};
async function get(url){
  const response=await fetch(url,{headers});
  const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok) throw new Error(`HTTP_${response.status}`);
  return body;
}

const auth=await get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`);
const callback=String(auth?.notification?.sendEmail?.callbackUri||'').trim();
let callbackUrl=null;try{callbackUrl=callback?new URL(callback):null;}catch{}
if(!callbackUrl) throw new Error('NEXT_CANDIDATE_AUTH_HANDLER_MISSING');

const customHandler=['/auth-action.html','/auth-action'].includes(callbackUrl.pathname);
const firebaseDefaultHandler=callbackUrl.pathname==='/__/auth/action'
  && [`${PROJECT}.firebaseapp.com`, `${PROJECT}.web.app`].includes(callbackUrl.hostname);
const handlerMode=customHandler ? 'TUTOP_CUSTOM' : firebaseDefaultHandler ? 'FIREBASE_DEFAULT_MANAGED' : 'UNKNOWN';
if(handlerMode==='UNKNOWN') throw new Error('NEXT_CANDIDATE_AUTH_HANDLER_UNRECOGNIZED');

let hardenedCustomHandler=false;
if(customHandler){
  const handlerResponse=await fetch(callbackUrl.toString(), { redirect:'error', headers:{'Cache-Control':'no-cache'} });
  const handlerText=await handlerResponse.text();
  if(!handlerResponse.ok) throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_REACHABLE');
  if(!/Acción de cuenta TuTop/i.test(handlerText) || !/auth-action\.js/i.test(handlerText)) {
    throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CONTENT_MISMATCH');
  }
  const cacheControl=String(handlerResponse.headers.get('cache-control')||'').toLowerCase();
  const frameOptions=String(handlerResponse.headers.get('x-frame-options')||'').toUpperCase();
  const referrerPolicy=String(handlerResponse.headers.get('referrer-policy')||'').toLowerCase();
  const permissionsPolicy=String(handlerResponse.headers.get('permissions-policy')||'').toLowerCase();
  const contentTypeOptions=String(handlerResponse.headers.get('x-content-type-options')||'').toLowerCase();
  if(!cacheControl.includes('no-store')) throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CACHE_UNSAFE');
  if(frameOptions!=='DENY') throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_FRAME_UNSAFE');
  if(referrerPolicy!=='no-referrer') throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_REFERRER_UNSAFE');
  if(!permissionsPolicy.includes('camera=()') || !permissionsPolicy.includes('microphone=()') || !permissionsPolicy.includes('geolocation=()')) throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_PERMISSIONS_UNSAFE');
  if(contentTypeOptions!=='nosniff') throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CONTENT_TYPE_UNSAFE');
  hardenedCustomHandler=true;
}

const domains=Array.isArray(auth?.authorizedDomains)?auth.authorizedDomains.map(String):[];
if(!domains.includes(callbackUrl.hostname)) throw new Error('NEXT_CANDIDATE_AUTH_HANDLER_DOMAIN_NOT_AUTHORIZED');

const apps=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.name) throw new Error('STAGING_ANDROID_APP_REQUIRED');
const certs=await get(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
const sha256=(certs.certificates||[]).filter(x=>x.certType==='SHA_256'&&String(x.shaHash||'').trim());
const normalize=value=>String(value||'').replace(/:/g,'').toUpperCase();
const expectedSha256=normalize(process.env.TUTOP_EXPECTED_ANDROID_CERT_SHA256||'');
if(!/^[0-9A-F]{64}$/.test(expectedSha256)) throw new Error('NEXT_CANDIDATE_SIGNED_CERT_SHA256_REQUIRED');
const exactSha256=sha256.some(x=>normalize(x.shaHash)===expectedSha256);
if(!exactSha256) throw new Error('NEXT_CANDIDATE_EXACT_ANDROID_SHA256_NOT_REGISTERED');

console.log(JSON.stringify({
  status:'PASS',
  project:PROJECT,
  package:PACKAGE,
  auth_handler_mode:handlerMode,
  auth_callback_origin:callbackUrl.origin,
  auth_callback_path:callbackUrl.pathname,
  auth_handler_domain_authorized:true,
  auth_custom_handler_hardened:hardenedCustomHandler,
  registered_sha256_count:sha256.length,
  exact_expected_sha256_registered:true,
  mutation:false,
  spend:0,
  production:false,
  play:false,
},null,2));
console.log(`PASS next-candidate pre-APK external gates: auth handler mode=${handlerMode} + Android SHA-256 are present.`);
