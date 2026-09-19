import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='fix/post116-publication-client-contract';
const ACK='POST116_CLIENT_EQUIVALENT_PUBLICATION_ONLY';
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) throw new Error('CLIENT_EQ_PROJECT_GUARD');
if(process.env.GITHUB_REF_NAME!==BRANCH) throw new Error('CLIENT_EQ_BRANCH_GUARD');
if(process.env.TUTOP_CLIENT_EQUIVALENT_ACK!==ACK) throw new Error('CLIENT_EQ_ACK_GUARD');
if(!fs.existsSync('.tutop-staging-web-config.json')) throw new Error('CLIENT_EQ_WEB_CONFIG_MISSING');

const config=JSON.parse(fs.readFileSync('.tutop-staging-web-config.json','utf8'));
if(config.projectId!==PROJECT || !config.apiKey) throw new Error('CLIENT_EQ_CONFIG_MISMATCH');

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(String(key))?storage.get(String(key)):null,
  setItem:(key,value)=>storage.set(String(key),String(value)),
  removeItem:key=>storage.delete(String(key)),
  clear:()=>storage.clear(),
  key:index=>[...storage.keys()][index]??null,
  get length(){return storage.size;}
};

const [{FirebaseRestClient},{buildCanonicalListingCreateWrite,validateCanonicalListingPolicy},{commitWithRateLimit}]=await Promise.all([
  import('../src/services/firebaseRest.ts'),
  import('../src/services/canonicalListingsBackend.ts'),
  import('../src/services/rateLimit.ts')
]);

const run=String(process.env.GITHUB_RUN_ID||'').replace(/\D/g,'').slice(-16);
if(!run) throw new Error('CLIENT_EQ_RUN_ID_REQUIRED');
const email='synthetic-client-equivalent-'+run+'@example.com';
const password='TuTopClientEq!'+run+'Aa9';
const listingIds=['synthetic-client-eq-a-'+run,'synthetic-client-eq-b-'+run,'synthetic-client-eq-c-'+run];
let oauth='';
let uid='';
let client=null;
let cleanupErrors=0;

async function parse(response,label){
  const text=await response.text(); let body={};
  try{body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,180)};}
  if(!response.ok) throw new Error(label+':'+String(body?.error?.message||body?.error?.status||body?.raw||response.status));
  return body;
}
function adminHeaders(contentType=false){
  return {
    Authorization:'Bearer '+oauth,
    'X-Goog-User-Project':PROJECT,
    ...(contentType?{'Content-Type':'application/json'}:{})
  };
}
async function adminDeleteDoc(path){
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path,{
    method:'DELETE',headers:adminHeaders()
  });
  if(!response.ok&&response.status!==404) throw new Error('ADMIN_DELETE_'+response.status);
}
async function adminDeleteAuth(){
  if(!uid)return;
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchDelete',{
    method:'POST',headers:adminHeaders(true),body:JSON.stringify({localIds:[uid],force:true})
  });
  if(!response.ok) throw new Error('AUTH_CLEANUP_'+response.status);
}
async function adminSeedExpiredBucket(){
  const path='rate_limits/'+uid+'-listing_create';
  const oldIso=new Date(Date.now()-2*60*60_000).toISOString();
  const data={uid,action:'listing_create',window_start:oldIso,count:2,updated_at:oldIso};
  const encoded=client.encodeDocumentForWrite(path,data);
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path,{
    method:'PATCH',headers:adminHeaders(true),body:JSON.stringify({fields:encoded.fields})
  });
  await parse(response,'ADMIN_SEED_EXPIRED_BUCKET');
}
function listing(id,title,clientIso){
  return {
    schema_version:2,
    seller_id:uid,
    institution_id:'uatx',
    campus_id:'uatx-riberena',
    category_id:'electronica',
    title,
    description:'Prueba sintética del camino real de publicación.',
    attributes:{},
    price_mxn:123.45,
    negotiable:true,
    quantity:1,
    condition:'Buen estado',
    delivery_methods:['campus_meetup'],
    meeting_point_ids:[],
    shipping_available:false,
    photo_urls:['data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3C%2Fsvg%3E'],
    status:'active',
    moderation_status:'pending',
    visibility_scope:'campus',
    published_at:clientIso,
    created_at:clientIso,
    updated_at:clientIso,
    __id:id
  };
}
async function publishExact(id,title,clientIso,callerClock){
  const raw=listing(id,title,clientIso);
  const {__id,...payload}=raw;
  validateCanonicalListingPolicy(payload,'Electrónica');
  const write=buildCanonicalListingCreateWrite(client,id,payload);
  const transforms=(write.updateTransforms||[]).map(item=>item.fieldPath).sort();
  if(JSON.stringify(transforms)!==JSON.stringify(['created_at','published_at','updated_at'])) {
    throw new Error('CLIENT_EQ_TRANSFORM_DRIFT:'+JSON.stringify(transforms));
  }
  await commitWithRateLimit(client,'listing_create',[write],callerClock);
  const readback=await client.getDocument('listings_v2/'+id);
  if(!readback) throw new Error('CLIENT_EQ_LISTING_READBACK_MISSING');
  const serverAt=Date.parse(String(readback.data.created_at||''));
  if(!Number.isFinite(serverAt)||Math.abs(serverAt-Date.now())>2*60_000) throw new Error('CLIENT_EQ_SERVER_TIME_NOT_AUTHORITATIVE');
  if(readback.data.title!==title||readback.data.seller_id!==uid||readback.data.moderation_status!=='pending') {
    throw new Error('CLIENT_EQ_READBACK_CONTENT_DRIFT');
  }
  return readback;
}

