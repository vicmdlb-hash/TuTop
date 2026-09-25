import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { extractApkSignerDigest } from './apksigner-certificate-digest.mjs';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const PACKAGE='mx.tutop.app';
const BRANCH='candidate/tutop-121-post120-physical-repair';
const ACK='EXTRACT_EXACT_NEXT_CANDIDATE_APK_IDENTITY';

function required(name){const v=String(process.env[name]||'').trim();if(!v)throw new Error('MISSING_'+name);return v;}
if(process.env.GITHUB_ACTIONS!=='true')throw new Error('GITHUB_ACTIONS_REQUIRED');
if(String(process.env.GITHUB_REF_NAME||'')!==BRANCH)throw new Error('EXACT_EXTRACTION_BRANCH_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_NEXT_CANDIDATE_IDENTITY_ACK||'')!==ACK)throw new Error('EXACT_APK_IDENTITY_ACK_REQUIRED');

const sourceSha=required('GITHUB_SHA');
if(!/^[0-9a-f]{40}$/.test(sourceSha))throw new Error('SOURCE_SHA_INVALID');
const apk=path.resolve(required('TUTOP_NEXT_CANDIDATE_APK_PATH'));
if(!fs.existsSync(apk)||fs.statSync(apk).size<=0)throw new Error('NEXT_CANDIDATE_APK_MISSING');
const apkSha256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');

const androidHome=String(process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||'').trim();
if(!androidHome)throw new Error('ANDROID_HOME_REQUIRED');
const buildTools=path.join(androidHome,'build-tools');
const versions=fs.readdirSync(buildTools,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
if(!versions.length)throw new Error('ANDROID_BUILD_TOOLS_REQUIRED');
const buildToolsBin=path.join(buildTools,versions.at(-1));
const apksigner=path.join(buildToolsBin,process.platform==='win32'?'apksigner.bat':'apksigner');
const aapt2=path.join(buildToolsBin,process.platform==='win32'?'aapt2.exe':'aapt2');
if(!fs.existsSync(apksigner))throw new Error('APKSIGNER_REQUIRED');
if(!fs.existsSync(aapt2))throw new Error('AAPT2_REQUIRED');

const badging=execFileSync(aapt2,['dump','badging',apk],{encoding:'utf8'});
const packageName=String(badging.match(/package:\s+name='([^']+)'/i)?.[1]||'').trim();
if(!packageName)throw new Error('APK_PACKAGE_NAME_MISSING');
if(packageName!==PACKAGE)throw new Error('APK_PACKAGE_MISMATCH');

const output=execFileSync(apksigner,['verify','--print-certs',apk],{encoding:'utf8'});
const certSha1=extractApkSignerDigest(output,'SHA-1',40);
const certSha256=extractApkSignerDigest(output,'SHA-256',64);
const githubEnv=required('GITHUB_ENV');
fs.appendFileSync(githubEnv,[
  `TUTOP_NEXT_CANDIDATE_SOURCE_SHA=${sourceSha}`,
  `TUTOP_NEXT_CANDIDATE_APK_SHA256=${apkSha256}`,
  `TUTOP_ANDROID_CERT_SHA1=${certSha1}`,
  `TUTOP_ANDROID_CERT_SHA256=${certSha256}`,
  `TUTOP_EXPECTED_ANDROID_CERT_SHA256=${certSha256}`,
].join('\n')+'\n');

console.log(JSON.stringify({
 status:'PASS',project:PROJECT,package:packageName,source_sha:sourceSha,apk_sha256:apkSha256,
 cert_sha1:certSha1,cert_sha256:certSha256,
 mutation:false,production:false,play:false,
},null,2));
