import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PROJECT='tutop-beta-vicmdlb-1356585881';
const ACK='EXTRACT_EXACT_NEXT_CANDIDATE_APK_IDENTITY';

function required(name){const v=String(process.env[name]||'').trim();if(!v)throw new Error('MISSING_'+name);return v;}
if(process.env.GITHUB_ACTIONS!=='true')throw new Error('GITHUB_ACTIONS_REQUIRED');
if(String(process.env.TUTOP_FIREBASE_PROJECT_ID||'')!==PROJECT)throw new Error('STAGING_PROJECT_REQUIRED');
if(String(process.env.TUTOP_NEXT_CANDIDATE_IDENTITY_ACK||'')!==ACK)throw new Error('EXACT_APK_IDENTITY_ACK_REQUIRED');

const apk=path.resolve(required('TUTOP_NEXT_CANDIDATE_APK_PATH'));
if(!fs.existsSync(apk)||fs.statSync(apk).size<=0)throw new Error('NEXT_CANDIDATE_APK_MISSING');
const apkSha256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');

const androidHome=String(process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||'').trim();
if(!androidHome)throw new Error('ANDROID_HOME_REQUIRED');
const buildTools=path.join(androidHome,'build-tools');
const versions=fs.readdirSync(buildTools,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
if(!versions.length)throw new Error('ANDROID_BUILD_TOOLS_REQUIRED');
const apksigner=path.join(buildTools,versions.at(-1),process.platform==='win32'?'apksigner.bat':'apksigner');
if(!fs.existsSync(apksigner))throw new Error('APKSIGNER_REQUIRED');

const output=execFileSync(apksigner,['verify','--print-certs',apk],{encoding:'utf8'});
const digest=(kind,length)=>{
  const re=new RegExp(`Signer #1 certificate ${kind} digest:\\s*([0-9A-Fa-f:]+)`,'i');
  const m=output.match(re); const v=String(m?.[1]||'').replace(/:/g,'').toUpperCase();
  if(!new RegExp(`^[0-9A-F]{${length}}$`).test(v))throw new Error(`APK_CERT_${kind.replace(/-/g,'')}_INVALID`);
  return v;
};
const certSha1=digest('SHA-1',40);
const certSha256=digest('SHA-256',64);
const githubEnv=required('GITHUB_ENV');
fs.appendFileSync(githubEnv,[
  `TUTOP_NEXT_CANDIDATE_APK_SHA256=${apkSha256}`,
  `TUTOP_ANDROID_CERT_SHA1=${certSha1}`,
  `TUTOP_ANDROID_CERT_SHA256=${certSha256}`,
  `TUTOP_EXPECTED_ANDROID_CERT_SHA256=${certSha256}`,
].join('\n')+'\n');

console.log(JSON.stringify({
 status:'PASS',project:PROJECT,apk_sha256:apkSha256,
 cert_sha1:certSha1,cert_sha256:certSha256,
 mutation:false,production:false,play:false,
},null,2));
