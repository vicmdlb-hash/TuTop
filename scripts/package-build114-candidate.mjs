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
const name = 'TuTop-build114-' + sha.slice(0,12) + '-component-branding-staging.apk';
fs.copyFileSync(apk,directory + '/' + name);
fs.writeFileSync(directory + '/' + name + '.sha256', hash + '  ' + name + '\n');
const manifest = {
  candidate: 'build114-component-branding-extraction',
  source_sha: sha,
  apk: name,
  apk_sha256: hash,
  android_version_code: 90208,
  base_build113_sha: '71b492597921632d75943115e1384d69e646e8eb',
  predecessor_rejections: [
    { candidate:'build111', reason:'ARTIFACT_VISUAL_FAIL', evidence:['transparent_legacy_launcher','topi_missing_from_packaged_splash'] },
    { candidate:'build112', reason:'ARTIFACT_VISUAL_QA_FAIL', evidence:['launcher_board_caption_residue','splash_palette_board_residue'] },
    { candidate:'build113', reason:'ARTIFACT_VISUAL_QA_FAIL', evidence:['launcher_caption_residue_persisted','destructive_white_masks_over_topi','palette_residue_persisted'] }
  ],
  branding_extraction: 'NORMALIZED_RASTER_LARGEST_CONNECTED_COMPONENT',
  physical_evidence: 'NOT_TESTED',
  spend: 0,
  real_fcm_sent: false,
  status: 'ENGINEERING_CANDIDATE_AWAITING_ARTIFACT_VISUAL_REVIEW',
};
fs.writeFileSync(directory + '/provenance.json', JSON.stringify(manifest,null,2) + '\n');
fs.copyFileSync('firebase/firestore.v2.generated.rules', directory + '/firestore.verified-email.rules');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,status:manifest.status}));
