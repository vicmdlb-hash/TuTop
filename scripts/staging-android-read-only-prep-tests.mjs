import fs from 'node:fs';
import assert from 'node:assert/strict';
import {selectExistingStagingAndroidApp,validateExistingStagingAndroidConfig} from './staging-existing-android-config-guard.mjs';
const id='tutop-beta-vicmdlb-1356585881',pkg='mx.tutop.app';
const app={name:`projects/${id}/androidApps/1:123:android:abc`,appId:'1:123:android:abc',packageName:pkg,state:'ACTIVE'};
assert.equal(selectExistingStagingAndroidApp([app]),app);
for(const bad of [null,[],[app,app],[{...app,packageName:'other'}],[{...app,appId:''}],[{...app,name:'projects/other/androidApps/1'}]])
  assert.throws(()=>selectExistingStagingAndroidApp(bad),/STAGING_ANDROID_/);
assert.throws(()=>selectExistingStagingAndroidApp([app],'other',pkg),/STAGING_ANDROID_/);
const valid={project_info:{project_id:id},client:[{client_info:{android_client_info:{package_name:pkg}},api_key:[{current_key:'synthetic-only-key'}]}]};
const enc=x=>({configFilename:'google-services.json',configFileContents:Buffer.from(JSON.stringify(x)).toString('base64')});
assert.equal(validateExistingStagingAndroidConfig(enc(valid)).project_info.project_id,id);
for(const bad of [null,{},enc({...valid,project_info:{project_id:'other'}}),enc({...valid,client:[]}),enc({...valid,client:[valid.client[0],valid.client[0]]}),enc({...valid,client:[{...valid.client[0],api_key:[]}]}),{configFilename:'wrong.json',configFileContents:'xx'},{configFilename:'google-services.json',configFileContents:'%%%'}])
  assert.throws(()=>validateExistingStagingAndroidConfig(bad),/STAGING_ANDROID_/);
const source=fs.readFileSync('scripts/prepare-staging-android-app.mjs','utf8');
assert.match(source,/assertStagingConfigReadContext/);
assert.match(source,/method:'GET'/);
assert.match(source,/flag:'wx'/);
assert.doesNotMatch(source,/reset-staging-accounts|staging-app-registration-smoke|ensureFirebaseAiServices|ensureFirebaseAiApiKeyAllowlist|spawnSync|method:'POST'|method:'PATCH'|method:'DELETE'/);
const bootstrap = fs.readFileSync('scripts/android-bootstrap.mjs', 'utf8');
assert.match(bootstrap, /ANDROID_SDK_DECLARATIONS_MISSING/, 'missing variables.gradle must block Android bootstrapping');
assert.match(bootstrap, /ANDROID_SDK_DECLARATION_DRIFT/, 'duplicate or changed Gradle SDK declarations must block build');
assert.match(bootstrap, /ANDROID_SDK_TARGET_MISMATCH/, 'Android 16 API 36 must be enforced');
assert.match(bootstrap, /ANDROID_SDK_READBACK_FAILED/, 'persisted Gradle variables must be verified');
assert.match(bootstrap, /targetSdkVersion = 36/);
assert.match(bootstrap, /compileSdkVersion = 36/);
console.log('PASS existing Firebase Android app check read-only; destructive provisioning/reset forbidden');
