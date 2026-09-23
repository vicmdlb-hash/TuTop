import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { projectFavoriteListingTransitions } from './favorite-listing-transition-lib.mjs';

const projectId=String(process.env.TUTOP_FIREBASE_PROJECT_ID||'').trim();
const allow=String(process.env.TUTOP_ALLOW_V2_MAINTENANCE||'').trim();
const apply=process.argv.includes('--apply');
const ack=String(process.env.TUTOP_FAVORITE_WATCH_APPLY_ACK||'').trim();
const historicalProject='tutop-3a4f7';

function stop(message){console.error('DETENIDO: '+message);process.exit(2);}
if(!projectId)stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if(projectId===historicalProject)stop(historicalProject+' está bloqueado.');
if(/prod(uction)?/i.test(projectId)&&process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE!=='1')stop('el project ID parece producción.');
if(!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId)&&process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID!=='1')stop('el project ID no parece staging/beta/dev/test.');
if(apply&&allow!=='staging-v2')stop('para escribir define TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');
if(apply&&ack!=='UPDATE_STAGING_FAVORITE_WATCH_STATE')stop('para escribir confirma TUTOP_FAVORITE_WATCH_APPLY_ACK=UPDATE_STAGING_FAVORITE_WATCH_STATE.');

const token=await firebaseCiAccessToken();
const root=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

function decodeValue(value={}){
  if('nullValue'in value)return null;if('stringValue'in value)return value.stringValue;if('timestampValue'in value)return value.timestampValue;
  if('booleanValue'in value)return value.booleanValue;if('integerValue'in value)return Number(value.integerValue);if('doubleValue'in value)return Number(value.doubleValue);
  if('arrayValue'in value)return (value.arrayValue.values||[]).map(decodeValue);if('mapValue'in value)return decodeFields(value.mapValue.fields||{});return undefined;
}
function decodeFields(fields={}){return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decodeValue(value)]));}
function encodeValue(value,key=''){
  if(value===null||value===undefined)return {nullValue:null};
  if(typeof value==='string'){if(/(^|_)at$|^source_event_at$|^observed_at$/.test(key)&&/^\d{4}-\d{2}-\d{2}T/.test(value))return {timestampValue:value};return {stringValue:value};}
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map((item)=>encodeValue(item))}};
  if(typeof value==='object')return {mapValue:{fields:encodeFields(value)}};return {stringValue:String(value)};
}
function encodeFields(data){return Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined).map(([key,value])=>[key,encodeValue(value,key)]));}
async function request(url,options={},allowStatuses=[]){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
  const text=await response.text();let data=null;if(text){try{data=JSON.parse(text);}catch{data={raw:text};}}
  if(!response.ok&&!allowStatuses.includes(response.status))throw new Error(`${response.status} ${url}: ${text.slice(0,800)}`);
  return {status:response.status,data};
}
function decodeRows(rows=[]){return rows.filter((row)=>row.document).map((row)=>{const name=String(row.document.name||'');const parts=name.split('/documents/').at(-1).split('/');return {id:parts.at(-1)||'',...decodeFields(row.document.fields||{})};});}
async function runQuery(structuredQuery){const response=await request(`${root}:runQuery`,{method:'POST',body:JSON.stringify({structuredQuery})});return decodeRows(response.data||[]);}
async function loadDoc(path){const result=await request(`${root}/${path}`,{},[404]);return result.status===404||!result.data?.fields?null:{id:path.split('/').at(-1),...decodeFields(result.data.fields)};}
async function writeDoc(path,data){return request(`${root}/${path}`,{method:'PATCH',body:JSON.stringify({fields:encodeFields(data)})});}
async function createOutbox(notification){
  const {id,source_event_at,...payload}=notification;const at=new Date().toISOString();
  return request(`${root}/notification_outbox?documentId=${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({fields:encodeFields({...payload,source_event_at,created_at:at,updated_at:at})})},[409]);
}

const favorites=await runQuery({from:[{collectionId:'favorites'}],limit:500});
const listingIds=[...new Set(favorites.map((item)=>String(item.product_id||'')).filter(Boolean))];
const listingEntries=await Promise.all(listingIds.map(async(id)=>[id,await loadDoc(`listings_v2/${encodeURIComponent(id)}`)]));
const listingsById=new Map(listingEntries.filter(([,value])=>value));
const stateEntries=await Promise.all(favorites.map(async(favorite)=>[favorite.id,await loadDoc(`favorite_listing_watch_state/${encodeURIComponent(favorite.id)}`)]));
const statesByFavoriteId=new Map(stateEntries.filter(([,value])=>value));
const ownerUids=[...new Set(favorites.map((item)=>String(item.uid||'')).filter(Boolean))];
const prefEntries=await Promise.all(ownerUids.map(async(uid)=>[uid,await loadDoc(`notification_preferences/${encodeURIComponent(uid)}`).then((value)=>value||{})]));
const preferencesByUid=new Map(prefEntries);
const observedAt=new Date().toISOString();
const projected=projectFavoriteListingTransitions({favorites,listingsById,statesByFavoriteId,preferencesByUid,observedAt});

let notificationsCreated=0,duplicates=0,stateWrites=0;
if(apply){
  // Update notification outbox before advancing the baseline. A duplicate outbox
  // ID is acceptable and still allows the trusted baseline to advance.
  for(const notification of projected.notifications){
    const result=await createOutbox(notification);
    if(result.status===409)duplicates+=1;else notificationsCreated+=1;
  }
  for(const state of projected.stateWrites){
    await writeDoc(`favorite_listing_watch_state/${encodeURIComponent(state.id)}`,state.data);
    stateWrites+=1;
  }
}
console.log(`favorite-watch: favorites=${favorites.length}; listings=${listingsById.size}; notifications=${projected.notifications.length}; state_writes=${projected.stateWrites.length}; ${apply?`created=${notificationsCreated} duplicates=${duplicates} states_applied=${stateWrites}`:'dry-run'}.`);
