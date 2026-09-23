import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { projectListingSavedNotifications } from './listing-saved-notification-projection-lib.mjs';

const projectId=String(process.env.TUTOP_FIREBASE_PROJECT_ID||'').trim();
const allow=String(process.env.TUTOP_ALLOW_V2_MAINTENANCE||'').trim();
const apply=process.argv.includes('--apply');
const ack=String(process.env.TUTOP_LISTING_SAVED_NOTIFICATION_APPLY_ACK||'').trim();
const historicalProject='tutop-3a4f7';
const lookbackMinutes=Math.max(1,Math.min(1440,Number(process.env.TUTOP_LISTING_SAVED_LOOKBACK_MINUTES||15)));
const cutoffIso=new Date(Date.now()-lookbackMinutes*60_000).toISOString();

function stop(message){console.error('DETENIDO: '+message);process.exit(2);}
if(!projectId)stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if(projectId===historicalProject)stop(historicalProject+' está bloqueado.');
if(/prod(uction)?/i.test(projectId)&&process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE!=='1')stop('el project ID parece producción.');
if(!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId)&&process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID!=='1')stop('el project ID no parece staging/beta/dev/test.');
if(apply&&allow!=='staging-v2')stop('para escribir define TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');
if(apply&&ack!=='SEND_STAGING_LISTING_SAVED_ALERTS')stop('para escribir confirma TUTOP_LISTING_SAVED_NOTIFICATION_APPLY_ACK=SEND_STAGING_LISTING_SAVED_ALERTS.');

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
  if(!response.ok&&!allowStatuses.includes(response.status))throw new Error(`${response.status} ${url}: ${text.slice(0,800)}`);
  return {status:response.status,data};
}
function decodeRows(rows=[]){
  return rows.filter((row)=>row.document).map((row)=>{
    const name=String(row.document.name||'');const parts=name.split('/documents/').at(-1).split('/');
    return {id:parts.at(-1)||'',...decodeFields(row.document.fields||{})};
  });
}
async function loadDoc(path){
  const result=await request(`${root}/${path}`,{},[404]);
  if(result.status===404||!result.data?.fields)return null;
  return {id:path.split('/').at(-1),...decodeFields(result.data.fields)};
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

const response=await request(`${root}:runQuery`,{method:'POST',body:JSON.stringify({structuredQuery:{
  from:[{collectionId:'favorites'}],
  where:{fieldFilter:{field:{fieldPath:'created_at'},op:'GREATER_THAN_OR_EQUAL',value:{timestampValue:cutoffIso}}},
  orderBy:[{field:{fieldPath:'created_at'},direction:'DESCENDING'}],
  limit:300,
}})});
const favorites=decodeRows(response.data||[]);
const listingIds=[...new Set(favorites.map((favorite)=>String(favorite.product_id||'')).filter(Boolean))];
const listingEntries=await Promise.all(listingIds.map(async(id)=>[id,await loadDoc(`listings_v2/${encodeURIComponent(id)}`)]));
const listingsById=new Map(listingEntries.filter(([,listing])=>listing));
const sellerUids=[...new Set([...listingsById.values()].map((listing)=>String(listing.seller_id||'')).filter(Boolean))];
const preferenceEntries=await Promise.all(sellerUids.map(async(uid)=>[uid,await loadPreferences(uid)]));
const preferencesByUid=new Map(preferenceEntries);
const projected=projectListingSavedNotifications({favorites,listingsById,preferencesByUid,lookbackMs:lookbackMinutes*60_000});

let created=0,duplicates=0;
for(const notification of projected){
  if(!apply){created+=1;continue;}
  const result=await createOutbox(notification);
  if(result.status===409)duplicates+=1;else created+=1;
}
console.log(`listing-saved-alerts: cutoff=${cutoffIso}; favorites=${favorites.length}; listings=${listingsById.size}; sellers=${sellerUids.length}; projected=${projected.length}; ${apply?`created=${created} duplicates=${duplicates}`:'dry-run'}.`);
