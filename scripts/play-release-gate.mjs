import fs from 'node:fs';

const CONFIRM='PREPARE_SIGNED_AAB_NO_UPLOAD';
const STAGING='tutop-beta-vicmdlb-1356585881';
const HISTORICAL='tutop-3a4f7';
const PACKAGE='mx.tutop.app';

function stop(code){throw new Error(code)}
function env(name){const value=String(process.env[name]||'').trim(); if(!value)stop('MISSING_'+name); return value}
function decodeJson(name){
  let text='';
  try{text=Buffer.from(env(name),'base64').toString('utf8')}catch{stop('INVALID_BASE64_'+name)}
  try{return JSON.parse(text)}catch{stop('INVALID_JSON_'+name)}
}
function mask(value){if(process.env.GITHUB_ACTIONS==='true'&&value)process.stdout.write('::add-mask::'+value+'\n')}

if(String(process.env.TUTOP_PLAY_RELEASE_CONFIRM||'')!==CONFIRM) stop('EXPLICIT_PLAY_AAB_CONFIRMATION_REQUIRED');
const project=JSON.parse(fs.readFileSync('config/project.json','utf8'));
if(project.productionPublishingAllowed!==true) stop('PRODUCTION_PUBLISHING_NOT_AUTHORIZED');
if(project.billingAllowed!==false) stop('BILLING_MUST_REMAIN_FALSE_FOR_PREPARE_ONLY');

const projectId=env('TUTOP_PLAY_PROJECT_ID');
if([STAGING,HISTORICAL].includes(projectId)) stop('PRODUCTION_PROJECT_MUST_NOT_BE_STAGING_OR_HISTORICAL');

const web=decodeJson('TUTOP_PLAY_WEB_CONFIG_B64');
const android=decodeJson('TUTOP_PLAY_GOOGLE_SERVICES_B64');
if(String(web.projectId||'')!==projectId) stop('PLAY_WEB_CONFIG_PROJECT_MISMATCH');
if(String(android?.project_info?.project_id||'')!==projectId) stop('PLAY_ANDROID_CONFIG_PROJECT_MISMATCH');
const packages=(android?.client||[]).map(c=>String(c?.client_info?.android_client_info?.package_name||'')).filter(Boolean);
if(!packages.includes(PACKAGE)) stop('PLAY_ANDROID_PACKAGE_MISMATCH');

const keystoreB64=env('TUTOP_UPLOAD_KEYSTORE_B64');
const alias=env('TUTOP_UPLOAD_KEY_ALIAS');
const storePass=env('TUTOP_UPLOAD_KEYSTORE_PASSWORD');
const keyPass=env('TUTOP_UPLOAD_KEY_PASSWORD');
for(const v of [web.apiKey,web.appId,keystoreB64,alias,storePass,keyPass]) mask(String(v||''));

const versionName=env('TUTOP_PLAY_VERSION_NAME');
const versionCode=Number(env('TUTOP_PLAY_VERSION_CODE'));
if(!/^\d+\.\d+\.\d+$/.test(versionName)) stop('PLAY_VERSION_NAME_MUST_BE_SEMVER_RELEASE');
if(!Number.isInteger(versionCode)||versionCode<=90212) stop('PLAY_VERSION_CODE_MUST_EXCEED_90212');

if(process.argv.includes('--materialize')){
  const envFile=env('GITHUB_ENV');
  fs.writeFileSync('.tutop-play-web-config.json',JSON.stringify(web),{mode:0o600});
  fs.writeFileSync('.tutop-play-google-services.json',JSON.stringify(android),{mode:0o600});
  fs.writeFileSync('.tutop-upload-key.jks',Buffer.from(keystoreB64,'base64'),{mode:0o600});
  const lines=[
    'VITE_FIREBASE_API_KEY='+web.apiKey,
    'VITE_FIREBASE_AUTH_DOMAIN='+(web.authDomain||projectId+'.firebaseapp.com'),
    'VITE_FIREBASE_PROJECT_ID='+projectId,
    'VITE_FIREBASE_APP_ID='+web.appId,
    'VITE_FIREBASE_STORAGE_BUCKET='+(web.storageBucket||projectId+'.firebasestorage.app'),
    'VITE_TUTOP_SCHEMA_V2=true',
    'VITE_TUTOP_ENVIRONMENT=production',
    'VITE_TUTOP_APP_VERSION='+versionName,
    'VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED=true',
    'VITE_TUTOP_MEDIA_STORAGE_ENABLED=false',
    'TUTOP_ANDROID_GOOGLE_SERVICES_PATH=.tutop-play-google-services.json',
    'TUTOP_UPLOAD_KEYSTORE_PATH=.tutop-upload-key.jks',
  ];
  fs.appendFileSync(envFile,lines.join('\n')+'\n');
}

console.log(JSON.stringify({
  status:process.argv.includes('--materialize')?'PLAY_AAB_INPUTS_MATERIALIZED':'PLAY_AAB_INPUTS_VALIDATED',
  project_id:projectId,
  package_name:PACKAGE,
  version_name:versionName,
  version_code:versionCode,
  billing_allowed:false,
  play_upload:false,
  signing_key_generated:false
}));
