import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='probe/build116-publication-live-smoke';
const ACK='BUILD116_P0_SYNTHETIC_PUBLICATION_ONLY';
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) throw new Error('SMOKE_PROJECT_GUARD');
if(process.env.GITHUB_REF_NAME!==BRANCH) throw new Error('SMOKE_BRANCH_GUARD');
if(process.env.TUTOP_PUBLICATION_SMOKE_ACK!==ACK) throw new Error('SMOKE_ACK_GUARD');
if(!fs.existsSync('.tutop-staging-web-config.json')) throw new Error('SMOKE_WEB_CONFIG_MISSING');

const config=JSON.parse(fs.readFileSync('.tutop-staging-web-config.json','utf8'));
if(config.projectId!==PROJECT || !config.apiKey) throw new Error('SMOKE_CONFIG_MISMATCH');
const apiKey=String(config.apiKey);
const run=String(process.env.GITHUB_RUN_ID||'').replace(/\D/g,'').slice(-16);
if(!run) throw new Error('SMOKE_RUN_ID_REQUIRED');

const email='synthetic-publication-'+run+'@example.com';
const password='TuTopSmoke!'+run+'Aa9';
const listingId='synthetic-publication-'+run;
let uid='';
let oauth='';
let stage='INIT';
const createdPaths=[];

