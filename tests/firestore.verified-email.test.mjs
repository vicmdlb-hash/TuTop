import fs from 'node:fs';
import test, {after, beforeEach} from 'node:test';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,writeBatch,Timestamp} from 'firebase/firestore';
const [host,port]=String(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080').split(':');
const env=await initializeTestEnvironment({projectId:'demo-tutop-verified',firestore:{host,port:Number(port),rules:fs.readFileSync('firebase/firestore.v2.generated.rules','utf8')}});
after(()=>env.cleanup());
beforeEach(()=>env.clearFirestore());
const now=()=>Timestamp.now();
const dbFor=(claims)=>env.authenticatedContext('seller',claims).firestore();
async function seed() {
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,'institutions/uatx'),{name:'UATx',active:true});
  await setDoc(doc(db,'campuses/campus'),{name:'Campus',institution_id:'uatx',active:true});
  await setDoc(doc(db,'users/seller'),{uid:'seller',nombre:'Seller',facultad:'Campus',esta_verificado:false,institution_id:'uatx',campus_id:'campus',created_at:now(),updated_at:now()});
 });
}
function publish(db,images=['data:image/webp;base64,UklGRg==']) {
 const batch=writeBatch(db),at=now();
 batch.set(doc(db,'rate_limits/seller-listing_create'),{uid:'seller',action:'listing_create',window_start:at,count:1,updated_at:at});
 batch.set(doc(db,'listings_v2/new'),{schema_version:2,seller_id:'seller',institution_id:'uatx',campus_id:'campus',category_id:'libros',title:'Libro de prueba',description:'Texto',attributes:{},price_mxn:100,negotiable:false,quantity:1,condition:'Buen estado',delivery_methods:['campus_meetup'],meeting_point_ids:[],shipping_available:false,photo_urls:images,status:'active',moderation_status:'pending',visibility_scope:'campus',published_at:at,created_at:at,updated_at:at});
 return batch.commit();
}
test('pending email can create private identity with optional normalized phone',async()=>{
 for(const phone of [undefined,'+522461234567']) {
  await env.clearFirestore();
  const db=dbFor({email:'seller@example.test',email_verified:false});
  await assertSucceeds(setDoc(doc(db,'user_private/seller'),{uid:'seller',institutional_email:'seller@example.test',auth_mode:'email_password_verified_beta',...(phone?{telefono:phone}:{}),created_at:now(),updated_at:now()}));
 }
});
test('private email cannot impersonate another Auth identity',async()=>{
 const db=dbFor({email:'seller@example.test',email_verified:false});
 await assertFails(setDoc(doc(db,'user_private/seller'),{uid:'seller',institutional_email:'someone@example.test',auth_mode:'email_password_verified_beta',created_at:now(),updated_at:now()}));
});
for(const claims of [{email:'seller@example.test',email_verified:false},{email:'seller@example.test'},{}, {email:'seller@example.test',email_verified:'true'}]) {
 test('unverified or malformed signed identity cannot publish '+JSON.stringify(claims),async()=>{
  await seed();await assertFails(publish(dbFor(claims)));
 });
}
test('verified identity publishes text listing and atomic rate counter',async()=>{
 await seed();const db=dbFor({email:'seller@example.test',email_verified:true});await assertSucceeds(publish(db));
 const result=await getDoc(doc(db,'listings_v2/new'));if(result.data()?.seller_id!=='seller')throw new Error('PUBLICATION_MISSING');
});
test('verified identity publishes four compressed images without Storage',async()=>{
 await seed();await assertSucceeds(publish(dbFor({email:'seller@example.test',email_verified:true}),Array(4).fill('data:image/webp;base64,'+'A'.repeat(82000))));
});
test('verified client still cannot enqueue trusted notifications',async()=>{
 await assertFails(setDoc(doc(dbFor({email:'seller@example.test',email_verified:true}),'notification_outbox/forged'),{recipient_uid:'victim',kind:'new_message',status:'pending',created_at:now()}));
});
