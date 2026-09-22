import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

const projectId=process.env.GCLOUD_PROJECT||'demo-tutop-seller-follows';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
const [hostname,portRaw]=host.split(':');
const rules=fs.readFileSync('firebase/firestore.v2.generated.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(portRaw||8080),rules}});

after(async()=>env.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async(ctx)=>{
    const db=ctx.firestore();
    const at=Timestamp.now();
    await setDoc(doc(db,'users/buyer'),{uid:'buyer',nombre:'Buyer',facultad:'Turismo',esta_verificado:false,created_at:at,updated_at:at});
    await setDoc(doc(db,'users/seller'),{uid:'seller',nombre:'Seller',facultad:'Turismo',esta_verificado:false,created_at:at,updated_at:at});
    await setDoc(doc(db,'users/stranger'),{uid:'stranger',nombre:'Stranger',facultad:'Derecho',esta_verificado:false,created_at:at,updated_at:at});
  });
});

test('seller_follows is private to follower and denies self/forged follows',async()=>{
  const buyer=env.authenticatedContext('buyer').firestore();
  const seller=env.authenticatedContext('seller').firestore();
  const stranger=env.authenticatedContext('stranger').firestore();
  const at=Timestamp.now();
  const ref=doc(buyer,'seller_follows/buyer_seller');
  await assertSucceeds(setDoc(ref,{follower_uid:'buyer',seller_id:'seller',created_at:at,updated_at:at}));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(stranger,'seller_follows/buyer_seller')));
  await assertFails(getDoc(doc(seller,'seller_follows/buyer_seller')));
  await assertFails(setDoc(doc(buyer,'seller_follows/buyer_buyer'),{follower_uid:'buyer',seller_id:'buyer',created_at:at,updated_at:at}));
  await assertFails(setDoc(doc(stranger,'seller_follows/buyer_seller-forged'),{follower_uid:'buyer',seller_id:'seller',created_at:at,updated_at:at}));
  await assertSucceeds(deleteDoc(ref));
});
