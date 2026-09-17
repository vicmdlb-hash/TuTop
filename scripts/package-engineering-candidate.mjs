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
const name='TuTop-build110-'+sha.slice(0,12)+'-engineering-staging.apk';
fs.copyFileSync(apk,directory+'/'+name);
fs.writeFileSync(directory+'/'+name+'.sha256',hash+'  '+name+'\n');
const manifest={
 candidate:'build110-engineering',source_sha:sha,apk:name,apk_sha256:hash,android_version_code:90204,
 base_physical_sha:'b54b03cb01d1b3ec42dd1458ad3e1bb3bd22043c',
 post106_base_sha:'05167e82eb0756459a29fcd1d676f49aa709017f',
 superseded_engineering_sha:'ab58367944a59b8d86ed6c0554840860ef6eceb7',
 workflow_run_id:process.env.GITHUB_RUN_ID,
 status:'QUARANTINED_AWAITING_ATOMIC_RULES_CUTOVER',
 physical_evidence:'NOT_TESTED',
 shared_staging_rules_deployed:false,real_fcm_sent:false,spend:0,
 gates:['read-only staging preflight rebound to build110 exact SHA','verified-email staging Rules cutover with rollback','Device A legacy recovery registration verification publication photo AI session','two-user marketplace FCM device receive and correct tap target'],
};
fs.writeFileSync(directory+'/provenance.json',JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync('firebase/firestore.v2.generated.rules',directory+'/firestore.verified-email.rules');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
