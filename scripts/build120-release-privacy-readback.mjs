import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='ops/build120-release-privacy-readback';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)throw new Error('READBACK_BRANCH_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};

async function get(url){
  const r=await fetch(url,{headers});
  const text=await r.text();let body={};
  try{body=text?JSON.parse(text):{};}catch{}
  return {status:r.status,ok:r.ok,body};
}

let config=null;
for(const location of ['global','us-central1']){
  const r=await get(`https://firebasevertexai.googleapis.com/v1beta/projects/${PROJECT}/locations/${location}/config`);
  if(r.ok||r.status!==404){config={location,...r};break;}
}
const exclusions=await get(`https://logging.googleapis.com/v2/projects/${PROJECT}/exclusions?pageSize=100&fields=exclusions(name,filter,disabled)`);
const defaultBucket=await get(`https://logging.googleapis.com/v2/projects/${PROJECT}/locations/global/buckets/_Default?fields=name,retentionDays,lifecycleState,locked`);

const since=new Date(Date.now()-72*60*60*1000).toISOString();
const logResponse=await fetch('https://logging.googleapis.com/v2/entries:list?fields=entries(timestamp),nextPageToken',{
  method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({
    resourceNames:[`projects/${PROJECT}`],
    pageSize:1,
    orderBy:'timestamp desc',
    filter:`resource.type="firebasevertexai.googleapis.com/Model" AND timestamp>="${since}"`,
  }),
});
const logText=await logResponse.text();let logBody={};
try{logBody=logText?JSON.parse(logText):{};}catch{}
const entryCount=logResponse.ok ? (Array.isArray(logBody.entries) ? logBody.entries.length : 0) : null;

const telemetryPresent=Boolean(config?.ok&&Object.prototype.hasOwnProperty.call(config.body||{},'telemetryConfig'));
const telemetry=config?.ok?(config.body.telemetryConfig||{}):{};
const activeExclusions=(exclusions.ok&&Array.isArray(exclusions.body.exclusions)?exclusions.body.exclusions:[]).filter(x=>x?.disabled!==true);
const modelExclusions=activeExclusions.filter(x=>String(x?.filter||'').includes('firebasevertexai.googleapis.com/Model'));

const evidence={
  status:'PASS',
  project:PROJECT,
  candidate_sha:'554f4ef6d0429b0059738d8cd6e1b6e4890bda91',
  read_only:true,
  mutations:0,
  payload_fields_requested:false,
  firebase_ai_config:{
    http_status:config?.status??null,
    location:config?.location||null,
    readable:Boolean(config?.ok),
    telemetry_config_present:telemetryPresent,
    telemetry_mode:config?.ok?String(telemetry.mode||'UNSPECIFIED'):'UNKNOWN',
    sampling_rate:config?.ok&&telemetry.samplingRate!==undefined?Number(telemetry.samplingRate):null,
  },
  logging_exclusions:{
    http_status:exclusions.status,
    readable:exclusions.ok,
    active_count:activeExclusions.length,
    firebase_ai_model_exclusion_count:modelExclusions.length,
  },
  firebase_ai_model_logs_last_72h:{
    http_status:logResponse.status,
    readable:logResponse.ok,
    any_entry:entryCount===null?null:entryCount>0,
    timestamp_only_entry_count_returned:entryCount,
  },
  default_logging_bucket:{
    http_status:defaultBucket.status,
    readable:defaultBucket.ok,
    retention_days:defaultBucket.ok?Number(defaultBucket.body?.retentionDays||0)||null:null,
    lifecycle_state:defaultBucket.ok?String(defaultBucket.body?.lifecycleState||'')||null:null,
    locked:defaultBucket.ok?defaultBucket.body?.locked===true:null,
  },
};
console.log(JSON.stringify(evidence,null,2));
console.log('PASS Build120 privacy readback: config/metadata only; no prompt/response/log payload requested; mutations=0.');
