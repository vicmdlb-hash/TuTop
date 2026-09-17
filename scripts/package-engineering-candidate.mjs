import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!==process.env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(sha))throw new Error('EXACT_SHA_REQUIRED');
const apk='android/app/build/outputs/apk/debug/app-debug.apk';
const bytes=fs.readFileSync(apk);
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
const directory='engineering-candidate';
fs.mkdirSync(directory,{recursive:true});
const name='TuTop-build108-'+sha.slice(0,12)+'-engineering-staging.apk';
fs.copyFileSync(apk,directory+'/'+name);
fs.writeFileSync(directory+'/'+name+'.sha256',hash+'  '+name+'\n');
const manifest={
 candidate:'build108-engineering',source_sha:sha,apk:name,apk_sha256:hash,android_version_code:90202,
 base_physical_sha:'b54b03cb01d1b3ec42dd1458ad3e1bb3bd22043c',
 post106_base_sha:'6402cfd90e2559ce2e83e285390bad385d96ed27',
 superseded_engineering_sha:'3411f20bfb191ff79935a2e44dbd55c0d53b5d5b',
 workflow_run_id:process.env.GITHUB_RUN_ID,
 status:'QUARANTINED_AWAITING_ATOMIC_RULES_CUTOVER',
 physical_evidence:'NOT_TESTED',
 shared_staging_rules_deployed:false,real_fcm_sent:false,spend:0,
 gates:['verified-email staging Rules cutover with rollback','Device A registration verification publication photo AI session','two-user marketplace FCM device receive and correct tap target'],
};
fs.writeFileSync(directory+'/provenance.json',JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync('firebase/firestore.v2.generated.rules',directory+'/firestore.verified-email.rules');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