function jsonValue(value, field='') {
  if(value===null) return {nullValue:null};
  if(typeof value==='string') {
    if(/(?:_at|published_at|window_start)$/.test(field) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return {timestampValue:value};
    return {stringValue:value};
  }
  if(typeof value==='boolean') return {booleanValue:value};
  if(typeof value==='number') return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value)) return {arrayValue:{values:value.map(v=>jsonValue(v))}};
  if(typeof value==='object') return {mapValue:{fields:encodeFields(value)}};
  throw new Error('UNSUPPORTED_VALUE');
}
function encodeFields(data){return Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined).map(([k,v])=>[k,jsonValue(v,k)]));}
function docName(path){return 'projects/'+PROJECT+'/databases/(default)/documents/'+path;}
function write(path,data){return {update:{name:docName(path),fields:encodeFields(data)},currentDocument:{exists:false}};}
function overwrite(path,data){return {update:{name:docName(path),fields:encodeFields(data)},currentDocument:{exists:true}};}
async function parse(response,label){
  const text=await response.text(); let body={};
  try{body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,200)};}
  if(!response.ok) {
    const message=String(body?.error?.message||body?.error?.status||body?.raw||response.status);
    throw new Error(label+':'+message);
  }
  return body;
}
async function publicPost(url,body,idToken){
  return parse(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(idToken?{Authorization:'Bearer '+idToken}:{})},body:JSON.stringify(body)}),'PUBLIC_POST');
}
function decodeJwt(token){
  const part=String(token||'').split('.')[1]||'';
  return JSON.parse(Buffer.from(part.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
}
async function commit(writes,idToken,label){
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents:commit',{
    method:'POST',headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},body:JSON.stringify({writes})
  });
  return parse(response,label);
}
async function getPublic(path,idToken){
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path,{
    headers:{Authorization:'Bearer '+idToken}
  });
  return parse(response,'READBACK');
}
async function listPublic(collection,idToken){
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+collection+'?pageSize=100',{
    headers:{Authorization:'Bearer '+idToken}
  });
  return parse(response,'LIST_'+collection.toUpperCase());
}
async function adminList(collection){
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+collection+'?pageSize=300',{
    headers:{Authorization:'Bearer '+oauth,'X-Goog-User-Project':PROJECT}
  });
  return parse(response,'ADMIN_LIST_'+collection.toUpperCase());
}
async function adminListAuth(){
  const users=[]; let page='';
  do {
    const params=new URLSearchParams({maxResults:'1000'});
    if(page) params.set('nextPageToken',page);
    const response=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchGet?'+params,{
      headers:{Authorization:'Bearer '+oauth,'X-Goog-User-Project':PROJECT}
    });
    const raw=await parse(response,'AUTH_BATCH_GET');
    users.push(...(raw?.users||[]));
    page=String(raw?.nextPageToken||'');
  } while(page);
  return users;
}
function stringField(doc,field){ return String(doc?.fields?.[field]?.stringValue||''); }
function integerField(doc,field){ return Number(doc?.fields?.[field]?.integerValue||0); }
function timestampField(doc,field){ return String(doc?.fields?.[field]?.timestampValue||''); }
function fieldKind(doc,field){
  const value=doc?.fields?.[field]||{};
  return Object.keys(value)[0]||'missing';
}
function decodeField(value){
  if(!value||typeof value!=='object') return value;
  if('nullValue' in value) return null;
  if('stringValue' in value) return value.stringValue;
  if('booleanValue' in value) return value.booleanValue;
  if('integerValue' in value) return Number(value.integerValue);
  if('doubleValue' in value) return Number(value.doubleValue);
  if('timestampValue' in value) return new Date(value.timestampValue).toISOString();
  if('arrayValue' in value) return (value.arrayValue?.values||[]).map(decodeField);
  if('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields||{}).map(([k,v])=>[k,decodeField(v)]));
  return undefined;
}
function decodeDoc(doc){ return Object.fromEntries(Object.entries(doc?.fields||{}).map(([k,v])=>[k,decodeField(v)])); }
async function auditLiveState(){
  const [usersRaw,rateRaw,privateRaw,moderationRaw]=await Promise.all([
    adminList('users'),
    adminList('rate_limits'),
    adminList('user_private'),
    adminList('moderationStatus')
  ]);
  const users=usersRaw.documents||[];
  const rates=rateRaw.documents||[];
  const privateDocs=privateRaw.documents||[];
  const moderationDocs=moderationRaw.documents||[];
  const now=Date.now();
  const uatx=users.filter(d=>stringField(d,'institution_id')==='uatx'&&stringField(d,'campus_id')==='uatx-riberena');
  const legacyDate=d=>['created_at','fecha_registro','date','fecha'].some(k=>fieldKind(d,k)==='stringValue'&&/^\\d{4}-\\d{2}-\\d{2}T/.test(stringField(d,k)));
  const listingRates=rates.filter(d=>stringField(d,'action')==='listing_create');
  const authModes={};
  for(const d of privateDocs){
    const mode=stringField(d,'auth_mode')||'missing';
    authModes[mode]=(authModes[mode]||0)+1;
  }
  const suspendedTrue=moderationDocs.filter(d=>d?.fields?.suspended?.booleanValue===true).length;
  const authUsers=await adminListAuth();
  const authVerified=authUsers.filter(u=>u.emailVerified===true).length;
  const authDisabled=authUsers.filter(u=>u.disabled===true).length;
  const authPhoneAlias=authUsers.filter(u=>/^phone-[a-f0-9]+@auth\.tutop\.app$/i.test(String(u.email||''))).length;
  const verificationLevelKinds={};
  const facultyIdKinds={};
  const careerIdKinds={};
  for(const d of users){
    const vk=fieldKind(d,'verification_level');
    const fk=fieldKind(d,'faculty_id');
    const ck=fieldKind(d,'career_id');
    verificationLevelKinds[vk]=(verificationLevelKinds[vk]||0)+1;
    facultyIdKinds[fk]=(facultyIdKinds[fk]||0)+1;
    careerIdKinds[ck]=(careerIdKinds[ck]||0)+1;
  }
  const verificationLevelNonInteger=users.filter(d=>!['integerValue','missing'].includes(fieldKind(d,'verification_level'))).length;
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const uatxFacultyNeedles=new Set(['uatx fcea','ciencias economico administrativas','uatx derecho','derecho ciencias politicas y criminologia']);
  const legacyFacultyMatches=users.filter(d=>uatxFacultyNeedles.has(norm(stringField(d,'facultad')))).length;
  const legacyFacultyNonempty=users.filter(d=>Boolean(norm(stringField(d,'facultad')))).length;
  const recentAtBaseCap=listingRates.filter(d=>{
    const start=Date.parse(timestampField(d,'window_start')||stringField(d,'window_start'));
    return integerField(d,'count')>=8&&Number.isFinite(start)&&now-start<60*60_000&&now>=start;
  });
  console.log(JSON.stringify({
    live_profile_audit:{
      users_total:users.length,
      legacy_date_string_profiles:users.filter(legacyDate).length,
      uatx_riberena_profiles:uatx.length,
      uatx_riberena_legacy_date_profiles:uatx.filter(legacyDate).length,
      invalid_name_profiles:users.filter(d=>stringField(d,'nombre').length<2).length,
      listing_rate_buckets:listingRates.length,
      recent_listing_buckets_at_or_above_base_cap:recentAtBaseCap.length,
      user_private_total:privateDocs.length,
      user_private_auth_modes:authModes,
      moderation_status_docs:moderationDocs.length,
      moderation_suspended_true:suspendedTrue,
      verification_level_field_kinds:verificationLevelKinds,
      verification_level_non_integer:verificationLevelNonInteger,
      faculty_id_field_kinds:facultyIdKinds,
      career_id_field_kinds:careerIdKinds,
      legacy_facultad_nonempty:legacyFacultyNonempty,
      legacy_facultad_matches_uatx_faculty:legacyFacultyMatches,
      auth_batchget_aggregate:{
        total:authUsers.length,
        email_verified_true:authVerified,
        disabled_true:authDisabled,
        phone_alias_accounts:authPhoneAlias
      },
      moderation_status_audit:true,
      identities_logged:false
    }
  }));
}

function assertSyntheticPath(path) {
  const safe = uid && (
    path === 'users/'+uid
    || path === 'user_private/'+uid
    || path === 'rate_limits/'+uid+'-listing_create'
    || path === 'listings_v2/'+listingId
  );
  if(!safe) throw new Error('CLEANUP_PATH_GUARD:'+path);
}
async function cleanupFirestore(path) {
  assertSyntheticPath(path);
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path,{
    method:'DELETE',
    headers:{Authorization:'Bearer '+oauth,'X-Goog-User-Project':PROJECT}
  });
  if(!response.ok && response.status!==404) throw new Error('CLEANUP_FIRESTORE_'+response.status);
}
async function cleanupAuth() {
  if(!uid) return;
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchDelete',{
    method:'POST',
    headers:{Authorization:'Bearer '+oauth,'Content-Type':'application/json','X-Goog-User-Project':PROJECT},
    body:JSON.stringify({localIds:[uid],force:true})
  });
  if(!response.ok) throw new Error('CLEANUP_AUTH_'+response.status);
}

