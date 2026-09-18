import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if (sha !== process.env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('EXACT_SHA_REQUIRED');
const apk = 'android/app/build/outputs/apk/debug/app-debug.apk';
const bytes = fs.readFileSync(apk);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const directory = 'engineering-candidate';
fs.mkdirSync(directory,{recursive:true});
const name = 'TuTop-build111-' + sha.slice(0,12) + '-physical-repair-staging.apk';
fs.copyFileSync(apk,directory + '/' + name);
fs.writeFileSync(directory + '/' + name + '.sha256', hash + '  ' + name + '\n');
const manifest = {
  candidate: 'build111-physical-repair',
  source_sha: sha,
  apk: name,
  apk_sha256: hash,
  android_version_code: 90205,
  base_build110_sha: '9dfbe008b70f60cc88b03961aac1e15455f2aebb',
  observed_device_feedback: ['registration_permissions_pre_cutover','legacy_recovery_primary_nav_confusing','branding_reference_mismatch'],
  integrated_post110_repairs: ['notification_cold_start_reroute','canonical_transaction_state_guards','privacy_deletion_surface_alignment'],
  physical_evidence: 'NOT_TESTED',
  spend: 0,
  shared_staging_rules_expected: 'verified_email_cutover_required_or_already_applied',
  real_fcm_sent: false,
  status: 'ENGINEERING_CANDIDATE_AWAITING_DEVICE_RETEST',
};
fs.writeFileSync(directory + '/provenance.json', JSON.stringify(manifest,null,2) + '\n');
fs.copyFileSync('firebase/firestore.v2.generated.rules', directory + '/firestore.verified-email.rules');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
