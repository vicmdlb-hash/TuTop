import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='ops/build119-national-scope-rules-readback';
const GENERATED='firebase/firestore.v2.generated.rules';
const RELEASE='projects/'+PROJECT+'/releases/cloud.firestore';

function stop(code){throw new Error(code)}
function normalize(v){return String(v||'').replace(/\r\n/g,'\n')}
function sha(v){return crypto.createHash('sha256').update(v).digest('hex')}

if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT)stop('STAGING_PROJECT_REQUIRED');
if(process.env.GITHUB_REF_NAME!==BRANCH)stop('READBACK_BRANCH_REQUIRED');
if(!fs.existsSync(GENERATED))stop('GENERATED_RULES_MISSING');

const token=await firebaseCiAccessToken();
async function get(url){
  const r=await fetch(url,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
  const text=await r.text(); let body={};
  try{body=text?JSON.parse(text):{}}catch{}
  if(!r.ok)stop('HTTP_'+r.status);
  return body;
}
const billing=await get('https://cloudbilling.googleapis.com/v1/projects/'+PROJECT+'/billingInfo');
if(billing.billingEnabled===true)stop('SPEND_ZERO_BILLING_ENABLED');
if(billing.billingEnabled!==false)stop('SPEND_ZERO_BILLING_UNKNOWN');

const release=await get('https://firebaserules.googleapis.com/v1/'+RELEASE);
const active=String(release?.rulesetName||'');
if(!active)stop('ACTIVE_RULESET_MISSING');
const ruleset=await get('https://firebaserules.googleapis.com/v1/'+active);
const activeText=normalize((ruleset?.source?.files||[]).map(f=>f.content||'').join('\n'));
const candidateText=normalize(fs.readFileSync(GENERATED,'utf8'));

for(const [name,text] of [['active',activeText],['candidate',candidateText]]){
  if(text.includes("request.resource.data.visibility_scope != 'national' || request.resource.data.shipping_available == true")){
    stop(name.toUpperCase()+'_CANONICAL_NATIONAL_SHIPPING_MANDATE_PRESENT');
  }
  if(!text.includes("request.resource.data.delivery_methods.size() >= 1"))stop(name.toUpperCase()+'_DELIVERY_MINIMUM_MISSING');
}

const evidence={
  status:'PASS',
  project:PROJECT,
  source_sha:process.env.GITHUB_SHA,
  active_ruleset:active,
  active_rules_sha256:sha(activeText),
  candidate_rules_sha256:sha(candidateText),
  candidate_equals_active:sha(activeText)===sha(candidateText),
  national_requires_shipping:false,
  explicit_delivery_required:true,
  billing_enabled:false,
  deploy:false,
  production:false,
  spend:0
};
console.log(JSON.stringify(evidence));
