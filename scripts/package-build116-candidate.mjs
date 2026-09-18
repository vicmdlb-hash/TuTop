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
const name = 'TuTop-build116-' + sha.slice(0,12) + '-deviceA-publication-repair-staging.apk';
fs.copyFileSync(apk,directory + '/' + name);
fs.writeFileSync(directory + '/' + name + '.sha256', hash + '  ' + name + '\n');
const manifest = {
  candidate: 'build116-deviceA-publication-repair',
  source_sha: sha,
  apk: name,
  apk_sha256: hash,
  android_version_code: 90210,
  base_build115_sha: '694771eb2934d04bbb24e257e77d559b2430e518',
  trigger: 'DEVICE_A_BUILD115_PHYSICAL_FAIL',
  repairs: [
    'verified_email_claim_refresh_before_publish',
    'publish_draft_persistence_across_tabs',
    'topi_compose_applies_suggestions_to_form',
    'permission_state_requery_and_foreground_refresh'
  ],
  physical_evidence: 'NOT_TESTED',
  spend: 0,
  real_fcm_sent: false,
  status: 'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A',
};
fs.writeFileSync(directory + '/provenance.json', JSON.stringify(manifest,null,2) + '\n');
if (fs.existsSync('firebase/firestore.v2.generated.rules')) {
  fs.copyFileSync('firebase/firestore.v2.generated.rules', directory + '/firestore.verified-email.rules');
}
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
