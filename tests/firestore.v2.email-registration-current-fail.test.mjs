import fs from 'node:fs';
import test, { after } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const projectId=process.env.GCLOUD_PROJECT||'demo-tutop-email-registration-rule';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
const [hostname,portRaw]=host.split(':');
const rules=fs.readFileSync('firebase/firestore.v2.generated.rules','utf8');
const env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(portRaw||8080),rules}});
after(async()=>env.cleanup());

test('current Build120 Rules reject new verified-email user_private shape',async()=>{
  const db=env.authenticatedContext('email-user',{email_verified:false}).firestore();
  const at=Timestamp.now();
  await assertFails(setDoc(doc(db,'user_private/email-user'),{
    uid:'email-user',
    institutional_email:'person@example.edu',
    auth_mode:'email_password_verified_beta',
    created_at:at,
    updated_at:at,
  }));
  console.log('CONFIRMED Build120 Rules reject email_password_verified_beta user_private create');
});
