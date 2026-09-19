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
function serverTimedWrite(path,data,serverFields){
  const filtered=Object.fromEntries(Object.entries(data).filter(([key])=>!serverFields.includes(key)));
  return {
    update:{name:docName(path),fields:encodeFields(filtered)},
    updateTransforms:serverFields.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'})),
    currentDocument:{exists:false}
  };
}
function serverTimedOverwrite(path,data,serverFields){
  const filtered=Object.fromEntries(Object.entries(data).filter(([key])=>!serverFields.includes(key)));
  return {
    update:{name:docName(path),fields:encodeFields(filtered)},
    updateTransforms:serverFields.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'})),
    currentDocument:{exists:true}
  };
}
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
  const authByUid=new Map(authUsers.map(u=>[String(u.localId||''),u]));
  const profileUids=users.map(d=>String(d?.name||'').split('/').at(-1)||'').filter(Boolean);
  const matchedProfileAuth=profileUids.map(id=>authByUid.get(id)).filter(Boolean);
  const privateByUid=new Map(privateDocs.map(d=>[String(d?.name||'').split('/').at(-1)||'',d]));
  const emailModeProfileUids=profileUids.filter(id=>stringField(privateByUid.get(id),'auth_mode')==='email_password_verified_beta');
  const phoneModeProfileUids=profileUids.filter(id=>stringField(privateByUid.get(id),'auth_mode')==='phone_password_beta');
  const emailModeMatched=emailModeProfileUids.map(id=>authByUid.get(id)).filter(Boolean);
  const phoneModeMatched=phoneModeProfileUids.map(id=>authByUid.get(id)).filter(Boolean);
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
      auth_profile_correlation:{
        firestore_profiles:profileUids.length,
        profiles_with_auth_match:matchedProfileAuth.length,
        matched_verified_true:matchedProfileAuth.filter(u=>u.emailVerified===true).length,
        matched_disabled_true:matchedProfileAuth.filter(u=>u.disabled===true).length,
        email_mode_profiles:emailModeProfileUids.length,
        email_mode_auth_matches:emailModeMatched.length,
        email_mode_verified_true:emailModeMatched.filter(u=>u.emailVerified===true).length,
        email_mode_disabled_true:emailModeMatched.filter(u=>u.disabled===true).length,
        phone_mode_profiles:phoneModeProfileUids.length,
        phone_mode_auth_matches:phoneModeMatched.length,
        phone_mode_verified_true:phoneModeMatched.filter(u=>u.emailVerified===true).length,
        phone_mode_alias_matches:phoneModeMatched.filter(u=>/^phone-[a-f0-9]+@auth\.tutop\.app$/i.test(String(u.email||''))).length
      },
      moderation_status_audit:true,
      identities_logged:false
    }
  }));
}

