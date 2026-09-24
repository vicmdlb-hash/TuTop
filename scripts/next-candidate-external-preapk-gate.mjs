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
const customHandler=callbackUrl && ['/auth-action.html','/auth-action'].includes(callbackUrl.pathname);
if(!customHandler) throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_CONFIGURED');

const handlerResponse=await fetch(callbackUrl.toString(), { redirect:'error', headers:{'Cache-Control':'no-cache'} });
const handlerText=await handlerResponse.text();
if(!handlerResponse.ok) throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_REACHABLE');
if(!/Verificación de correo TuTop/i.test(handlerText) || !/auth-action\.js/i.test(handlerText)) {
  throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CONTENT_MISMATCH');
}
const cacheControl=String(handlerResponse.headers.get('cache-control')||'').toLowerCase();
const frameOptions=String(handlerResponse.headers.get('x-frame-options')||'').toUpperCase();
if(!cacheControl.includes('no-store')) throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CACHE_UNSAFE');
if(frameOptions!=='DENY') throw new Error('NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_FRAME_UNSAFE');

const apps=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.name) throw new Error('STAGING_ANDROID_APP_REQUIRED');
const certs=await get(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
const sha256=(certs.certificates||[]).filter(x=>x.certType==='SHA_256'&&String(x.shaHash||'').trim());
if(!sha256.length) throw new Error('NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED');

console.log(JSON.stringify({
  status:'PASS',
  project:PROJECT,
  package:PACKAGE,
  auth_custom_handler:true,
  auth_callback_origin:callbackUrl.origin,
  auth_callback_path:callbackUrl.pathname,
  auth_handler_reachable:true,
  auth_handler_no_store:true,
  auth_handler_frame_deny:true,
  registered_sha256_count:sha256.length,
  mutation:false,
  spend:0,
  production:false,
  play:false,
},null,2));
console.log('PASS next-candidate pre-APK external gates: custom email handler + Android SHA-256 are present.');
