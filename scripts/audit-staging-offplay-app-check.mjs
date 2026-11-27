import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};
async function get(url){
  const response=await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('HTTP_'+response.status);
  let body;
  try{body=JSON.parse(await response.text());}catch{throw new Error('STAGING_RESPONSE_INVALID');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('STAGING_RESPONSE_INVALID');
  return body;
}

const project=await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
const projectNumber=String(project?.projectNumber||'').trim();
if(!/^\d+$/.test(projectNumber))throw new Error('PROJECT_NUMBER_REQUIRED');

const apps=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const validAppId=id=>typeof id==='string'&&!!id&&!/[\\/?#%\s\u0000-\u001f\u007f]/.test(id)&&id!=='.'&&id!=='..';
if(apps.nextPageToken)throw new Error('STAGING_ANDROID_APP_LIST_INCOMPLETE');
if(!Array.isArray(apps.apps)||apps.apps.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('STAGING_ANDROID_APP_LIST_MALFORMED');
const matches=apps.apps.filter(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(matches.length!==1)throw new Error('STAGING_ANDROID_APP_IDENTITY_AMBIGUOUS');
const app=matches[0];
if(project.projectId!==PROJECT||app.projectId!==PROJECT||app.state!=='ACTIVE'||!validAppId(app.appId)||app.name!==`projects/${PROJECT}/androidApps/${app.appId}`)throw new Error('STAGING_ANDROID_APP_IDENTITY_MISMATCH');

const certs=await get(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
if(certs.nextPageToken)throw new Error('STAGING_CERT_LIST_INCOMPLETE');
const records=certs.certificates??[];
if(!Array.isArray(records)||records.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('STAGING_CERT_LIST_MALFORMED');
const sha256=records.filter(x=>x.certType==='SHA_256');
const name=`projects/${projectNumber}/apps/${app.appId}/playIntegrityConfig`;
const config=await get(`https://firebaseappcheck.googleapis.com/v1/${name}`);

const normalize=value=>String(value||'').replace(/:/g,'').toUpperCase();
if(config?.name!==name)throw new Error('STAGING_PLAY_INTEGRITY_CONFIG_IDENTITY_MISMATCH');
for(const cert of sha256){const prefix=app.name+'/sha/';if(typeof cert.name!=='string'||!cert.name.startsWith(prefix)||!cert.name.slice(prefix.length)||cert.name.slice(prefix.length).includes('/')||typeof cert.shaHash!=='string'||!/^[0-9A-F]{64}$/.test(normalize(cert.shaHash)))throw new Error('STAGING_CERT_IDENTITY_MALFORMED');}
if(config?.accountDetails?.requireLicensed!==undefined&&typeof config.accountDetails.requireLicensed!=='boolean')throw new Error('OFFPLAY_LICENSE_POLICY_MALFORMED');
const expectedSha256=normalize(process.env.TUTOP_EXPECTED_ANDROID_CERT_SHA256||'');
if(expectedSha256&&!/^[0-9A-F]{64}$/.test(expectedSha256))throw new Error('EXPECTED_ANDROID_CERT_SHA256_INVALID');
const exactExpectedSha256=expectedSha256
  ? sha256.some(x=>normalize(x.shaHash)===expectedSha256)
  : null;

const state={
  status:'READ_ONLY',
  project:PROJECT,
  package:PACKAGE,
  registered_sha256_count:sha256.length,
  expected_sha256_supplied:Boolean(expectedSha256),
  exact_expected_sha256_registered:exactExpectedSha256,
  allow_unrecognized_version:config?.appIntegrity?.allowUnrecognizedVersion===true,
  require_licensed:config?.accountDetails?.requireLicensed===true,
  min_device_integrity:String(config?.deviceIntegrity?.minDeviceRecognitionLevel||'DEVICE_RECOGNITION_LEVEL_UNSPECIFIED'),
  mutation:false,
  spend:0,
};
console.log(JSON.stringify(state,null,2));

if(state.allow_unrecognized_version!==true)throw new Error('OFFPLAY_UNRECOGNIZED_VERSION_NOT_ALLOWED');
if(state.require_licensed!==false)throw new Error('OFFPLAY_LICENSE_MUST_NOT_BE_REQUIRED');
if(state.min_device_integrity!=='MEETS_DEVICE_INTEGRITY')throw new Error('DEVICE_INTEGRITY_NOT_ENFORCED');
if(expectedSha256 && exactExpectedSha256!==true) throw new Error('EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED');
if(!expectedSha256) console.log('POLICY_READ_ONLY_PASS_BINDING_UNVERIFIED');
else console.log('POLICY_AND_EXACT_CERT_BINDING_READ_ONLY_PASS');
