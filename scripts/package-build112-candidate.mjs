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
const name = 'TuTop-build112-' + sha.slice(0,12) + '-artifact-visual-repair-staging.apk';
fs.copyFileSync(apk,directory + '/' + name);
fs.writeFileSync(directory + '/' + name + '.sha256', hash + '  ' + name + '\n');
const manifest = {
  candidate: 'build112-artifact-visual-repair',
  source_sha: sha,
  apk: name,
  apk_sha256: hash,
  android_version_code: 90206,
  base_build111_sha: 'af756cccd0e14dbcf4723d511f8e9f88cab25650',
  predecessor_rejection: {
    candidate: 'build111',
    reason: 'ARTIFACT_VISUAL_FAIL',
    evidence: [
      'packaged_legacy_ic_launcher_fully_transparent',
      'packaged_splash_missing_topi_reference_image',
      'packaged_splash_layout_clipped_or_incomplete'
    ]
  },
  preserved_repairs: [
    'verified_email_registration_rules_cutover',
    'legacy_recovery_secondary_auth_path',
    'notification_cold_start_reroute',
    'canonical_transaction_state_guards',
    'privacy_deletion_surface_alignment'
  ],
  artifact_visual_gate: 'APK_PIXEL_AUDIT_REQUIRED',
  physical_evidence: 'NOT_TESTED',
  spend: 0,
  real_fcm_sent: false,
  status: 'ENGINEERING_CANDIDATE_AWAITING_DEVICE_RETEST',
};
fs.writeFileSync(directory + '/provenance.json', JSON.stringify(manifest,null,2) + '\n');
fs.copyFileSync('firebase/firestore.v2.generated.rules', directory + '/firestore.verified-email.rules');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
