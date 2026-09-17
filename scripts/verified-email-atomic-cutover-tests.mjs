import assert from 'node:assert/strict';
import {promoteVerifiedRules} from './verified-email-atomic-cutover.mjs';
const source='email_verified == true; email_password_verified_beta';
function fixture(){let current='old',reads=0;const writes=[];const api={billing:async()=>({billingEnabled:false}),release:async()=>({rulesetName:current}),ruleset:async()=>({source:{files:[{content:'old rules'}]}}),createRuleset:async()=>({name:'new'}),patch:async(name)=>{writes.push(name);current=name;},verify:async()=>{}};return {api,writes,get current(){return current;},set current(v){current=v;}};}
const run=(f,extra={})=>promoteVerifiedRules({api:f.api,source,expectedRuleset:'old',validated:true,...extra});
let tests=0;
const t=async(name,fn)=>{await fn();tests++;console.log('PASS '+name);};
await t('compile does not change release',async()=>{const f=fixture();assert.equal((await run(f)).status,'COMPILED_NOT_RELEASED');assert.deepEqual(f.writes,[]);});
await t('apply blocks without device installation and exclusive window',async()=>{const f=fixture();await assert.rejects(run(f,{apply:true}),/DEVICE/);assert.deepEqual(f.writes,[]);});
await t('billing enabled fails closed before creating Rules',async()=>{const f=fixture();let created=false;f.api.billing=async()=>({billingEnabled:true});f.api.createRuleset=async()=>{created=true;};await assert.rejects(run(f),/SPEND_ZERO/);assert.equal(created,false);});
await t('missing billing evidence fails closed',async()=>{const f=fixture();f.api.billing=async()=>({});await assert.rejects(run(f),/SPEND_ZERO/);});
await t('release drift fails closed',async()=>{const f=fixture();f.current='other';await assert.rejects(run(f),/DRIFT/);});
await t('verified release roundtrip',async()=>{const f=fixture();await run(f,{apply:true,deviceInstalled:true,exclusiveWindow:true});assert.equal(f.current,'new');});
await t('failed directed verification restores old release',async()=>{const f=fixture();f.api.verify=async()=>{throw new Error('directed failure');};await assert.rejects(run(f,{apply:true,deviceInstalled:true,exclusiveWindow:true}),/directed failure/);assert.deepEqual(f.writes,['new','old']);});
await t('concurrent writer is never overwritten by rollback',async()=>{const f=fixture();f.api.verify=async()=>{f.current='other';throw new Error('failure');};await assert.rejects(run(f,{apply:true,deviceInstalled:true,exclusiveWindow:true}),/CONCURRENT_RELEASE/);assert.deepEqual(f.writes,['new']);});
await t('nonstaging project denied',async()=>{const f=fixture();await assert.rejects(run(f,{project:'production'}),/STAGING_ONLY/);});
console.log(tests+'/'+tests+' cutover tests passed');
