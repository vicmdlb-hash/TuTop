// Read-only retrieval of existing staging Firebase Web client configuration.
// Never enable APIs, register new apps or alter API-key restrictions during a build.
import fs from 'node:fs';
import {firebaseCiAccessToken} from './firebase-ci-auth.mjs';
import {assertStagingConfigReadContext} from './staging-freeze-guard.mjs';
import {selectExistingStagingWebApp,validateExistingWebConfig} from './staging-existing-web-config-guard.mjs';
const projectId=assertStagingConfigReadContext();
const output=String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH||'.tutop-staging-web-config.json').trim();
if(!/^\.[A-Za-z0-9._-]+\.json$/.test(output)) throw Error('STAGING_WEB_OUTPUT_PATH_UNSAFE');
const token=await firebaseCiAccessToken();
async function read(url) {
 const response=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${token}`,'X-Goog-User-Project':projectId}});
 if(!response.ok) throw Error(`STAGING_WEB_CONFIG_HTTP_${response.status}`);
 try{return await response.json();}catch{throw Error('STAGING_WEB_CONFIG_RESPONSE_INVALID');}
}
const root=`projects/${projectId}`;
const listed=await read(`https://firebase.googleapis.com/v1beta1/${root}/webApps?pageSize=100`);
if(listed?.nextPageToken) throw Error('STAGING_WEB_LIST_PAGINATION_UNPROVEN');
const app=selectExistingStagingWebApp(listed?.apps,projectId);
const config=await read(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
const client=validateExistingWebConfig(config,projectId);
fs.writeFileSync(output,JSON.stringify(client,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('PASS previously registered Firebase Web client config validated read-only.');
console.log('No service/API enabling, app registration, API-key widening or billing performed.');
console.log('Cloud Storage remains disabled unless expressly authorized.');
