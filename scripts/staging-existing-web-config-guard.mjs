// Existing Firebase Web staging config; no app creation or API provisioning.
export const STAGING_ID='tutop-beta-vicmdlb-1356585881';
export function selectExistingStagingWebApp(apps, projectId=STAGING_ID) {
  if(projectId!==STAGING_ID) throw Error('STAGING_WEB_WRONG_PROJECT');
  if(!Array.isArray(apps)) throw Error('STAGING_WEB_LIST_MALFORMED');
  const active=apps.filter(x=>x?.state!=='DELETED'&&typeof x?.name==='string'&&x.name.startsWith(`projects/${projectId}/webApps/`));
  const preferred=active.filter(x=>x.displayName==='TuTop V2 Staging Smoke');
  const matches=preferred.length>0?preferred:active;
  if(matches.length!==1) throw Error('STAGING_WEB_EXISTING_APP_NOT_UNIQUE');
  const selected=matches[0];
  if(!/^projects\/[a-z0-9-]+\/webApps\/[A-Za-z0-9:._-]+$/.test(selected.name)) throw Error('STAGING_WEB_APP_NAME_INVALID');
  return selected;
}
export function validateExistingWebConfig(config, projectId=STAGING_ID) {
  if(projectId!==STAGING_ID) throw Error('STAGING_WEB_WRONG_PROJECT');
  if(!config||typeof config!=='object'||Array.isArray(config)||config.projectId!==projectId)
    throw Error('STAGING_WEB_PROJECT_MISMATCH');
  for(const key of ['apiKey','appId'])
    if(typeof config[key]!=='string'||!config[key].trim()) throw Error('STAGING_WEB_FIELD_MISSING');
  if(config.authDomain!=null && typeof config.authDomain!=='string') throw Error('STAGING_WEB_DOMAIN_INVALID');
  if(config.storageBucket!=null && typeof config.storageBucket!=='string') throw Error('STAGING_WEB_BUCKET_INVALID');
  return {
    apiKey:config.apiKey,
    authDomain:config.authDomain||`${projectId}.firebaseapp.com`,
    projectId:config.projectId,appId:config.appId,
    storageBucket:config.storageBucket||`${projectId}.firebasestorage.app`,
  };
}
