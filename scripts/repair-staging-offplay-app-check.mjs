import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BRANCH='fix/post120-physical-failure-cluster';
const ACK='REPAIR_STAGING_OFFPLAY_APP_CHECK';

function stop(code){throw new Error(code);}
if(process.env.GITHUB_ACTIONS!=='true')stop('GITHUB_ACTIONS_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)stop('EXACT_REPAIR_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)stop('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_STAGING_OFFPLAY_APP_CHECK_ACK||'')!==ACK)stop('EXPLICIT_STAGING_APPCHECK_ACK_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT,'Content-Type':'application/json'};
async function req(url,options={},allowed=[]){
  const response=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const text=await response.text();let body={};
  try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok&&!allowed.includes(response.status))stop(`HTTP_${response.status}`);
  return {status:response.status,body};
}

const project=await req(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
const projectNumber=String(project.body?.projectNumber||'').trim();
if(!/^\d+$/.test(projectNumber))stop('PROJECT_NUMBER_REQUIRED');

const apps=await req(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.body.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.appId||!app?.name)stop('STAGING_ANDROID_APP_REQUIRED');

const certs=await req(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
const sha256=(certs.body.certificates||[]).filter(x=>x.certType==='SHA_256'&&String(x.shaHash||'').trim());
if(!sha256.length)stop('ANDROID_SHA256_CERT_REQUIRED_BEFORE_APPCHECK_REPAIR');

const name=`projects/${projectNumber}/apps/${app.appId}/playIntegrityConfig`;
const url=`https://firebaseappcheck.googleapis.com/v1/${name}`;
const before=await req(url);
const desired={
  allowUnrecognizedVersion:true,
  minDeviceRecognitionLevel:'MEETS_DEVICE_INTEGRITY',
  requireLicensed:false,
};
const current={
  allowUnrecognizedVersion:before.body?.appIntegrity?.allowUnrecognizedVersion===true,
  minDeviceRecognitionLevel:String(before.body?.deviceIntegrity?.minDeviceRecognitionLevel||'DEVICE_RECOGNITION_LEVEL_UNSPECIFIED'),
  requireLicensed:before.body?.accountDetails?.requireLicensed===true,
};
let mutated=false;
if(current.allowUnrecognizedVersion!==desired.allowUnrecognizedVersion
  ||current.minDeviceRecognitionLevel!==desired.minDeviceRecognitionLevel
  ||current.requireLicensed!==desired.requireLicensed){
  const updateMask='appIntegrity.allowUnrecognizedVersion,deviceIntegrity.minDeviceRecognitionLevel,accountDetails.requireLicensed';
  await req(`${url}?updateMask=${encodeURIComponent(updateMask)}`,{
    method:'PATCH',
    body:JSON.stringify({
      name,
      appIntegrity:{allowUnrecognizedVersion:desired.allowUnrecognizedVersion},
      deviceIntegrity:{minDeviceRecognitionLevel:desired.minDeviceRecognitionLevel},
      accountDetails:{requireLicensed:desired.requireLicensed},
    }),
  });
  mutated=true;
}
const after=(await req(url)).body;
const verified=after?.appIntegrity?.allowUnrecognizedVersion===true
  &&String(after?.deviceIntegrity?.minDeviceRecognitionLevel||'')==='MEETS_DEVICE_INTEGRITY'
  &&after?.accountDetails?.requireLicensed!==true;
if(!verified)stop('STAGING_OFFPLAY_APPCHECK_READBACK_FAILED');

console.log(JSON.stringify({
  status:'PASS',
  project:PROJECT,
  package:PACKAGE,
  android_app_id:app.appId,
  registered_sha256_count:sha256.length,
  allow_unrecognized_version:true,
  require_licensed:false,
  min_device_integrity:'MEETS_DEVICE_INTEGRITY',
  mutated,
  spend:0,
  production:false,
  play:false,
},null,2));
console.log('PASS staging Play Integrity accepts off-Play app versions while retaining device-integrity attestation.');
