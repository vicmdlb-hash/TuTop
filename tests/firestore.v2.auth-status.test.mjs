import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';

const projectId=process.env.GCLOUD_PROJECT||'demo-tutop-auth-status';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
const [hostname,portRaw]=host.split(':');
const rules=fs.readFileSync('firebase/firestore.v2.generated.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(portRaw||8080),rules}});
after(async()=>env.cleanup());
beforeEach(async()=>env.clearFirestore());

test('auth_status binds email_verified to Firebase Auth claim and is admin-readable',async()=>{
  const pending=env.authenticatedContext('pending',{email_verified:false}).firestore();
  const verified=env.authenticatedContext('verified',{email_verified:true}).firestore();
  const forged=env.authenticatedContext('forged',{email_verified:false}).firestore();
  const admin=env.authenticatedContext('admin',{email_verified:true}).firestore();
  const at=Timestamp.now();

  await env.withSecurityRulesDisabled(async(ctx)=>{
    await setDoc(doc(ctx.firestore(),'admins/admin'),{active:true});
  });

  await assertSucceeds(setDoc(doc(pending,'auth_status/pending'),{uid:'pending',email_verified:false,auth_mode:'email_password_verified_beta',last_client_code:'EMAIL_VERIFICATION_PENDING',last_seen_at:at}));
  await assertSucceeds(setDoc(doc(verified,'auth_status/verified'),{uid:'verified',email_verified:true,auth_mode:'email_password_verified_beta',last_client_code:'EMAIL_VERIFIED',last_seen_at:at}));
  await assertFails(setDoc(doc(forged,'auth_status/forged'),{uid:'forged',email_verified:true,auth_mode:'email_password_verified_beta',last_client_code:'EMAIL_VERIFIED',last_seen_at:at}));
  await assertSucceeds(setDoc(doc(pending,'auth_status/pending'),{uid:'pending',email_verified:false,auth_mode:'email_password_verified_beta',last_client_code:'VERIFICATION_EMAIL_SEND_FAILED',last_seen_at:at}));
  await assertFails(setDoc(doc(pending,'auth_status/pending'),{uid:'pending',email_verified:false,auth_mode:'email_password_verified_beta',last_client_code:'RAW_FIREBASE_ERROR',last_seen_at:at}));
  await assertSucceeds(getDoc(doc(admin,'auth_status/verified')));
});

test('auth_status denies cross-account, anonymous, malformed and delete operations',async()=>{
  const owner=env.authenticatedContext('owner',{email_verified:false}).firestore();
  const stranger=env.authenticatedContext('stranger',{email_verified:false}).firestore();
  const admin=env.authenticatedContext('admin',{email_verified:true}).firestore();
  const noClaim=env.authenticatedContext('no-claim',{}).firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const at=Timestamp.now();
  const payload=(uid,overrides={})=>({uid,email_verified:false,auth_mode:'email_password_verified_beta',last_client_code:'EMAIL_VERIFICATION_PENDING',last_seen_at:at,...overrides});
  await env.withSecurityRulesDisabled(async(ctx)=>{
    await setDoc(doc(ctx.firestore(),'admins/admin'),{active:true});
    await setDoc(doc(ctx.firestore(),'auth_status/owner'),payload('owner'));
  });
  await assertFails(getDoc(doc(stranger,'auth_status/owner')));
  await assertFails(setDoc(doc(stranger,'auth_status/owner'),payload('owner')));
  await assertFails(getDoc(doc(anonymous,'auth_status/owner')));
  await assertFails(setDoc(doc(anonymous,'auth_status/owner'),payload('owner')));
  await assertFails(deleteDoc(doc(owner,'auth_status/owner')));
  await assertFails(deleteDoc(doc(admin,'auth_status/owner')));
  await assertFails(setDoc(doc(admin,'auth_status/owner'),payload('owner')));
  await assertFails(setDoc(doc(owner,'auth_status/owner'),payload('other')));
  await assertFails(setDoc(doc(owner,'auth_status/owner'),payload('owner',{unexpected:true})));
  await assertFails(setDoc(doc(owner,'auth_status/owner'),payload('owner',{auth_mode:'unsupported'})));
  await assertFails(setDoc(doc(owner,'auth_status/owner'),payload('owner',{last_seen_at:Timestamp.fromMillis(at.toMillis()-60*60*1000)})));
  await assertFails(setDoc(doc(owner,'auth_status/owner'),payload('owner',{last_seen_at:Timestamp.fromMillis(at.toMillis()+60*60*1000)})));
  await assertSucceeds(setDoc(doc(noClaim,'auth_status/no-claim'),payload('no-claim')));
  await assertFails(setDoc(doc(noClaim,'auth_status/no-claim'),payload('no-claim',{email_verified:true,last_client_code:'EMAIL_VERIFIED'})));
});
