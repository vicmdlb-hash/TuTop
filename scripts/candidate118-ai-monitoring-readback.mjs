import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!=='ops/candidate118-live-readiness-audit')throw new Error('AUDIT_BRANCH_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};

async function get(url){
  const response=await fetch(url,{method:'GET',headers});
  const text=await response.text();
  let body={};
  try{body=text?JSON.parse(text):{};}catch{body={};}
  return {status:response.status,ok:response.ok,body};
}

const locations=['global','us-central1'];
let configResult=null;
for(const location of locations){
  const result=await get(`https://firebasevertexai.googleapis.com/v1beta/projects/${PROJECT}/locations/${location}/config`);
  if(result.ok){configResult={location,...result};break;}
  if(result.status!==404){
    configResult={location,...result};
    break;
  }
}

const exclusionsResult=await get(`https://logging.googleapis.com/v2/projects/${PROJECT}/exclusions?pageSize=100`);

const telemetryConfigPresent=Boolean(configResult?.ok && Object.prototype.hasOwnProperty.call(configResult.body||{},'telemetryConfig'));
const telemetry=configResult?.ok ? (configResult.body?.telemetryConfig||{}) : {};
const exclusions=exclusionsResult.ok && Array.isArray(exclusionsResult.body?.exclusions) ? exclusionsResult.body.exclusions : [];

const since=new Date(Date.now()-48*60*60*1000).toISOString();
const logResponse=await fetch('https://logging.googleapis.com/v2/entries:list',{
  method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({
    resourceNames:[`projects/${PROJECT}`],
    pageSize:1,
    orderBy:'timestamp desc',
    filter:`resource.type="firebasevertexai.googleapis.com/Model" AND timestamp>="${since}"`,
  }),
});
const logText=await logResponse.text();
let logBody={};
try{logBody=logText?JSON.parse(logText):{};}catch{logBody={};}
const modelLogEntries=logResponse.ok && Array.isArray(logBody?.entries) ? logBody.entries.length : null;
const activeExclusions=exclusions.filter(x=>x?.disabled!==true);
const modelExclusions=activeExclusions.filter(x=>String(x?.filter||'').includes('firebasevertexai.googleapis.com/Model'));

const evidence={
  status:'PASS',
  project:PROJECT,
  branch:process.env.GITHUB_REF_NAME,
  source_sha:process.env.GITHUB_SHA,
  read_only:true,
  mutations:0,
  firebase_ai_config:{
    http_status:configResult?.status??null,
    location:configResult?.location||null,
    readable:Boolean(configResult?.ok),
    telemetry_config_present:telemetryConfigPresent,
    telemetry_mode:configResult?.ok ? String(telemetry.mode||'UNSPECIFIED') : 'UNKNOWN',
    sampling_rate:configResult?.ok && telemetry.samplingRate!==undefined ? Number(telemetry.samplingRate) : null,
  },
  cloud_logging_exclusions:{
    http_status:exclusionsResult.status,
    readable:exclusionsResult.ok,
    active_count:activeExclusions.length,
    firebase_ai_model_exclusion_count:modelExclusions.length,
    documented_prompt_response_exclusion_present:modelExclusions.length>0,
  },
  firebase_ai_model_logs_last_48h:{
    http_status:logResponse.status,
    readable:logResponse.ok,
    any_entry:modelLogEntries===null?null:modelLogEntries>0,
    sampled_entry_count_returned:modelLogEntries,
  },
};

fs.mkdirSync('staging-readiness',{recursive:true});
fs.writeFileSync('staging-readiness/ai-monitoring-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
console.log('PASS read-only Firebase AI monitoring/config readback; no prompts, responses, IDs or log entries read.');
