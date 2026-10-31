import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const auth=fs.readFileSync('src/services/verifiedEmailBetaAuth.ts','utf8');
const gate=fs.readFileSync('src/components/BackendGate.tsx','utf8');

assert.match(auth,/async requestPasswordReset\(emailInput: string\)/);
assert.match(auth,/requestType: 'PASSWORD_RESET', email/);
assert.match(auth,/EMAIL_NOT_FOUND\|USER_NOT_FOUND/);
assert.doesNotMatch(auth,/requestPasswordReset[\s\S]{0,1200}persistCanonicalSession/);
assert.match(gate,/type AuthMode = 'login' \| 'register' \| 'legacy' \| 'forgot'/);
assert.match(gate,/Olvidé mi Clave TuTop/);
assert.match(gate,/Por privacidad, TuTop muestra la misma respuesta exista o no una cuenta/);
assert.match(gate,/verifiedEmailBetaAuth\.requestPasswordReset\(email\)/);
assert.match(gate,/Si existe una cuenta TuTop con ese correo/);
assert.match(gate,/disabled=\{busy \|\| !validEmail\}/);

console.log('PASS email/password accounts have a user-visible Firebase reset flow without account enumeration');
console.log('PASS reset request does not mutate the signed-in session or claim SMS recovery');


// Execute the public password-reset handler against synthetic Firebase
// responses. A bad confirmation or transient error must not consume the UI
// listener. A successful reset must close it and prevent duplicate submissions.
const actionSource=fs.readFileSync('public/auth-action.js','utf8');
const nodes=new Map();
for (const id of ['status','action-title','action-copy','return-link','reset-form',
  'new-password','confirm-password','reset-button']) {
  nodes.set(id,{ textContent:'',dataset:{},hidden:id==='reset-form'||id==='return-link',
    value:'',disabled:false,href:'',addEventListener(){} });
}
let submitHandler=null;
let submitOptions=null;
let resolveReady;
const ready=new Promise(resolve=>{resolveReady=resolve;});
nodes.get('reset-form').addEventListener=(name,fn,options)=>{
  assert.equal(name,'submit');
  submitHandler=fn;
  submitOptions=options;
  resolveReady();
};
const posted=[];
const fetchImpl=async (url,init={})=>{
  if(url==='/tutop-web-config.json') return new Response(JSON.stringify({
    projectId:'tutop-beta-vicmdlb-1356585881',apiKey:'synthetic-api-key',
  }),{status:200});
  assert(String(url).includes('identitytoolkit.googleapis.com'));
  const payload=JSON.parse(init.body||'{}');
  posted.push(payload);
  if (!payload.newPassword) return new Response(JSON.stringify({
    email:'synthetic@example.test',requestType:'PASSWORD_RESET',
  }),{status:200});
  if(posted.filter(row=>row.newPassword).length===1){
    return new Response(JSON.stringify({error:{message:'UNAVAILABLE'}}),{status:503});
  }
  return new Response(JSON.stringify({requestType:'PASSWORD_RESET'}),{status:200});
};
vm.runInNewContext(actionSource,{
  document:{getElementById:id=>nodes.get(id)},
  location:{search:'?mode=resetPassword&oobCode=syntheticRecoveryCode123&continueUrl=%2F',
    origin:'https://tutop.example'},
  URL,URLSearchParams,Response,AbortController,setTimeout,clearTimeout,fetch:fetchImpl,console,
},{timeout:2000});
await Promise.race([ready,new Promise((_resolve,reject)=>
  setTimeout(()=>reject(new Error('reset form failed to initialize')),1000))]);
assert.equal(submitOptions?.once,undefined,'reset listener must not be once-only');
const form=nodes.get('reset-form');
const button=nodes.get('reset-button');
const status=nodes.get('status');
const password=nodes.get('new-password');
const confirm=nodes.get('confirm-password');
assert.equal(form.hidden,false,'validated reset link reveals the form');
password.value='synthetic-valid-password';
confirm.value='mismatch';
await submitHandler({preventDefault(){}});
assert.match(status.textContent,/no coinciden/);
assert.equal(posted.filter(row=>row.newPassword).length,0,'invalid confirmation must not POST');
assert.equal(button.disabled,false);
confirm.value=password.value;
await submitHandler({preventDefault(){}});
assert.equal(posted.filter(row=>row.newPassword).length,1);
assert.equal(button.disabled,false,'transient Firebase error must remain retryable');
assert.equal(form.hidden,false);
await submitHandler({preventDefault(){}});
assert.equal(posted.filter(row=>row.newPassword).length,2);
assert.equal(form.hidden,true,'completed reset must close the form');
assert.equal(button.disabled,true,'completed reset blocks duplicate writes');
assert.equal(password.value,'');
assert.equal(confirm.value,'');
assert.equal(nodes.get('return-link').hidden,false);
await submitHandler({preventDefault(){}});
assert.equal(posted.filter(row=>row.newPassword).length,2,'completed reset cannot submit again');
console.log('PASS public reset retries mismatched/failed attempts, and successful reset is terminal');

// Execute the actual bounded Firebase helper at a short synthetic timeout.
// An ambiguous OOB write must abort once and must not auto-replay the POST.
const helperSource=actionSource.slice(actionSource.indexOf('async function readJson('),
  actionSource.indexOf('function safeReturnTarget('));
assert.match(helperSource,/AbortController/);
assert.match(helperSource,/return await readJson\(response\)/);
let timedOutPosts=0;
const timeoutContext={
  AbortController,setTimeout,clearTimeout,Response,console,
  fetch:(_url,{signal})=>{
    timedOutPosts++;
    return new Promise((_resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
  },
};
vm.runInNewContext(helperSource+
  "\nglobalThis.syntheticTimeoutResult = boundedJsonRequest('/synthetic-auth', {method:'POST'}, 12);",
  timeoutContext,{timeout:2000});
await assert.rejects(timeoutContext.syntheticTimeoutResult,{message:'FIREBASE_REQUEST_TIMEOUT'});
assert.equal(timedOutPosts,1,'bounded out-of-band writes cannot be replayed automatically');
assert.match(actionSource,/boundedJsonRequest\('\/tutop-web-config\.json'/);
assert.match(actionSource,/return boundedJsonRequest\(/);
console.log('PASS public Firebase recovery/config requests are bounded with no automatic OOB retry');

