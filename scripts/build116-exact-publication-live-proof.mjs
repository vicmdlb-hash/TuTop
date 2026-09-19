import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const BRANCH='probe/build116-exact-publication-after-rate-read';
const ACK='BUILD116_EXACT_PUBLICATION_AFTER_RATE_READ';
if(process.env.TUTOP_FIREBASE_PROJECT_ID!==PROJECT) throw new Error('EXACT116_PROJECT_GUARD');
if(process.env.GITHUB_REF_NAME!==BRANCH) throw new Error('EXACT116_BRANCH_GUARD');
if(process.env.TUTOP_BUILD116_EXACT_ACK!==ACK) throw new Error('EXACT116_ACK_GUARD');
if(!fs.existsSync('.tutop-staging-web-config.json')) throw new Error('EXACT116_CONFIG_MISSING');

const config=JSON.parse(fs.readFileSync('.tutop-staging-web-config.json','utf8'));
if(config.projectId!==PROJECT||!config.apiKey) throw new Error('EXACT116_CONFIG_DRIFT');

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(String(key))?storage.get(String(key)):null,
  setItem:(key,value)=>storage.set(String(key),String(value)),
  removeItem:key=>storage.delete(String(key)),
  clear:()=>storage.clear(),
  key:index=>[...storage.keys()][index]??null,
  get length(){return storage.size;}
};

const [{FirebaseRestClient},{buildRateLimitWrite,commitWithRateLimit}]=await Promise.all([
  import('../src/services/firebaseRest.ts'),
  import('../src/services/rateLimit.ts')
]);

const run=String(process.env.GITHUB_RUN_ID||'').replace(/\D/g,'').slice(-16);
if(!run) throw new Error('EXACT116_RUN_ID_MISSING');
const email='synthetic-build116-exact-'+run+'@example.com';
const password='TuTopExact116!'+run+'Aa9';
const listingId='synthetic-build116-exact-'+run;
let oauth='';
let uid='';
let client=null;
let stage='INIT';
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
  const response=await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path,{method:'DELETE',headers:adminHeaders()});
  if(!response.ok&&response.status!==404) throw new Error('EXACT116_CLEANUP_DOC_'+response.status);
}
async function adminDeleteAuth(){
  if(!uid)return;
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchDelete',{
    method:'POST',headers:adminHeaders(true),body:JSON.stringify({localIds:[uid],force:true})
  });
  if(!response.ok) throw new Error('EXACT116_CLEANUP_AUTH_'+response.status);
}
function shape(write){
  const name=String(write?.update?.name||'');
  return {
    collection:name.includes('/documents/listings_v2/')?'listings_v2':name.includes('/documents/rate_limits/')?'rate_limits':'other',
    field_names:Object.keys(write?.update?.fields||{}).sort(),
    field_types:Object.fromEntries(Object.entries(write?.update?.fields||{}).map(([k,v])=>[k,Object.keys(v||{})[0]||'unknown']).sort(([a],[b])=>a.localeCompare(b))),
    transforms:(write?.updateTransforms||[]).map(x=>x.fieldPath).sort(),
    precondition_keys:Object.keys(write?.currentDocument||{}).sort()
  };
}

