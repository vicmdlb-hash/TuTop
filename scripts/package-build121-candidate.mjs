import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BRANCH='candidate/tutop-121-post120-physical-repair';
const PACKAGE='mx.tutop.app';
const VERSION='0.9.2-beta.11';
const VERSION_CODE=90215;

function required(name){const value=String(process.env[name]||'').trim();if(!value)throw new Error('MISSING_'+name);return value;}
function git(args){return execFileSync('git',args,{encoding:'utf8'}).trim();}
function hex(value,length,code){const clean=String(value||'').replace(/:/g,'').trim();if(!new RegExp('^[0-9A-Fa-f]{'+length+'}$').test(clean))throw new Error(code);return clean;}

const sourceSha=git(['rev-parse','HEAD']);
if(sourceSha!==required('GITHUB_SHA')||!/^[a-f0-9]{40}$/.test(sourceSha))throw new Error('EXACT_SOURCE_SHA_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)throw new Error('EXACT_CANDIDATE_BRANCH_REQUIRED');
if(required('TUTOP_NEXT_CANDIDATE_SOURCE_SHA')!==sourceSha)throw new Error('EXTRACTED_SOURCE_SHA_MISMATCH');

const apk='android/app/build/outputs/apk/debug/app-debug.apk';
if(!fs.existsSync(apk)||fs.statSync(apk).size<=0)throw new Error('APK_MISSING');
const apkSha256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
if(required('TUTOP_NEXT_CANDIDATE_APK_SHA256').toLowerCase()!==apkSha256)throw new Error('APK_SHA256_ENV_MISMATCH');

const certSha1=hex(required('TUTOP_ANDROID_CERT_SHA1'),40,'CERT_SHA1_INVALID').toUpperCase();
const certSha256=hex(required('TUTOP_ANDROID_CERT_SHA256'),64,'CERT_SHA256_INVALID').toUpperCase();
if(hex(required('TUTOP_EXPECTED_ANDROID_CERT_SHA256'),64,'EXPECTED_CERT_SHA256_INVALID').toUpperCase()!==certSha256)throw new Error('EXPECTED_CERT_SHA256_MISMATCH');

const capacitor=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));
if(capacitor.appId!==PACKAGE)throw new Error('CAPACITOR_PACKAGE_MISMATCH');

const gradle=fs.readFileSync('android/app/build.gradle','utf8');
const versionCode=Number(gradle.match(/versionCode\s+(\d+)/)?.[1]||0);
const versionName=String(gradle.match(/versionName\s+["']([^"']+)["']/)?.[1]||'');
if(versionCode!==VERSION_CODE)throw new Error('ANDROID_VERSION_CODE_MISMATCH');
if(versionName!==VERSION)throw new Error('ANDROID_VERSION_NAME_MISMATCH');

const runtimePaths=[
  'src','public','assets','config','capacitor.config.json','index.html','package.json','package-lock.json',
  'postcss.config.js','tailwind.config.js','tsconfig.json','tsconfig.node.json','vite.config.ts'
];
const clientRuntimeRefs=Object.fromEntries(runtimePaths.map(repoPath=>[repoPath,git(['rev-parse','HEAD:'+repoPath])]));

const directory='engineering-candidate';
fs.mkdirSync(directory,{recursive:true});
const apkName='TuTop-build121-'+sourceSha.slice(0,12)+'-post120-physical-repair-staging.apk';
fs.copyFileSync(apk,path.join(directory,apkName));
fs.writeFileSync(path.join(directory,apkName+'.sha256'),apkSha256+'  '+apkName+'\n');

const manifest={
  schema:'tutop.engineering-candidate.v1',
  candidate:'build121-post120-physical-repair',
  source_branch:BRANCH,
  source_sha:sourceSha,
  package:PACKAGE,
  beta_version:VERSION,
  android_version_code:VERSION_CODE,
  apk:apkName,
  apk_sha256:apkSha256,
  apk_cert_sha1:certSha1,
  apk_cert_sha256:certSha256,
  build_run_id:Number(process.env.GITHUB_RUN_ID||0),
  build_run_number:Number(process.env.GITHUB_RUN_NUMBER||0),
  gate_run_id:Number(process.env.GITHUB_RUN_ID||0),
  staging_smoke_run_id:Number(process.env.GITHUB_RUN_ID||0),
  client_runtime_refs:clientRuntimeRefs,
  predecessor:{
    build:120,
    source_sha:'554f4ef6d0429b0059738d8cd6e1b6e4890bda91',
    status:'obsolete_physical_fail',
  },
  physical_failures_targeted:[
    'SECOND_ACCOUNT_EMAIL_VERIFICATION_PHYSICAL_FAIL',
    'TOPI_REAL_AI_PHYSICAL_FAIL',
    'NOTIFICATION_ACTIVATION_PHYSICAL_FAIL',
    'REAL_TWO_DEVICE_FCM_UNPROVEN',
  ],
  automated_gates:{
    source_regression:true,
    firestore_storage_emulator:true,
    public_staging_readback:true,
    auth_client_readback:true,
    auth_email_readback:true,
    app_check_readback:true,
    topi_firebase_ai_runtime_smoke:true,
    exact_sha256_firebase_binding:true,
    exact_sha1_api_key_binding:true,
    prepromotion_external_gate:true,
  },
  physical_evidence:'NOT_TESTED',
  device_a:'PENDING',
  device_b:'PENDING',
  real_two_device_fcm:'PENDING',
  spend:0,
  play:false,
  production:false,
  real_fcm_sent:false,
  status:'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A_B',
};
fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({source_sha:sourceSha,package:PACKAGE,version:VERSION,version_code:VERSION_CODE,apk:apkName,apk_sha256:apkSha256,cert_sha256:certSha256,status:manifest.status}));
