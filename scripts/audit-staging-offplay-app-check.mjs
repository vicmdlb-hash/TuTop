import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');

const token=await firebaseCiAccessToken();
const headers={Authorization:`Bearer ${token}`,'X-Goog-User-Project':PROJECT};
async function get(url){
  const response=await fetch(url,{headers});
  const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{}
  if(!response.ok)throw new Error('HTTP_'+response.status);
  return body;
}

const project=await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
const projectNumber=String(project?.projectNumber||'').trim();
if(!/^\d+$/.test(projectNumber))throw new Error('PROJECT_NUMBER_REQUIRED');

const apps=await get(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps?pageSize=100`);
const app=(apps.apps||[]).find(x=>x.packageName===PACKAGE&&x.state!=='DELETED');
if(!app?.appId||!app?.name)throw new Error('STAGING_ANDROID_APP_REQUIRED');

const certs=await get(`https://firebase.googleapis.com/v1beta1/${app.name}/sha`);
const sha256=(certs.certificates||[]).filter(x=>x.certType==='SHA_256'&&String(x.shaHash||'').trim());
const name=`projects/${projectNumber}/apps/${app.appId}/playIntegrityConfig`;
const config=await get(`https://firebaseappcheck.googleapis.com/v1/${name}`);

const normalize=value=>String(value||'').replace(/:/g,'').toUpperCase();
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
console.log('PASS staging App Check off-Play policy is repaired and read back.');
if(expectedSha256 && exactExpectedSha256!==true) throw new Error('EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED');
if(!expectedSha256) console.log('INFO no exact successor certificate supplied; source-only audit cannot prove candidate binding.');
else console.log('PASS exact successor Android SHA-256 is registered in staging Firebase.');
