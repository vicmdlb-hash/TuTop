// Pure, credential-free selection/validation of an already-registered staging Firebase Android app.
export const STAGING_ID = 'tutop-beta-vicmdlb-1356585881';
export const ANDROID_ID = 'mx.tutop.app';
export function selectExistingStagingAndroidApp(apps, projectId=STAGING_ID, packageName=ANDROID_ID) {
  if(projectId!==STAGING_ID||packageName!==ANDROID_ID) throw Error('STAGING_ANDROID_IDENTITY_REJECTED');
  if(!Array.isArray(apps)) throw Error('STAGING_ANDROID_LIST_INVALID');
  const found=apps.filter(a=>a?.packageName===packageName&&a?.state!=='DELETED');
  if(found.length!==1) throw Error('STAGING_ANDROID_REGISTERED_APP_NOT_UNIQUE');
  const app=found[0];
  if(typeof app.appId!=='string'||!app.appId.trim()||typeof app.name!=='string'||
     !app.name.startsWith(`projects/${projectId}/androidApps/`)||
     !/^projects\/[a-z0-9-]+\/androidApps\/[A-Za-z0-9:._-]+$/.test(app.name))
    throw Error('STAGING_ANDROID_APP_METADATA_INVALID');
  return app;
}
export function validateExistingStagingAndroidConfig(config, projectId=STAGING_ID, packageName=ANDROID_ID) {
  if(projectId!==STAGING_ID||packageName!==ANDROID_ID) throw Error('STAGING_ANDROID_IDENTITY_REJECTED');
  if(config?.configFilename!=='google-services.json'||typeof config.configFileContents!=='string')
    throw Error('STAGING_ANDROID_CONFIG_MISSING');
  let parsed;
  try { parsed=JSON.parse(Buffer.from(config.configFileContents,'base64').toString('utf8')); }
  catch { throw Error('STAGING_ANDROID_CONFIG_INVALID'); }
  if(parsed?.project_info?.project_id!==projectId) throw Error('STAGING_ANDROID_PROJECT_MISMATCH');
  const clients=Array.isArray(parsed.client)?parsed.client:[];
  const matched=clients.filter(c=>c?.client_info?.android_client_info?.package_name===packageName);
  if(matched.length!==1) throw Error('STAGING_ANDROID_CLIENT_NOT_UNIQUE');
  if(!(Array.isArray(matched[0].api_key)&&matched[0].api_key.some(k=>typeof k?.current_key==='string'&&k.current_key.trim())))
    throw Error('STAGING_ANDROID_API_KEY_MISSING');
  return parsed;
}
