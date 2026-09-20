import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if (sha !== process.env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('EXACT_SHA_REQUIRED');

const apk='android/app/build/outputs/apk/debug/app-debug.apk';
if(!fs.existsSync(apk)) throw new Error('APK_MISSING');

const bytes=fs.readFileSync(apk);
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
const directory='engineering-candidate';
fs.mkdirSync(directory,{recursive:true});

const name='TuTop-build118-'+sha.slice(0,12)+'-publication-self-heal-staging.apk';
fs.copyFileSync(apk,directory+'/'+name);
fs.writeFileSync(directory+'/'+name+'.sha256',hash+'  '+name+'\n');

const manifest={
  candidate:'build118-publication-self-heal',
  source_sha:sha,
  apk:name,
  apk_sha256:hash,
  android_version_code:90212,
  beta_version:'0.9.2-beta.8',
  base_build117_sha:'a578a214f17f3a0ddb7c0d8c6039866f0252c015',
  active_staging_ruleset:'projects/tutop-beta-vicmdlb-1356585881/rulesets/dc2d1f98-08bf-46b9-9bf5-d177e5a88c27',
  active_staging_rules_sha256:'35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a',
  root_cause_history:[
    'MISSING_RATE_BUCKET_READ_PERMISSION',
    'SUCCESSOR_AVAILABILITY_STATUS_RULES_MISMATCH'
  ],
  build118_repairs:[
    'one_shot_publication_session_self_heal',
    'same_operation_id_retry_no_duplicate',
    'verified_email_refresh_before_retry',
    'specific_session_recovery_user_messages',
    'physical_qa_previous_candidate_invalidation_guard'
  ],
  inherited_repairs:[
    'server_time_rate_limit_and_publish_idempotency',
    'durable_uid_scoped_drafts',
    'explicit_listing_location_consent',
    'topi_pii_redaction_and_structured_compose',
    'erasure_truth_and_pagination',
    'push_account_isolation',
    'moderation_least_privilege_and_race_defense',
    'reservation_availability_and_atomic_reserve',
    'uid_scoped_personalization',
    'firebase_request_timeouts',
    'accessibility_semantics'
  ],
  pre_apk_gate:'FULL_REGRESSION_RULES_EMULATOR_LIVE_STAGING_PUBLICATION_ANDROID_GREEN',
  physical_evidence:'NOT_TESTED',
  spend:0,
  real_fcm_sent:false,
  play_or_production_release:false,
  status:'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A'
};
fs.writeFileSync(directory+'/provenance.json',JSON.stringify(manifest,null,2)+'\n');
if(fs.existsSync('firebase/firestore.v2.generated.rules')){
  fs.copyFileSync('firebase/firestore.v2.generated.rules',directory+'/firestore.candidate118.rules');
}
if(fs.existsSync('staging-candidate118-rules-readback/evidence.json')){
  fs.copyFileSync('staging-candidate118-rules-readback/evidence.json',directory+'/staging-rules-readback.json');
}
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
