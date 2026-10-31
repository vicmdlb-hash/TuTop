import fs from 'node:fs';
import assert from 'node:assert/strict';
import {selectExistingStagingWebApp,validateExistingWebConfig} from './staging-existing-web-config-guard.mjs';
const project='tutop-beta-vicmdlb-1356585881';
const existing={name:`projects/${project}/webApps/1:123:web:abcd`,displayName:'TuTop V2 Staging Smoke',state:'ACTIVE'};
assert.equal(selectExistingStagingWebApp([existing]),existing);
assert.equal(selectExistingStagingWebApp([{name:`projects/${project}/webApps/2`,displayName:'different'},existing]),existing);
for(const bad of [null,[],[existing,existing],[{...existing,name:'projects/production/webApps/x'}],{}])
  assert.throws(()=>selectExistingStagingWebApp(bad),/STAGING_WEB_/);
assert.throws(()=>selectExistingStagingWebApp([existing],'production'),/STAGING_WEB_/);
const config={projectId:project,apiKey:'synthetic-test-key',appId:'synthetic-test-app'};
assert.equal(validateExistingWebConfig(config).projectId,project);
for(const bad of [null,{}, {...config,projectId:'production'},{...config,apiKey:''},{...config,appId:''},{...config,storageBucket:5}])
  assert.throws(()=>validateExistingWebConfig(bad),/STAGING_WEB_/);
const source=fs.readFileSync('scripts/prepare-staging-v2-auth.mjs','utf8');
assert.match(source,/assertStagingConfigReadContext/);
assert.match(source,/method:'GET'/);
assert.match(source,/flag:'wx'/);
assert.doesNotMatch(source,/ensureFirebaseAiServices|ensureFirebaseAiApiKeyAllowlist|enableService|method:'POST'|method:'PATCH'|webAppsUrl, \{ method: 'POST'/);
console.log('PASS Firebase Web staging config is reused, validated and retrieved without cloud mutations');
