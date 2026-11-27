import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { projectTemporalMarketplaceReminders } from './temporal-marketplace-reminder-lib.mjs';

const projectId=String(process.env.TUTOP_FIREBASE_PROJECT_ID||'').trim();
const allow=String(process.env.TUTOP_ALLOW_V2_MAINTENANCE||'').trim();
const apply=process.argv.includes('--apply');
const ack=String(process.env.TUTOP_TEMPORAL_NOTIFICATION_APPLY_ACK||'').trim();
const historicalProject='tutop-3a4f7';
const horizonMinutes=Math.max(5,Math.min(180,Number(process.env.TUTOP_TEMPORAL_NOTIFICATION_HORIZON_MINUTES||60)));
const now=Date.now();
const upperIso=new Date(now+horizonMinutes*60_000).toISOString();

function stop(message){console.error('DETENIDO: '+message);process.exit(2);}
if(!projectId)stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if(projectId===historicalProject)stop(historicalProject+' está bloqueado.');
if(/prod(uction)?/i.test(projectId)&&process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE!=='1')stop('el project ID parece producción.');
if(!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId)&&process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID!=='1')stop('el project ID no parece staging/beta/dev/test.');
if(apply&&allow!=='staging-v2')stop('para escribir define TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');
if(apply&&ack!=='SEND_STAGING_TEMPORAL_REMINDERS')stop('para escribir confirma TUTOP_TEMPORAL_NOTIFICATION_APPLY_ACK=SEND_STAGING_TEMPORAL_REMINDERS.');

const token=await firebaseCiAccessToken();
const root=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

function decodeValue(value={}){
  if('nullValue'in value)return null;
  if('stringValue'in value)return value.stringValue;
  if('timestampValue'in value)return value.timestampValue;
  if('booleanValue'in value)return value.booleanValue;
  if('integerValue'in value)return Number(value.integerValue);
  if('doubleValue'in value)return Number(value.doubleValue);
  if('arrayValue'in value)return (value.arrayValue.values||[]).map(decodeValue);
  if('mapValue'in value)return decodeFields(value.mapValue.fields||{});
  return undefined;
}
function decodeFields(fields={}){return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decodeValue(value)]));}
function encodeValue(value,key=''){
  if(value===null||value===undefined)return {nullValue:null};
  if(typeof value==='string'){
    if(/(^|_)at$|^source_event_at$/.test(key)&&/^\d{4}-\d{2}-\d{2}T/.test(value))return {timestampValue:value};
    return {stringValue:value};
  }
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map((item)=>encodeValue(item))}};
  if(typeof value==='object')return {mapValue:{fields:encodeFields(value)}};
  return {stringValue:String(value)};
}
function encodeFields(data){return Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined).map(([key,value])=>[key,encodeValue(value,key)]));}
async function request(url,options={},allowStatuses=[]){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
  const text=await response.text();let data=null;
  if(text){try{data=JSON.parse(text);}catch{data={raw:text};}}
  if(!response.ok&&!allowStatuses.includes(response.status))throw new Error(`NOTIFICATION_PROJECTOR_HTTP_${response.status}`);
  return {status:response.status,data};
}
function decodeRows(rows=[]){
  return rows.filter((row)=>row.document).map((row)=>{
    const name=String(row.document.name||'');const parts=name.split('/documents/').at(-1).split('/');
    return {id:parts.at(-1)||'',...decodeFields(row.document.fields||{})};
  });
}
async function queryByDeadline(field){
  const response=await request(`${root}:runQuery`,{method:'POST',body:JSON.stringify({structuredQuery:{
    from:[{collectionId:'transactions_v2'}],
    where:{compositeFilter:{op:'AND',filters:[
      {fieldFilter:{field:{fieldPath:field},op:'GREATER_THAN',value:{timestampValue:new Date(now).toISOString()}}},
      {fieldFilter:{field:{fieldPath:field},op:'LESS_THAN_OR_EQUAL',value:{timestampValue:upperIso}}},
    ]}},
    orderBy:[{field:{fieldPath:field},direction:'ASCENDING'}],
    limit:300,
  }})});
  return decodeRows(response.data||[]);
}
async function loadPreferences(uid){
  const result=await request(`${root}/notification_preferences/${encodeURIComponent(uid)}`,{},[404]);
  return result.status===404||!result.data?.fields?{}:decodeFields(result.data.fields);
}
async function createOutbox(notification){
  const {id,source_event_at,...payload}=notification;
  const at=new Date().toISOString();
  const document={...payload,source_event_at,created_at:at,updated_at:at};
  return request(`${root}/notification_outbox?documentId=${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({fields:encodeFields(document)})},[409]);
}

const [reservationCandidates,meetupCandidates]=await Promise.all([
  queryByDeadline('reservation_expires_at'),
  queryByDeadline('meetup_at'),
]);
const byId=new Map();
for(const tx of [...reservationCandidates,...meetupCandidates])byId.set(tx.id,tx);
const transactions=[...byId.values()];
const recipients=[...new Set(transactions.flatMap((tx)=>[String(tx.buyer_id||''),String(tx.seller_id||'')]).filter(Boolean))];
const entries=await Promise.all(recipients.map(async(uid)=>[uid,await loadPreferences(uid)]));
const preferencesByUid=new Map(entries);
const projected=projectTemporalMarketplaceReminders({
  transactions,preferencesByUid,now,
  reservationWindowMs:horizonMinutes*60_000,
  meetupWindowMs:horizonMinutes*60_000,
});

let created=0,duplicates=0;
for(const notification of projected){
  if(!apply){created+=1;continue;}
  const result=await createOutbox(notification);
  if(result.status===409)duplicates+=1;else created+=1;
}
console.log(`temporal-reminders: horizon_min=${horizonMinutes}; tx=${transactions.length}; recipients=${recipients.length}; projected=${projected.length}; ${apply?`created=${created} duplicates=${duplicates}`:'dry-run'}.`);