try{
  oauth=await firebaseCiAccessToken();
  const created=await parse(await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts',{
    method:'POST',headers:adminHeaders(true),
    body:JSON.stringify({email,password,emailVerified:true,displayName:'TuTop client-equivalent smoke',disabled:false})
  }),'AUTH_ADMIN_CREATE');
  uid=String(created.localId||'');
  if(!uid) throw new Error('CLIENT_EQ_UID_MISSING');

  const login=await parse(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(config.apiKey),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  }),'AUTH_PUBLIC_SIGNIN');
  if(String(login.localId||'')!==uid) throw new Error('CLIENT_EQ_AUTH_UID_DRIFT');

  const session={
    uid,
    idToken:String(login.idToken||''),
    refreshToken:String(login.refreshToken||''),
    expiresAt:Date.now()+Number(login.expiresIn||3600)*1000,
    phone:''
  };
  if(!session.idToken||!session.refreshToken) throw new Error('CLIENT_EQ_SESSION_INCOMPLETE');
  localStorage.setItem('tutop.firebase.session.v2.'+PROJECT,JSON.stringify(session));

  client=new FirebaseRestClient(config);
  if(client.currentSession?.uid!==uid) throw new Error('CLIENT_EQ_SESSION_STORAGE_DRIFT');

  const at=new Date().toISOString();
  await client.commit([
    {
      update:client.encodeDocumentForWrite('users/'+uid,{
        uid,nombre:'TuTop Client Equivalent',facultad:'Turismo Internacional',esta_verificado:false,
        country_code:'MX',institution_id:'uatx',institution_name:'Universidad Autónoma de Tlaxcala',
        campus_id:'uatx-riberena',campus_name:'Ribereña',verification_level:0,verification_badge:'Cuenta TuTop',
        created_at:at,updated_at:at
      }),
      currentDocument:{exists:false}
    },
    {
      update:client.encodeDocumentForWrite('user_private/'+uid,{
        uid,institutional_email:email,auth_mode:'email_password_verified_beta',created_at:at,updated_at:at
      }),
      currentDocument:{exists:false}
    }
  ]);

  const fakeFuture='2099-01-01T00:00:00.000Z';
  const fakePast='1900-01-01T00:00:00.000Z';

  await publishExact(listingIds[0],'Cliente real A',fakeFuture,new Date(fakeFuture));
  await publishExact(listingIds[1],'Cliente real B',fakePast,new Date(fakePast));

  await adminSeedExpiredBucket();
  await publishExact(listingIds[2],'Cliente real C',fakeFuture,new Date(fakePast));

  const bucket=await client.getDocument('rate_limits/'+uid+'-listing_create');
  if(!bucket||Number(bucket.data.count)!==1) throw new Error('CLIENT_EQ_EXPIRED_BUCKET_NOT_RESET');
  const bucketAt=Date.parse(String(bucket.data.updated_at||''));
  if(!Number.isFinite(bucketAt)||Math.abs(bucketAt-Date.now())>2*60_000) throw new Error('CLIENT_EQ_BUCKET_SERVER_TIME_NOT_AUTHORITATIVE');

  console.log(JSON.stringify({
    client_equivalent_publication:{
      firebase_rest_client_actual:true,
      canonical_write_builder_actual:true,
      canonical_policy_actual:true,
      commit_with_rate_limit_actual:true,
      first_create_with_plus_73_year_client_clock:'PASS',
      existing_recent_bucket_with_minus_126_year_client_clock:'PASS',
      expired_existing_bucket_server_rollover:'PASS',
      listing_server_time_authoritative:true,
      rate_bucket_server_time_authoritative:true,
      user_data_logged:false
    }
  }));
}catch(error){
  console.error(JSON.stringify({
    result:'FAIL',
    error_code:String(error instanceof Error?error.message:error).slice(0,500),
    user_data_logged:false
  }));
  throw error;
}finally{
  if(oauth){
    for(const id of listingIds){
      try{await adminDeleteDoc('listings_v2/'+id);}catch{cleanupErrors+=1;}
    }
    if(uid){
      for(const path of ['rate_limits/'+uid+'-listing_create','user_private/'+uid,'users/'+uid]){
        try{await adminDeleteDoc(path);}catch{cleanupErrors+=1;}
      }
      try{await adminDeleteAuth();}catch{cleanupErrors+=1;}
    }
  }
  console.log(JSON.stringify({cleanup_attempted:true,cleanup_errors:cleanupErrors,synthetic_only:true}));
  if(cleanupErrors) process.exitCode=1;
}
