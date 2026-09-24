import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const TARGET='https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/auth-action.html';
const DEFAULT='https://tutop-beta-vicmdlb-1356585881.firebaseapp.com/__/auth/action';
const ACK='CUTOVER_TUTOP_STAGING_AUTH_HANDLER_V1';

if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT) throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_AUTH_HANDLER_CUTOVER_ACK||'')!==ACK) throw new Error('AUTH_HANDLER_CUTOVER_ACK_REQUIRED');
if(!process.argv.includes('--apply')) throw new Error('AUTH_HANDLER_APPLY_FLAG_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={
  Authorization:`Bearer ${token}`,
  'X-Goog-User-Project':PROJECT,
  'Content-Type':'application/json',
};

async function config(){
  const r=await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,{headers});
  const t=await r.text(); let b={}; try{b=t?JSON.parse(t):{};}catch{}
  if(!r.ok) throw new Error(`AUTH_CONFIG_READ_FAILED_${r.status}`);
  return b;
}
function callbackOf(c){return String(c?.notification?.sendEmail?.callbackUri||'').trim();}

async function patchCallback(uri){
  const url=`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=notification.sendEmail.callbackUri`;
  const r=await fetch(url,{
    method:'PATCH',
    headers,
    body:JSON.stringify({
      name:`projects/${PROJECT}/config`,
      notification:{sendEmail:{callbackUri:uri}},
    }),
  });
  const t=await r.text(); let b={}; try{b=t?JSON.parse(t):{};}catch{}
  if(!r.ok){
    const code=String(b?.error?.status||b?.error?.message||`HTTP_${r.status}`).slice(0,180);
    throw new Error(`AUTH_CALLBACK_PATCH_FAILED_${r.status}:${code}`);
  }
  return b;
}

async function assertHandlerReachable(){
  const r=await fetch(TARGET,{redirect:'error',headers:{'Cache-Control':'no-cache'}});
  const html=await r.text();
  if(!r.ok) throw new Error(`AUTH_HANDLER_NOT_REACHABLE_${r.status}`);
  if(!/Acción de cuenta TuTop/i.test(html)||!/auth-action\.js/i.test(html)) throw new Error('AUTH_HANDLER_CONTENT_MISMATCH');
  const cache=String(r.headers.get('cache-control')||'').toLowerCase();
  const frame=String(r.headers.get('x-frame-options')||'').toUpperCase();
  const referrer=String(r.headers.get('referrer-policy')||'').toLowerCase();
  if(!cache.includes('no-store')) throw new Error('AUTH_HANDLER_CACHE_UNSAFE');
  if(frame!=='DENY') throw new Error('AUTH_HANDLER_FRAME_UNSAFE');
  if(referrer!=='no-referrer') throw new Error('AUTH_HANDLER_REFERRER_UNSAFE');
}

await assertHandlerReachable();

const before=await config();
const previous=callbackOf(before);
if(previous!==DEFAULT && previous!==TARGET) throw new Error('AUTH_CALLBACK_UNEXPECTED_PREVIOUS_VALUE');

if(previous===TARGET){
  console.log(JSON.stringify({status:'NOOP_ALREADY_CONFIGURED',project:PROJECT,callbackUri:TARGET,mutation:false,spend:0},null,2));
  process.exit(0);
}

let patched=false;
try{
  await patchCallback(TARGET);
  patched=true;
  const after=await config();
  const actual=callbackOf(after);
  if(actual!==TARGET) throw new Error('AUTH_CALLBACK_READBACK_MISMATCH');
  await assertHandlerReachable();
  console.log(JSON.stringify({
    status:'PASS',
    project:PROJECT,
    previousCallbackUri:previous,
    callbackUri:actual,
    handlerReachable:true,
    mutation:true,
    production:false,
    play:false,
    apk:false,
    spend:0,
  },null,2));
}catch(error){
  if(patched){
    try{
      await patchCallback(previous||DEFAULT);
      const rollback=await config();
      if(callbackOf(rollback)!==(previous||DEFAULT)) throw new Error('ROLLBACK_READBACK_MISMATCH');
      console.error('ROLLBACK PASS: Firebase Auth callback restored after failed cutover validation.');
    }catch(rollbackError){
      console.error(`ROLLBACK FAILED: ${rollbackError instanceof Error?rollbackError.message:String(rollbackError)}`);
    }
  }
  throw error;
}
