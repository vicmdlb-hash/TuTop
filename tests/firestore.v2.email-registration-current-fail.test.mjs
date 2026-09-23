import fs from 'node:fs';
import test, { after } from 'node:test';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const projectId=process.env.GCLOUD_PROJECT||'demo-tutop-email-registration-rule';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
const [hostname,portRaw]=host.split(':');
const rules=fs.readFileSync('firebase/firestore.v2.generated.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(portRaw||8080),rules}});
after(async()=>env.cleanup());

test('current Build120 Rules accept the real verified-email token shape',async()=>{
  const db=env.authenticatedContext('email-user',{email:'person@example.edu',email_verified:false}).firestore();
  const at=Timestamp.now();
  await assertSucceeds(setDoc(doc(db,'user_private/email-user'),{
    uid:'email-user',
    institutional_email:'person@example.edu',
    auth_mode:'email_password_verified_beta',
    created_at:at,
    updated_at:at,
  }));
  console.log('PASS Build120 generated Rules accept email_password_verified_beta when Auth email claim matches institutional_email');
});
