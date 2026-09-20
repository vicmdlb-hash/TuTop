import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!==process.env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(sha))throw new Error('EXACT_SHA_REQUIRED');

const apk='android/app/build/outputs/apk/debug/app-debug.apk';
if(!fs.existsSync(apk))throw new Error('APK_MISSING');
const bytes=fs.readFileSync(apk);
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
const expectedHash=String(process.env.TUTOP_BUILD119_APK_SHA256||'').trim().toLowerCase();
if(expectedHash&&hash!==expectedHash)throw new Error('APK_SHA256_ENV_MISMATCH');

const cert=String(process.env.TUTOP_BUILD119_CERT_SHA1||'').replace(/:/g,'').trim().toUpperCase();
if(!/^[0-9A-F]{40}$/.test(cert))throw new Error('BUILD119_CERT_SHA1_REQUIRED');

const bindingPath='staging-readiness/build119-native-key-binding.json';
if(!fs.existsSync(bindingPath))throw new Error('BUILD119_STAGING_BINDING_EVIDENCE_MISSING');
const binding=JSON.parse(fs.readFileSync(bindingPath,'utf8'));
if(binding.status!=='PASS'||binding.exact_build119_app_allowed!==true||binding.build119_apk_sha256!==hash||binding.exact_apk_cert_sha1!==cert)throw new Error('BUILD119_STAGING_BINDING_EVIDENCE_MISMATCH');

const directory='engineering-candidate';
fs.mkdirSync(directory,{recursive:true});
const name='TuTop-build119-'+sha.slice(0,12)+'-deviceA-repair-staging.apk';
fs.copyFileSync(apk,directory+'/'+name);
fs.writeFileSync(directory+'/'+name+'.sha256',hash+'  '+name+'\n');

const manifest={
  candidate:'build119-deviceA-repair',
  source_sha:sha,
  repair_base_sha:'fabf7626d86da99d77fc8ba04545a9e0b6c158c0',
  predecessor_build118_sha:'e93ca0bb237e7fa438df5801fc627f065d9441e6',
  apk:name,
  apk_sha256:hash,
  apk_cert_sha1:cert,
  android_version_code:90213,
  beta_version:'0.9.2-beta.9',
  physical_failures_targeted:[
    'REACT_HOOK_ORDER_PHYSICAL_FAIL',
    'TOPI_NATIVE_AI_PHYSICAL_FAIL',
    'NOTIFICATION_ACTIVATION_PHYSICAL_FAIL',
  ],
  build119_repairs:[
    'ProductDetail_hooks_unconditional_before_null_guard',
    'Topi_real_Firebase_AI_bounded_retry_and_safe_failure_classification',
    'exact_Build119_package_certificate_allowed_on_staging_Firebase_API_key',
    'notification_permission_token_ownership_delivery_truth_split',
    'FCM_token_failure_reason_and_retry_UI',
  ],
  staging_native_key_binding:{
    exact_build119_app_allowed:true,
    api_targets_preserved:true,
    mutation_required:Boolean(binding.mutated),
  },
  physical_evidence:'NOT_TESTED',
  publication_result:'UNKNOWN_UNTIL_DEVICE_RETEST',
  spend:0,
  real_fcm_sent:false,
  play_or_production_release:false,
  status:'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A_RETEST',
};
fs.writeFileSync(directory+'/provenance.json',JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(bindingPath,directory+'/staging-native-key-binding.json');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,apk_cert_sha1:cert,status:manifest.status}));