try {
  stage='AUTH_ADMIN_CREATE';
  oauth=await firebaseCiAccessToken();
  await auditLiveState();
  const create=await parse(await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts',{
    method:'POST',headers:{Authorization:'Bearer '+oauth,'Content-Type':'application/json'},
    body:JSON.stringify({email,password,emailVerified:true,displayName:'TuTop publication smoke',disabled:false})
  }),'AUTH_ADMIN_CREATE');
  uid=String(create.localId||'');
  if(!uid) throw new Error('AUTH_CREATE_NO_UID');

  stage='AUTH_BATCHGET_SELF_CHECK';
  const authAfterCreate=await adminListAuth();
  const syntheticVisible=authAfterCreate.some(u=>String(u.localId||'')===uid);
  console.log(JSON.stringify({auth_batchget_self_check:{synthetic_visible:syntheticVisible,total_after_create:authAfterCreate.length,identities_logged:false}}));
  if(!syntheticVisible) throw new Error('AUTH_BATCHGET_INSTRUMENT_INVALID');

  stage='AUTH_PUBLIC_SIGNIN';
  const login=await publicPost('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(apiKey),{
    email,password,returnSecureToken:true
  });
  const idToken=String(login.idToken||'');
  const claims=decodeJwt(idToken);
  if(String(login.localId||'')!==uid) throw new Error('AUTH_UID_DRIFT');
  if(claims.email_verified!==true) throw new Error('AUTH_EMAIL_VERIFIED_CLAIM_FALSE');

  stage='PROFILE_BOOTSTRAP';
  const at=new Date().toISOString();
  const profile={
    uid,nombre:'TuTop Synthetic Smoke',facultad:'Turismo Internacional',esta_verificado:false,
    country_code:'MX',institution_id:'uatx',institution_name:'Universidad Autónoma de Tlaxcala',
    campus_id:'uatx-riberena',campus_name:'Ribereña',verification_level:0,verification_badge:'Cuenta TuTop',
    created_at:at,updated_at:at
  };
  const privateData={uid,institutional_email:email,auth_mode:'email_password_verified_beta',created_at:at,updated_at:at};
  await commit([write('users/'+uid,profile),write('user_private/'+uid,privateData)],idToken,'PROFILE_BOOTSTRAP');
  createdPaths.push('user_private/'+uid,'users/'+uid);

  stage='PROFILE_STALE_UPDATE';
  const campusList=await listPublic('campuses',idToken);
  const alternate=(campusList.documents||[]).map(d=>({
    campus_id:String(d?.name||'').split('/').at(-1)||'',
    institution_id:stringField(d,'institution_id')
  })).find(x=>x.campus_id && x.institution_id && (x.campus_id!=='uatx-riberena' || x.institution_id!=='uatx'));
  if(!alternate) throw new Error('NO_ALTERNATE_VALID_CAMPUS_FOR_STALE_PROFILE_PROBE');
  const staleAt=new Date().toISOString();
  const staleProfile={...profile,institution_id:alternate.institution_id,campus_id:alternate.campus_id,updated_at:staleAt};
  await commit([overwrite('users/'+uid,staleProfile)],idToken,'PROFILE_STALE_UPDATE');

  stage='PROFILE_CLIENT_RECONCILE';
  const staleRead=await getPublic('users/'+uid,idToken);
  const staleDecoded=decodeDoc(staleRead);
  const reconciledProfile={
    ...staleDecoded,
    country_code:'MX',
    institution_id:'uatx',
    institution_name:'Universidad Autónoma de Tlaxcala',
    campus_id:'uatx-riberena',
    campus_name:'Ribereña',
    updated_at:new Date().toISOString()
  };
  for(const key of ['faculty_id','faculty_name','career_id','career_name']) delete reconciledProfile[key];
  await commit([overwrite('users/'+uid,reconciledProfile)],idToken,'PROFILE_CLIENT_RECONCILE');
  const reconciledRead=await getPublic('users/'+uid,idToken);
  if(stringField(reconciledRead,'institution_id')!=='uatx'||stringField(reconciledRead,'campus_id')!=='uatx-riberena') {
    throw new Error('PROFILE_CLIENT_RECONCILE_READBACK_MISMATCH');
  }

  stage='LISTING_COMMIT';
  const listingAt=new Date().toISOString();
  const bucket={
    uid,action:'listing_create',window_start:listingAt,count:1,updated_at:listingAt
  };
  const listing={
    schema_version:2,seller_id:uid,institution_id:'uatx',campus_id:'uatx-riberena',
    category_id:'electronica',title:'Synthetic publication smoke',description:'Validación controlada del flujo real de publicación.',
    attributes:{},price_mxn:500,negotiable:true,quantity:1,condition:'Buen estado',
    delivery_methods:['campus_meetup'],meeting_point_ids:[],shipping_available:false,
    photo_urls:['data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>'],
    status:'active',moderation_status:'pending',visibility_scope:'campus',
    published_at:listingAt,created_at:listingAt,updated_at:listingAt
  };
  await commit([
    write('rate_limits/'+uid+'-listing_create',bucket),
    write('listings_v2/'+listingId,listing)
  ],idToken,'LISTING_COMMIT');
  createdPaths.push('listings_v2/'+listingId,'rate_limits/'+uid+'-listing_create');

  stage='LISTING_READBACK';
  const readback=await getPublic('listings_v2/'+listingId,idToken);
  if(!readback?.name?.endsWith('/'+listingId)) throw new Error('LISTING_READBACK_MISSING');

  stage='LEGACY_PROFILE_DATE_PROBE';
  const legacyProfile={...staleProfile,updated_at:new Date().toISOString()};
  const legacyFields=encodeFields(legacyProfile);
  legacyFields.created_at={stringValue:String(profile.created_at)};
  const legacySeed=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/users/'+uid,{
    method:'PATCH',
    headers:{Authorization:'Bearer '+oauth,'Content-Type':'application/json','X-Goog-User-Project':PROJECT},
    body:JSON.stringify({fields:legacyFields})
  });
  await parse(legacySeed,'LEGACY_PROFILE_ADMIN_SEED');
  const legacyRead=await getPublic('users/'+uid,idToken);
  if(fieldKind(legacyRead,'created_at')!=='stringValue') throw new Error('LEGACY_PROFILE_STRING_DATE_NOT_SEEDED');
  const legacyDecoded=decodeDoc(legacyRead);
  const legacyReconciled={
    ...legacyDecoded,
    country_code:'MX',
    institution_id:'uatx',
    institution_name:'Universidad Autónoma de Tlaxcala',
    campus_id:'uatx-riberena',
    campus_name:'Ribereña',
    updated_at:new Date().toISOString()
  };
  for(const key of ['faculty_id','faculty_name','career_id','career_name']) delete legacyReconciled[key];
  let legacyPermissionDenied=false;
  try {
    await commit([overwrite('users/'+uid,legacyReconciled)],idToken,'LEGACY_PROFILE_CLIENT_RECONCILE');
  } catch(error) {
    const raw=String(error instanceof Error?error.message:error);
    legacyPermissionDenied=/Missing or insufficient permissions|PERMISSION_DENIED/i.test(raw);
    if(!legacyPermissionDenied) throw error;
  }
  console.log(JSON.stringify({
    legacy_profile_probe:{
      created_at_string_seeded:true,
      client_full_profile_rewrite_permission_denied:legacyPermissionDenied,
      user_data_logged:false
    }
  }));
  if(!legacyPermissionDenied) throw new Error('LEGACY_PROFILE_RECONCILE_UNEXPECTEDLY_ALLOWED');

  stage='PASS';
  console.log(JSON.stringify({
    result:'PASS',
    stage,
    project:PROJECT,
    verified_claim:true,
    identity:'uatx/uatx-riberena',
    stale_profile_mismatch:true,
    client_profile_reconciled_before_listing:true,
    listing_created_and_read_back:true,
    legacy_string_date_reconcile_denied:true,
    user_data_logged:false,
    cleanup_required:true
  }));
} catch(error) {
  console.error(JSON.stringify({
    result:'FAIL',
    stage,
    error_code:String(error instanceof Error?error.message:error).slice(0,500),
    user_data_logged:false
  }));
  throw error;
} finally {
  const cleanup=[...new Set([
    'listings_v2/'+listingId,
    ...(uid?['rate_limits/'+uid+'-listing_create','user_private/'+uid,'users/'+uid]:[]),
  ])];
  let cleanupErrors=0;
  if(oauth) {
    for(const path of cleanup) {
      try { await cleanupFirestore(path); } catch { cleanupErrors+=1; }
    }
    if(uid) {
      try { await cleanupAuth(); } catch { cleanupErrors+=1; }
    }
  }
  console.log(JSON.stringify({cleanup_attempted:true,synthetic_paths:cleanup.length,auth_cleanup_attempted:Boolean(uid),cleanup_errors:cleanupErrors}));
}