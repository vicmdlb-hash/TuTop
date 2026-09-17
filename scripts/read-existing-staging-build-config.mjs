import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const project = 'tutop-beta-vicmdlb-1356585881';
if (process.env.TUTOP_FIREBASE_PROJECT_ID !== project) throw new Error('STAGING_PROJECT_REQUIRED');
const token = await firebaseCiAccessToken();
async function get(path) {
  const response = await fetch('https://firebase.googleapis.com/v1beta1/'+path, {headers:{Authorization:'Bearer '+token}});
  if (!response.ok) throw new Error('STAGING_CONFIG_READ_FAILED:'+response.status);
  return response.json();
}
const webApps=await get('projects/'+project+'/webApps');
const webApp=(webApps.apps||[]).find(a=>a.displayName==='TuTop V2 Staging Smoke')||(webApps.apps||[])[0];
const androidApps=await get('projects/'+project+'/androidApps');
const androidApp=(androidApps.apps||[]).find(a=>a.packageName==='mx.tutop.app'&&a.state!=='DELETED');
if(!webApp?.name||!androidApp?.name)throw new Error('EXISTING_STAGING_APPS_REQUIRED');
const web=await get(webApp.name+'/config');
const android=await get(androidApp.name+'/config');
const native=JSON.parse(Buffer.from(android.configFileContents||'','base64').toString('utf8'));
if(web.projectId!==project||native.project_info?.project_id!==project||!(native.client||[]).some(c=>c.client_info?.android_client_info?.package_name==='mx.tutop.app'))throw new Error('STAGING_CONFIG_MISMATCH');
for(const value of [web.apiKey,web.appId,...(native.client||[]).flatMap(c=>(c.api_key||[]).map(k=>k.current_key))]) {
 if(value&&process.env.GITHUB_ACTIONS==='true') console.log('::add-mask::'+value);
}
fs.writeFileSync('.tutop-staging-web-config.json',JSON.stringify(web),{mode:0o600});
fs.writeFileSync('.tutop-staging-google-services.json',JSON.stringify(native),{mode:0o600});
console.log('Existing staging configs read; no service enablement, account reset, Rules deployment or FCM send.');