async function auditActiveRulesContract() {
  const headers={Authorization:'Bearer '+oauth,'X-Goog-User-Project':PROJECT};
  const release=await parse(
    await fetch('https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/releases/cloud.firestore',{headers}),
    'RULES_RELEASE_READ'
  );
  const rulesetName=String(release?.rulesetName||'');
  if(!rulesetName.startsWith('projects/'+PROJECT+'/rulesets/')) throw new Error('RULES_RELEASE_RULESET_MISSING');
  const ruleset=await parse(
    await fetch('https://firebaserules.googleapis.com/v1/'+rulesetName,{headers}),
    'RULESET_READ'
  );
  const content=(ruleset?.source?.files||[]).map(file=>String(file?.content||'')).join('\n');
  const start=content.indexOf('match /listings_v2/{listingId}');
  const end=start>=0?content.indexOf('match /offers/{offerId}',start):-1;
  const section=start>=0?content.slice(start,end>start?end:Math.min(content.length,start+14000)):'';
  const audit={
    ruleset_name:rulesetName,
    canonical_listings_v2_present:start>=0,
    title_min_2:/title\.size\(\)\s*>=\s*2/.test(section),
    title_max_120:/title\.size\(\)\s*<=\s*120/.test(section),
    quantity_integer:/quantity\s+is\s+int/.test(section),
    price_max_1000000:/price_mxn\s*<=\s*1000000/.test(section),
    national_requires_shipping:/visibility_scope\s*!=\s*'national'\s*\|\|\s*request\.resource\.data\.shipping_available\s*==\s*true/.test(section),
    video_urls_allowed_create_key:/hasOnly\(\[[\s\S]*?'video_urls'/.test(section),
    seller_profile_identity_coupling:/productMatchesSellerIdentity\(request\.resource\.data,\s*request\.auth\.uid\)/.test(section),
    rules_content_logged:false
  };
  console.log(JSON.stringify({live_rules_contract_audit:audit}));
  if(!audit.canonical_listings_v2_present || !audit.title_min_2 || audit.seller_profile_identity_coupling) {
    throw new Error('LIVE_RULES_CONTRACT_UNEXPECTED');
  }
  return audit;
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
  const liveRulesContract=await auditActiveRulesContract();
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


  stage='PUBLICATION_PAYLOAD_MATRIX';
  async function clearSyntheticPublication() {
    await cleanupFirestore('listings_v2/'+listingId);
    await cleanupFirestore('rate_limits/'+uid+'-listing_create');
  }
  async function runPayloadVariant(name, overrides, expected, atOffsetMs=0) {
    await clearSyntheticPublication();
    const variantAt=new Date(Date.now()+atOffsetMs).toISOString();
    const variantListing={
      ...listing,
      ...overrides,
      published_at:variantAt,
      created_at:variantAt,
      updated_at:variantAt
    };
    const variantBucket={uid,action:'listing_create',window_start:variantAt,count:1,updated_at:variantAt};
    let outcome='PASS';
    let errorCode='';
    try {
      await commit([
        write('rate_limits/'+uid+'-listing_create',variantBucket),
        write('listings_v2/'+listingId,variantListing)
      ],idToken,'MATRIX_'+name);
      const check=await getPublic('listings_v2/'+listingId,idToken);
      if(!check?.name?.endsWith('/'+listingId)) throw new Error('MATRIX_READBACK_MISSING');
    } catch(error) {
      outcome='DENIED';
      errorCode=String(error instanceof Error?error.message:error).slice(0,160);
    }
    const ok=outcome===expected;
    console.log(JSON.stringify({publication_payload_matrix:{name,outcome,expected,ok,error_class:/Missing or insufficient permissions|PERMISSION_DENIED/i.test(errorCode)?'permission_denied':(errorCode?'other':'none'),user_data_logged:false}}));
    if(!ok) throw new Error('MATRIX_UNEXPECTED_'+name+'_'+outcome);
  }

  async function runTimeIsolationVariant(name, listingOffsetMs, bucketOffsetMs, expected) {
    await clearSyntheticPublication();
    const listingAt=new Date(Date.now()+listingOffsetMs).toISOString();
    const bucketAt=new Date(Date.now()+bucketOffsetMs).toISOString();
    const variantListing={...listing,published_at:listingAt,created_at:listingAt,updated_at:listingAt};
    const variantBucket={uid,action:'listing_create',window_start:bucketAt,count:1,updated_at:bucketAt};
    let outcome='PASS'; let errorCode='';
    try {
      await commit([
        write('rate_limits/'+uid+'-listing_create',variantBucket),
        write('listings_v2/'+listingId,variantListing)
      ],idToken,'TIME_'+name);
      const check=await getPublic('listings_v2/'+listingId,idToken);
      if(!check?.name?.endsWith('/'+listingId)) throw new Error('TIME_READBACK_MISSING');
    } catch(error) {
      outcome='DENIED';
      errorCode=String(error instanceof Error?error.message:error).slice(0,160);
    }
    const ok=outcome===expected;
    console.log(JSON.stringify({publication_time_isolation:{name,outcome,expected,ok,error_class:/Missing or insufficient permissions|PERMISSION_DENIED/i.test(errorCode)?'permission_denied':(errorCode?'other':'none'),user_data_logged:false}}));
    if(!ok) throw new Error('TIME_UNEXPECTED_'+name+'_'+outcome);
  }

  async function runServerTimeRepairVariant(name, localOffsetMs) {
    await clearSyntheticPublication();
    const fakeDeviceAt=new Date(Date.now()+localOffsetMs).toISOString();
    const variantListing={...listing,published_at:fakeDeviceAt,created_at:fakeDeviceAt,updated_at:fakeDeviceAt};
    const variantBucket={uid,action:'listing_create',window_start:fakeDeviceAt,count:1,updated_at:fakeDeviceAt};
    let outcome='PASS'; let errorCode='';
    try {
      await commit([
        serverTimedWrite('rate_limits/'+uid+'-listing_create',variantBucket,['window_start','updated_at']),
        serverTimedWrite('listings_v2/'+listingId,variantListing,['created_at','updated_at','published_at'])
      ],idToken,'SERVER_TIME_'+name);
      const check=await getPublic('listings_v2/'+listingId,idToken);
      if(!check?.name?.endsWith('/'+listingId)) throw new Error('SERVER_TIME_READBACK_MISSING');
      const bucket=await getPublic('rate_limits/'+uid+'-listing_create',idToken);
      const serverListingAt=Date.parse(timestampField(check,'created_at'));
      const serverBucketAt=Date.parse(timestampField(bucket,'updated_at'));
      if(!Number.isFinite(serverListingAt)||!Number.isFinite(serverBucketAt)) throw new Error('SERVER_TIME_TIMESTAMP_MISSING');
      if(Math.abs(serverListingAt-Date.now())>2*60_000||Math.abs(serverBucketAt-Date.now())>2*60_000) throw new Error('SERVER_TIME_NOT_AUTHORITATIVE');
    } catch(error) {
      outcome='DENIED';
      errorCode=String(error instanceof Error?error.message:error).slice(0,180);
    }
    const ok=outcome==='PASS';
    console.log(JSON.stringify({publication_server_time_repair:{name,simulated_device_clock_offset_minutes:localOffsetMs/60_000,outcome,ok,error_class:/Missing or insufficient permissions|PERMISSION_DENIED/i.test(errorCode)?'permission_denied':(errorCode?'other':'none'),user_data_logged:false}}));
    if(!ok) throw new Error('SERVER_TIME_REPAIR_FAILED_'+name+'_'+errorCode);
  }

  async function adminSeedRateBucket(windowStartIso,count) {
    const payload={uid,action:'listing_create',window_start:windowStartIso,count,updated_at:windowStartIso};
    const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/rate_limits/'+uid+'-listing_create',{
      method:'PATCH',
      headers:{Authorization:'Bearer '+oauth,'Content-Type':'application/json','X-Goog-User-Project':PROJECT},
      body:JSON.stringify({fields:encodeFields(payload)})
    });
    await parse(response,'ADMIN_SEED_RATE_BUCKET');
  }

  async function runExistingBucketRepairProof() {
    // Recent existing bucket: preserve server window and increment. No device clock
    // decision is involved.
    await clearSyntheticPublication();
    await commit([
      serverTimedWrite('rate_limits/'+uid+'-listing_create',{uid,action:'listing_create',count:1},['window_start','updated_at'])
    ],idToken,'EXISTING_BUCKET_RECENT_SEED');
    const recentBucket=await getPublic('rate_limits/'+uid+'-listing_create',idToken);
    const recentStart=timestampField(recentBucket,'window_start');
    if(!recentStart) throw new Error('RECENT_BUCKET_WINDOW_MISSING');

    const recentAt='2099-01-01T00:00:00.000Z';
    const recentListing={...listing,created_at:recentAt,updated_at:recentAt,published_at:recentAt};
    await commit([
      serverTimedOverwrite('rate_limits/'+uid+'-listing_create',{
        uid,action:'listing_create',window_start:recentStart,count:2,updated_at:recentAt
      },['updated_at']),
      serverTimedWrite('listings_v2/'+listingId,recentListing,['created_at','updated_at','published_at'])
    ],idToken,'EXISTING_BUCKET_RECENT_INCREMENT');
    const recentListingRead=await getPublic('listings_v2/'+listingId,idToken);
    if(!recentListingRead?.name?.endsWith('/'+listingId)) throw new Error('RECENT_INCREMENT_LISTING_MISSING');
    await clearSyntheticPublication();

    // Expired existing bucket: increment must be rejected by Rules, then the
    // patched algorithm retries reset using REQUEST_TIME and succeeds.
    const oldIso=new Date(Date.now()-2*60*60_000).toISOString();
    await adminSeedRateBucket(oldIso,2);
    const expiredAt='1900-01-01T00:00:00.000Z';
    const expiredListing={...listing,created_at:expiredAt,updated_at:expiredAt,published_at:expiredAt};

    let incrementDenied=false;
    try {
      await commit([
        serverTimedOverwrite('rate_limits/'+uid+'-listing_create',{
          uid,action:'listing_create',window_start:oldIso,count:3,updated_at:expiredAt
        },['updated_at']),
        serverTimedWrite('listings_v2/'+listingId,expiredListing,['created_at','updated_at','published_at'])
      ],idToken,'EXISTING_BUCKET_EXPIRED_INCREMENT');
    } catch(error) {
      const raw=String(error instanceof Error?error.message:error);
      incrementDenied=/Missing or insufficient permissions|PERMISSION_DENIED/i.test(raw);
      if(!incrementDenied) throw error;
    }
    if(!incrementDenied) throw new Error('EXPIRED_INCREMENT_UNEXPECTEDLY_ALLOWED');

    await commit([
      serverTimedOverwrite('rate_limits/'+uid+'-listing_create',{
        uid,action:'listing_create',count:1
      },['window_start','updated_at']),
      serverTimedWrite('listings_v2/'+listingId,expiredListing,['created_at','updated_at','published_at'])
    ],idToken,'EXISTING_BUCKET_EXPIRED_RESET');
    const resetListingRead=await getPublic('listings_v2/'+listingId,idToken);
    const resetBucketRead=await getPublic('rate_limits/'+uid+'-listing_create',idToken);
    if(!resetListingRead?.name?.endsWith('/'+listingId)) throw new Error('EXPIRED_RESET_LISTING_MISSING');
    if(integerField(resetBucketRead,'count')!==1) throw new Error('EXPIRED_RESET_COUNT_MISMATCH');

    console.log(JSON.stringify({
      publication_existing_bucket_repair:{
        recent_existing_increment:'PASS',
        expired_increment_denied:true,
        expired_server_time_reset:'PASS',
        simulated_device_clock_dependency:false,
        user_data_logged:false
      }
    }));
    await clearSyntheticPublication();
  }

  const longPhoto='data:image/jpeg;base64,'+'A'.repeat(110000);
  await runPayloadVariant('city_location',{
    city_id:'TLAX-tlaxcala',
    attributes:{approx_latitude:19.31,approx_longitude:-98.24,geo_cell:'g1:109:81'}
  },'PASS');
  await runPayloadVariant('title_one_char',{title:'A'},'DENIED');
  await runPayloadVariant('title_two_chars',{title:'AB'},'PASS');
  await runPayloadVariant('decimal_price',{price_mxn:123.45},'PASS');
  await runPayloadVariant('four_compressed_size_photos',{photo_urls:[longPhoto,longPhoto,longPhoto,longPhoto]},'PASS');
  // Behavioral audit: current live rules still allow this even though the generated
  // source contract requires national => shipping_available=true. Keep this as
  // an explicit drift sentinel until live Rules are intentionally reconciled.
  await runPayloadVariant('national_without_shipping',{visibility_scope:'national',shipping_available:false},'PASS');
  await runPayloadVariant('national_with_shipping',{visibility_scope:'national',shipping_available:true,delivery_methods:['shipping']},'PASS');
  await runPayloadVariant('delivery_meeting_point',{
    delivery_methods:['campus_meetup','pickup','local_delivery'],
    meeting_point_ids:['uatx-riberena-cafeteria']
  },'PASS');
  await runPayloadVariant('rich_attributes',{
    attributes:{brand:'TuTop',model:'QA',approx_latitude:19.31,approx_longitude:-98.24,geo_cell:'g1:109:81',student_sale:true}
  },'PASS');
  await runPayloadVariant('decimal_quantity',{quantity:1.5},'DENIED');
  await runPayloadVariant('price_over_rules_max',{price_mxn:1000000.01},'DENIED');
  await runPayloadVariant('clock_plus_4m',{},'PASS',4*60_000);
  await runPayloadVariant('clock_minus_9m',{},'PASS',-9*60_000);
  await runPayloadVariant('clock_plus_6m',{},'DENIED',6*60_000);
  await runPayloadVariant('clock_minus_11m',{},'DENIED',-11*60_000);
  await runTimeIsolationVariant('clock_listing_only_plus_6m',6*60_000,0,'DENIED');
  await runTimeIsolationVariant('clock_bucket_only_plus_6m',0,6*60_000,'DENIED');
  await runTimeIsolationVariant('clock_listing_only_minus_11m',-11*60_000,0,'DENIED');
  await runTimeIsolationVariant('clock_bucket_only_minus_11m',0,-11*60_000,'DENIED');
  await runServerTimeRepairVariant('device_clock_plus_60m',60*60_000);
  await runServerTimeRepairVariant('device_clock_minus_60m',-60*60_000);
  await runExistingBucketRepairProof();
  await runPayloadVariant('category_electronica',{category_id:'electronica',title:'QA Electrónica'},'PASS');
  await runPayloadVariant('category_ropa-accesorios',{category_id:'ropa-accesorios',title:'QA Ropa & Accesorios'},'PASS');
  await runPayloadVariant('category_libros-apuntes',{category_id:'libros-apuntes',title:'QA Libros & Apuntes'},'PASS');
  await runPayloadVariant('category_comida',{category_id:'comida',title:'QA Comida'},'PASS');
  await runPayloadVariant('category_postres',{category_id:'postres',title:'QA Postres'},'PASS');
  await runPayloadVariant('category_servicios',{category_id:'servicios',title:'QA Servicios'},'PASS');
  await runPayloadVariant('category_transporte',{category_id:'transporte',title:'QA Transporte'},'PASS');
  await runPayloadVariant('category_cuartos-renta',{category_id:'cuartos-renta',title:'QA Cuartos & Renta'},'PASS');
  await runPayloadVariant('category_eventos',{category_id:'eventos',title:'QA Eventos'},'PASS');
  await runPayloadVariant('category_arte-manualidades',{category_id:'arte-manualidades',title:'QA Arte & Manualidades'},'PASS');
  await runPayloadVariant('category_otros',{category_id:'otros',title:'QA Otros'},'PASS');
  await clearSyntheticPublication();

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
    server_request_time_skew_plus_60m_pass:true,
    server_request_time_skew_minus_60m_pass:true,
    existing_bucket_server_authoritative_rollover_pass:true,
    title_minimum_live_boundary_pass:true,
    live_source_drift_national_without_shipping:liveRulesContract.national_requires_shipping===false,
    live_rules_video_key_enabled:liveRulesContract.video_urls_allowed_create_key,
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