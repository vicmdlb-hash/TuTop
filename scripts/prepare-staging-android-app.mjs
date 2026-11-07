// Existing staging Firebase Android configuration: strictly read-only.
// Account reset, registration smoke, API enablement and new app creation are independent, gated workflows.
import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertStagingConfigReadContext } from './staging-freeze-guard.mjs';
import {selectExistingStagingAndroidApp,validateExistingStagingAndroidConfig} from './staging-existing-android-config-guard.mjs';
const projectId=assertStagingConfigReadContext({legacyAllowEnv:'TUTOP_ALLOW_ANDROID_APP_SETUP',legacyAllowValue:'staging-v2'});
const packageName=String(process.env.TUTOP_ANDROID_PACKAGE_NAME||'mx.tutop.app').trim();
const output=String(process.env.TUTOP_ANDROID_GOOGLE_SERVICES_PATH||'.tutop-staging-google-services.json').trim();
if(packageName!=='mx.tutop.app') throw Error('STAGING_ANDROID_PACKAGE_NOT_APPROVED');
if(!/^\.[A-Za-z0-9._-]+\.json$/.test(output)) throw Error('STAGING_ANDROID_OUTPUT_PATH_UNSAFE');
const token=await firebaseCiAccessToken();
async function requestRead(url) {
  const response=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${token}`,'X-Goog-User-Project':projectId}});
  if(!response.ok) throw Error(`STAGING_ANDROID_CONFIG_HTTP_${response.status}`);
  try{return await response.json();}catch{throw Error('STAGING_ANDROID_CONFIG_RESPONSE_INVALID');}
}
const root=`projects/${projectId}`;
const listed=await requestRead(`https://firebase.googleapis.com/v1beta1/${root}/androidApps?pageSize=100`);
if(listed?.nextPageToken) throw Error('STAGING_ANDROID_APP_LIST_PAGINATION_UNPROVEN');
const existing=selectExistingStagingAndroidApp(listed?.apps,projectId,packageName);
const config=await requestRead(`https://firebase.googleapis.com/v1beta1/${existing.name}/config`);
const validated=validateExistingStagingAndroidConfig(config,projectId,packageName);
fs.writeFileSync(output,`${JSON.stringify(validated,null,2)}\n`,{mode:0o600,flag:'wx'});
console.log('PASS existing Firebase Android app config verified without staging mutation.');
console.log('No account wipe, synthetic user creation, paid AI/API enabling or app registration executed.');
console.log('Actual staging E2E evidence and compliance remain separate release gates.');
