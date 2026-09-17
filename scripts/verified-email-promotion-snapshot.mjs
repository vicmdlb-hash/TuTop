import fs from 'node:fs';
import crypto from 'node:crypto';
import {firebaseCiAccessToken} from './firebase-ci-auth.mjs';
const project='tutop-beta-vicmdlb-1356585881';
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==project)throw new Error('STAGING_PROJECT_REQUIRED');
const token=await firebaseCiAccessToken();
async function read(url){const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});if(!response.ok)return {available:false,http_status:response.status};return {available:true,data:await response.json()};}
const [billing,release,auth,services]=await Promise.all([
 read('https://cloudbilling.googleapis.com/v1/projects/'+project+'/billingInfo'),
 read('https://firebaserules.googleapis.com/v1/projects/'+project+'/releases/cloud.firestore'),
 read('https://identitytoolkit.googleapis.com/admin/v2/projects/'+project+'/config'),
 read('https://firebaseappcheck.googleapis.com/v1/projects/'+project+'/services'),
]);
const directory='staging-promotion-snapshot';fs.mkdirSync(directory,{recursive:true});
let rules=null;
if(release.available&&release.data.rulesetName){const result=await read('https://firebaserules.googleapis.com/v1/'+release.data.rulesetName);if(result.available){rules=(result.data.source?.files||[]).map(f=>f.content||'').join('\n');fs.writeFileSync(directory+'/rollback.firestore.rules',rules);}}
const evidence={project,source_sha:process.env.GITHUB_SHA,read_only:true,spend:0,
 billing:billing.available?{available:true,billing_enabled:billing.data.billingEnabled===true}:billing,
 current_rules:{available:rules!==null,release_name:release.data?.name,ruleset_name:release.data?.rulesetName,sha256:rules===null?null:crypto.createHash('sha256').update(rules).digest('hex'),requires_verified_email:rules?.includes('email_verified == true')||false,supports_verified_email_bootstrap:rules?.includes('email_password_verified_beta')||false},
 auth:auth.available?{available:true,email_password_enabled:auth.data.signIn?.email?.enabled===true,password_required:auth.data.signIn?.email?.passwordRequired===true}:auth,
 app_check:services.available?{available:true,services:(services.data.services||[]).map(s=>({name:s.name,enforcement_mode:s.enforcementMode}))}:services,
 physical_candidate_promoted:false,shared_rules_mutated:false,real_ai_generated:false,real_fcm_sent:false,
};
fs.writeFileSync(directory+'/read-only-preflight.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
