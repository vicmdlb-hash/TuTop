import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if (sha !== process.env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('EXACT_SHA_REQUIRED');
const apk = 'android/app/build/outputs/apk/debug/app-debug.apk';
if (!fs.existsSync(apk)) throw new Error('APK_MISSING');
const bytes = fs.readFileSync(apk);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const directory = 'engineering-candidate';
fs.mkdirSync(directory,{recursive:true});
const name = 'TuTop-build117-' + sha.slice(0,12) + '-all-fixes-staging.apk';
fs.copyFileSync(apk,directory + '/' + name);
fs.writeFileSync(directory + '/' + name + '.sha256', hash + '  ' + name + '\n');
const manifest = {
  candidate: 'build117-all-fixes',
  source_sha: sha,
  apk: name,
  apk_sha256: hash,
  android_version_code: 90211,
  beta_version: '0.9.2-beta.7',
  base_build116_sha: '8a4368ba0fce34d0a87acc8eccf38bf5dc019bc2',
  root_cause_publication: 'MISSING_RATE_BUCKET_READ_PERMISSION',
  repairs: [
    'live_rate_bucket_read_contract_and_client_publication_hardening',
    'server_time_rate_window_and_publish_idempotency',
    'durable_uid_scoped_drafts',
    'explicit_listing_location_consent_and_uid_location_cache',
    'topi_pii_redaction_and_structured_compose',
    'account_erasure_truth_pagination_and_completion_attestation',
    'push_permission_ownership_and_recipient_uid_isolation',
    'moderation_fail_closed_roles_least_privilege_and_nearby_freshness',
    'seller_edit_moderation_update_time_race_defense',
    'reservation_availability_and_atomic_counteroffer_reserve',
    'account_local_personalization_isolation',
    'firebase_request_timeouts',
    'accessibility_semantics',
    'historical_candidate_ci_trigger_hygiene'
  ],
  pre_apk_gate: 'ALL_CANDIDATE117_SOFTWARE_RULES_AND_LIVE_PUBLICATION_CHECKS_PASS',
  physical_evidence: 'NOT_TESTED',
  spend: 0,
  real_fcm_sent: false,
  play_or_production_release: false,
  status: 'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A',
};
fs.writeFileSync(directory + '/provenance.json', JSON.stringify(manifest,null,2) + '\n');
if (fs.existsSync('firebase/firestore.v2.generated.rules')) {
  fs.copyFileSync('firebase/firestore.v2.generated.rules', directory + '/firestore.candidate117.rules');
}
if (fs.existsSync('staging-candidate117-rules-cutover/applied.json')) {
  fs.copyFileSync('staging-candidate117-rules-cutover/applied.json', directory + '/staging-rules-cutover.json');
}
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