try{
  stage='AUTH_ADMIN_CREATE';
  oauth=await firebaseCiAccessToken();
  const created=await parse(await fetch('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts',{
    method:'POST',headers:adminHeaders(true),
    body:JSON.stringify({email,password,emailVerified:true,displayName:'TuTop exact build116 smoke',disabled:false})
  }),'EXACT116_AUTH_ADMIN_CREATE');
  uid=String(created.localId||'');
  if(!uid) throw new Error('EXACT116_UID_MISSING');

  stage='AUTH_PUBLIC_SIGNIN';
  const login=await parse(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(config.apiKey),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  }),'EXACT116_AUTH_SIGNIN');
  if(String(login.localId||'')!==uid) throw new Error('EXACT116_AUTH_UID_DRIFT');

  localStorage.setItem('tutop.firebase.session.v2.'+PROJECT,JSON.stringify({
    uid,idToken:String(login.idToken||''),refreshToken:String(login.refreshToken||''),
    expiresAt:Date.now()+Number(login.expiresIn||3600)*1000,phone:''
  }));

  stage='CLIENT_INIT';
  client=new FirebaseRestClient(config);
  if(client.currentSession?.uid!==uid) throw new Error('EXACT116_SESSION_DRIFT');

  stage='PROFILE_BOOTSTRAP';
  const at=new Date();
  await client.commit([
    {
      update:client.encodeDocumentForWrite('users/'+uid,{
        uid,nombre:'TuTop Build116 Exact',facultad:'Turismo Internacional',esta_verificado:false,
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

  stage='MISSING_BUCKET_READ';
  const missing=await client.getDocument('rate_limits/'+uid+'-listing_create');
  if(missing!==null) throw new Error('EXACT116_MISSING_BUCKET_NOT_NULL');
  console.log(JSON.stringify({build116_exact_missing_bucket_read:{result:'PASS',client_behavior:'returns_null',user_data_logged:false}}));

  stage='BUILD_RATE_WRITE';
  const rateWrite=await buildRateLimitWrite(client,'listing_create',new Date());
  console.log(JSON.stringify({build116_exact_rate_write:{result:'PASS',shape:shape(rateWrite),user_data_logged:false}}));
  if(rateWrite.currentDocument?.exists!==false) throw new Error('EXACT116_FIRST_BUCKET_PRECONDITION_DRIFT');

  stage='FIRST_PUBLICATION_COMMIT';
  const listingAt=new Date();
  const listingPayload={
    schema_version:2,
    seller_id:uid,
    institution_id:'uatx',
    campus_id:'uatx-riberena',
    category_id:'electronica',
    title:'Build116 exact publication',
    description:'Prueba sintética del cliente exacto build116.',
    attributes:{},
    price_mxn:500,
    negotiable:true,
    quantity:1,
    condition:'Buen estado',
    delivery_methods:['campus_meetup'],
    meeting_point_ids:[],
    shipping_available:false,
    photo_urls:['data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>'],
    status:'active',
    moderation_status:'pending',
    visibility_scope:'campus',
    published_at:listingAt,
    created_at:listingAt,
    updated_at:listingAt
  };
  const listingWrite={
    update:client.encodeDocumentForWrite('listings_v2/'+listingId,listingPayload),
    currentDocument:{exists:false}
  };
  await commitWithRateLimit(client,'listing_create',[listingWrite],listingAt);

  const readback=await client.getDocument('listings_v2/'+listingId);
  if(!readback) throw new Error('EXACT116_LISTING_READBACK_MISSING');
  const bucket=await client.getDocument('rate_limits/'+uid+'-listing_create');
  if(!bucket||Number(bucket.data.count)!==1) throw new Error('EXACT116_RATE_BUCKET_READBACK_MISSING');

  console.log(JSON.stringify({
    build116_exact_publication:{
      result:'PASS',
      source_sha:'8a4368ba0fce34d0a87acc8eccf38bf5dc019bc2',
      firebase_rest_client_exact:true,
      build_rate_limit_write_exact:true,
      commit_with_rate_limit_exact:true,
      missing_bucket_returns_null:true,
      listing_created_and_read_back:true,
      rate_bucket_created_and_read_back:true,
      user_data_logged:false
    }
  }));
}catch(error){
  console.error(JSON.stringify({
    result:'FAIL',stage,
    error_code:String(error instanceof Error?error.message:error).slice(0,500),
    user_data_logged:false
  }));
  throw error;
}finally{
  if(oauth){
    for(const path of [
      'listings_v2/'+listingId,
      ...(uid?['rate_limits/'+uid+'-listing_create','user_private/'+uid,'users/'+uid]:[])
    ]){
      try{await adminDeleteDoc(path);}catch{cleanupErrors+=1;}
    }
    if(uid){try{await adminDeleteAuth();}catch{cleanupErrors+=1;}}
  }
  console.log(JSON.stringify({cleanup_attempted:true,cleanup_errors:cleanupErrors,synthetic_only:true}));
  if(cleanupErrors) process.exitCode=1;
}
