import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const root=process.argv[2]||'.';
const read=p=>fs.readFileSync(root+'/'+p,'utf8').replace(/\r\n/g, '\n');
function compile(source, names, bindings={}) {
 const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace(/import.meta.env/g,'ENV')).replace(/\bexport /g,'');
 return new Function(...Object.keys(bindings),js+';return {'+names.join(',')+'};')(...Object.values(bindings));
}
const never=()=>new Promise(()=>{});
async function bounded(promise) {
 let timer; try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('test watchdog: operation never settled')),100);})]);}finally{clearTimeout(timer);}
}
function appCheckHarness(plugin, staging=true) {
 const window={setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,Capacitor:{isNativePlatform:()=>true,registerPlugin:name=>plugin}};
 const ENV={VITE_TUTOP_ENVIRONMENT:staging?'staging':'production',VITE_TUTOP_APP_VERSION:'0.9.2-beta.0',VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED:'true'};
 const check=compile(read('src/services/nativeAppCheckToken.ts'),['getNativeAppCheckToken','initializeNativeAppCheck','nativeAppCheckStatus'],{window,ENV});
 return {check,window,ENV};
}
const tests=[
 ['App Check initialization timeout is bounded',async()=>{
  const {check}=appCheckHarness({initialize:never,getToken:never}); assert.equal(await bounded(check.getNativeAppCheckToken()),null);
 }],
 ['App Check token timeout is bounded',async()=>{
  const {check}=appCheckHarness({initialize:async()=>{},getToken:never}); assert.equal(await bounded(check.getNativeAppCheckToken()),null);
 }],
 ['failed native initialization can recover on retry',async()=>{
  let attempts=0; const {check}=appCheckHarness({initialize:async()=>{if(++attempts===1)throw new Error('cold start');},getToken:async()=>({token:'test-token'})});
  assert.equal(await check.getNativeAppCheckToken(),null); assert.equal(await check.getNativeAppCheckToken(),'test-token');
 }],
 ['private QA AI reaches native provider after unavailable attestation',async()=>{
  const h=appCheckHarness({initialize:async()=>{},getToken:never}); let generated=0;
  h.window.Capacitor.registerPlugin=name=>name==='TuTopAI'?{generate:async()=>{generated++;return {text:'provider fixture'};}}:{initialize:async()=>{},getToken:never};
  const ai=compile(read('src/services/nativeTopiAI.ts'),['generateNativeTopiText'],{window:h.window,ENV:h.ENV,...h.check,recordDiagnostic:()=>{}});
  assert.equal((await bounded(ai.generateNativeTopiText('test prompt')))?.provider,'firebase-ai-logic'); assert.equal(generated,1);
 }],
 ['production AI stays fail closed without attestation',async()=>{
  const h=appCheckHarness({initialize:async()=>{},getToken:never},false); let generated=0;
  h.window.Capacitor.registerPlugin=name=>name==='TuTopAI'?{generate:async()=>{generated++;return {text:'bad'};}}:{initialize:async()=>{},getToken:never};
  const ai=compile(read('src/services/nativeTopiAI.ts'),['generateNativeTopiText'],{window:h.window,ENV:h.ENV,...h.check,recordDiagnostic:()=>{}});
  assert.equal(await bounded(ai.generateNativeTopiText('test prompt')),null); assert.equal(generated,0);
 }],
 ['location watch is removed when callback precedes watch id',async()=>{
   const cleared=[]; const geo={checkPermissions:async()=>({coarseLocation:'granted'}),getCurrentPosition:async()=>{throw new Error('timeout');},
    watchPosition:async(_options,cb)=>{cb({coords:{latitude:19,longitude:-99}},null);return 'late-id';},clearWatch:async({id})=>cleared.push(id)};
   const window={setTimeout,clearTimeout,Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>geo}};
   const api=compile(read('src/services/nativeDeviceCapabilities.ts'),['getNativeApproxPosition'],{window});
   assert.equal((await api.getNativeApproxPosition()).latitude,19); await new Promise(r=>setImmediate(r)); assert.deepEqual(cleared,['late-id']);
 }],
 ['location result does not hang when watch cleanup hangs',async()=>{
   let cb; const geo={checkPermissions:async()=>({coarseLocation:'granted'}),getCurrentPosition:async()=>{throw new Error('timeout');},
    watchPosition:async(_options,callback)=>{cb=callback;return 'id';},clearWatch:never};
   const window={setTimeout,clearTimeout,Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>geo}};
   const api=compile(read('src/services/nativeDeviceCapabilities.ts'),['getNativeApproxPosition'],{window});
   const result=api.getNativeApproxPosition(); await new Promise(r=>setImmediate(r)); cb({coords:{latitude:19,longitude:-99}},null);
   assert.equal((await bounded(result)).latitude,19);
 }],
];
let failed=0;for(const [name,run] of tests){try{await run();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
console.log(tests.length-failed+'/'+tests.length+' passed');process.exitCode=failed?1:0;
