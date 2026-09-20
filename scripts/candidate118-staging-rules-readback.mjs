import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='candidate/tutop-118-publication-self-heal';
const ACK='CANDIDATE118_RULES_READBACK_ONLY';
const EXPECTED_RULESET='projects/tutop-beta-vicmdlb-1356585881/rulesets/dc2d1f98-08bf-46b9-9bf5-d177e5a88c27';
const EXPECTED_SHA='35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a';
const RELEASE='projects/'+PROJECT+'/releases/cloud.firestore';
const GENERATED='firebase/firestore.v2.generated.rules';

function stop(code){throw new Error(code)}
function normalize(v){return String(v||'').replace(/\r\n/g,'\n')}
function sha(v){return crypto.createHash('sha256').update(v).digest('hex')}

if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) stop('STAGING_PROJECT_REQUIRED');
if(process.env.GITHUB_REF_NAME!==BRANCH) stop('BUILD118_BRANCH_REQUIRED');
if(process.env.TUTOP_CANDIDATE118_RULES_ACK!==ACK) stop('BUILD118_RULES_ACK_REQUIRED');
if(!fs.existsSync(GENERATED)) stop('GENERATED_RULES_MISSING');

const token=await firebaseCiAccessToken();
async function get(url){
  const r=await fetch(url,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
  const text=await r.text();
  let body={};
  try{body=text?JSON.parse(text):{}}catch{body={raw:text.slice(0,250)}}
  if(!r.ok) stop('HTTP_'+r.status);
  return body;
}

const release=await get('https://firebaserules.googleapis.com/v1/'+RELEASE);
const active=String(release?.rulesetName||'');
if(active!==EXPECTED_RULESET) stop('ACTIVE_RULESET_DRIFT');

const ruleset=await get('https://firebaserules.googleapis.com/v1/'+active);
const activeText=normalize((ruleset?.source?.files||[]).map(f=>f.content||'').join('\n'));
const activeSha=sha(activeText);
if(activeSha!==EXPECTED_SHA) stop('ACTIVE_RULES_HASH_DRIFT');

const generatedText=normalize(fs.readFileSync(GENERATED,'utf8'));
const generatedSha=sha(generatedText);
if(generatedSha!==EXPECTED_SHA) stop('GENERATED_RULES_NOT_EQUAL_TO_ACTIVE');

for(const tokenText of [
  "request.auth.uid + '-listing_create'",
  'availability_status',
  'email_verified == true',
  'listing_reservation_locks'
]){
  if(!generatedText.includes(tokenText)) stop('EXPECTED_RULE_CONTRACT_MISSING_'+tokenText.replace(/[^A-Za-z0-9]+/g,'_'));
}

const evidence={
  status:'PASS',
  project:PROJECT,
  source_sha:process.env.GITHUB_SHA,
  active_ruleset:active,
  active_rules_sha256:activeSha,
  generated_rules_sha256:generatedSha,
  generated_equals_active:true,
  deploy:false,
  production:false,
  spend:0
};
fs.mkdirSync('staging-candidate118-rules-readback',{recursive:true});
fs.writeFileSync('staging-candidate118-rules-readback/evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
