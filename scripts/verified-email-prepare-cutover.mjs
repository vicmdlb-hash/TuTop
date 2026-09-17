import fs from 'node:fs';
import crypto from 'node:crypto';
import {firebaseCiAccessToken} from './firebase-ci-auth.mjs';
import {promoteVerifiedRules,STAGING} from './verified-email-atomic-cutover.mjs';
if(process.argv.includes('--apply'))throw new Error('DEVICE_INSTALL_COORDINATION_REQUIRED_NO_APPLY_ENTRYPOINT');
const source=fs.readFileSync('firebase/firestore.v2.generated.rules','utf8').replace(/\r\n/g,'\n');
const testedHash='b903644ebb5b28b3aef4ab38131a8a79d86c7d3c0e552868601fbf4a69fdf572';
if(crypto.createHash('sha256').update(source).digest('hex')!==testedHash)throw new Error('RULES_DIFFERS_FROM_73_PASS_EMULATOR_SOURCE');
const token=await firebaseCiAccessToken();
const releaseName='projects/'+STAGING+'/releases/cloud.firestore';
async function request(url,body){const res=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!res.ok)throw new Error('PREPARE_HTTP_'+res.status);return res.json();}
const api={billing:()=>request('https://cloudbilling.googleapis.com/v1/projects/'+STAGING+'/billingInfo'),release:()=>request('https://firebaserules.googleapis.com/v1/'+releaseName),ruleset:name=>request('https://firebaserules.googleapis.com/v1/'+name),createRuleset:content=>request('https://firebaserules.googleapis.com/v1/projects/'+STAGING+'/rulesets',{source:{files:[{name:'firestore.rules',content}]}})};
const snapshot=JSON.parse(fs.readFileSync('staging-promotion-snapshot/read-only-preflight.json','utf8'));
const records=[];
const result=await promoteVerifiedRules({api,project:process.env.TUTOP_FIREBASE_PROJECT_ID,source,expectedRuleset:snapshot.current_rules.ruleset_name,validated:true,record:value=>records.push(value)});
fs.writeFileSync('staging-promotion-snapshot/compiled-not-released.json',JSON.stringify({...result,rules_sha256:testedHash,regression_pass:73,regression_fail:0,candidate_source_sha:'ab58367944a59b8d86ed6c0554840860ef6eceb7',tool_source_sha:process.env.GITHUB_SHA,shared_staging_rules_mutated:false,spend:0,records},null,2)+'\n');
console.log(JSON.stringify(result));
