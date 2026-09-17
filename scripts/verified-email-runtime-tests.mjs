import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = fs.readFileSync(process.argv[2] || 'src/services/verifiedEmailBetaAuth.ts', 'utf8').replace(/\r\n/g, '\n');
function harness() {
  let session = null;
  const calls = [];
  let commitError, sendError, lookupWait, lookupVerified=true;
  class Client {
    get currentSession() { return session && {...session}; }
    persistSession(value) { session = value; }
    signOut() { session = null; }
    encodeDocumentForWrite(path, data) { return {path,data}; }
    async commit(writes) { calls.push({kind:'commit',writes}); if(commitError) throw new Error(commitError); }
    async getDocument() { return {data:{uid:'u1'}}; }
    async getIdToken() { return session.idToken; }
  }
  const normalizeMexicoPhone = (input) => {
    const digits=input.replace(/\D/g,'');
    if(digits.length===10) return '+52'+digits;
    if(input.startsWith('+') && digits.length>=10 && digits.length<=15) return '+'+digits;
    throw new Error('INVALID_PHONE');
  };
  const fetch = async (url, options) => {
    const body = options.body instanceof URLSearchParams ? Object.fromEntries(options.body) : JSON.parse(options.body);
    calls.push({kind:url,body});
    if(url.includes('accounts:lookup') && lookupWait) await lookupWait;
    if(url.includes('sendOobCode') && sendError) throw new Error(sendError);
    let data = url.includes('accounts:lookup') ? {users:[{localId:'u1',email:'a@example.test',emailVerified:lookupVerified}]} :
      url.includes('securetoken') ? {user_id:'u1',id_token:'renewed',refresh_token:'r2',expires_in:'3600'} :
      {localId:'u1',idToken:'token',refreshToken:'r1',expiresIn:'3600'};
    return {ok:true,text:async()=>JSON.stringify(data)};
  };
  const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace('export const verifiedEmailBetaAuth','const verifiedEmailBetaAuth');
  const auth=new Function('FirebaseRestClient','getFirebaseConfig','getNativeAppCheckToken','normalizeMexicoPhone','fetch',js+'; return verifiedEmailBetaAuth;')(Client,()=>({apiKey:'test',projectId:'test'}),async()=>null,normalizeMexicoPhone,fetch);
  return {auth,calls,get session(){return session;},set commitError(v){commitError=v;},set sendError(v){sendError=v;},set lookupWait(v){lookupWait=v;},set lookupVerified(v){lookupVerified=v;}};
}
const profile={nombre:'Tester',facultad:'Campus',institution_id:'inst',institution_name:'Institution',campus_id:'camp',campus_name:'Campus'};
const tests = [
 ['optional Mexican phone is normalized before profile commit',async()=>{
   const h=harness(); await h.auth.register('a@example.test','password123',{...profile,phone:'246 123 4567'});
   assert.equal(h.calls.find(c=>c.kind==='commit').writes.find(w=>w.update.path==='user_private/u1').update.data.telefono,'+522461234567');
 }],
 ['invalid optional phone rejected before account creation',async()=>{
   const h=harness(); await assert.rejects(h.auth.register('a@example.test','password123',{...profile,phone:'123'}));
   assert.equal(h.calls.length,0);
 }],
 ['mail transport failure preserves committed account and pending session',async()=>{
   const h=harness(); h.sendError='NETWORK_FAILED'; const result=await h.auth.register('a@example.test','password123',profile);
   assert.equal(result.emailVerified,false); assert.equal(result.verificationEmailSent,false); assert.equal(h.session.uid,'u1');
   assert.equal(h.calls.some(c=>c.kind.includes('accounts:delete')),false);
   h.sendError=null; await h.auth.resendVerificationEmail();
 }],
 ['definite denied profile commit still rolls back Auth',async()=>{
   const h=harness(); h.commitError='PERMISSION_DENIED'; await assert.rejects(h.auth.register('a@example.test','password123',profile),/PERMISSION_DENIED/);
   assert.equal(h.session,null); assert.equal(h.calls.filter(c=>c.kind.includes('accounts:delete')).length,1);
 }],
 ['lookup response after sign-out cannot restore session',async()=>{
   const h=harness(); await h.auth.register('a@example.test','password123',profile);
   h.lookupVerified=false; let release; h.lookupWait=new Promise(r=>release=r); const pending=h.auth.refreshVerificationStatus();
   await new Promise(r=>setImmediate(r)); h.auth.signOut(); release();
   await assert.rejects(pending,/AUTH_SESSION_CHANGED|AUTH_REQUIRED/); assert.equal(h.session,null);
 }],
 ['successful verification refreshes signed token',async()=>{
   const h=harness(); await h.auth.register('a@example.test','password123',profile);
   assert.equal((await h.auth.refreshVerificationStatus()).emailVerified,true);
   assert.equal(h.session.idToken,'renewed');
 }],
];
let failed=0; for(const [name,run] of tests) {try{await run(); console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
console.log(tests.length-failed+'/'+tests.length+' passed'); process.exitCode=failed?1:0;
