import fs from 'node:fs';
import assert from 'node:assert/strict';

const generator = fs.readFileSync('scripts/generate-physical-qa-candidate.mjs', 'utf8');
const verifier = fs.readFileSync('scripts/verify-generated-physical-qa-candidate.mjs', 'utf8');
const metadataVerifier = fs.readFileSync('scripts/verify-physical-qa-candidate-metadata.mjs', 'utf8');
const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const oldCandidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));

// APK28 remains immutable historical evidence for 0.9.0; 0.9.1 builds a new candidate namespace.
assert.equal(oldCandidate.app_version, '0.9.0-beta.0');
assert.equal(oldCandidate.artifact_id, 10292454237);
assert.equal(oldCandidate.apk_sha256, '2131007fb944b144d85eb8c5deb9ad80f93bd20c1515b7793f89278cd1a9f7e3');

for (const envName of [
  'GITHUB_SHA',
  'TUTOP_UPLOAD_ARTIFACT_ID',
  'GITHUB_RUN_ID',
  'TUTOP_VALIDATED_GATE_RUN_ID',
  'TUTOP_VALIDATED_GATE_SHA',
  'TUTOP_VALIDATED_STAGING_RUN_ID',
  'TUTOP_VALIDATED_STAGING_SHA',
]) assert.match(generator, new RegExp(`required\\('${envName}'\\)`));
assert.match(generator, /gateCommitSha !== headSha/);
assert.match(generator, /stagingSmokeCommitSha !== headSha/);
assert.match(generator, /gate_commit_sha: gateCommitSha/);
assert.match(generator, /staging_smoke_commit_sha: stagingSmokeCommitSha/);
assert.match(generator, /git\('rev-parse', 'HEAD'\)/);
assert.match(generator, /git\('rev-parse', 'HEAD\^\{tree\}'\)/);
assert.match(generator, /client_runtime_refs: clientRuntimeRefs/);
assert.match(generator, /physical_release_candidate: true/);
assert.match(generator, /candidate_status: 'generated_exact_head_pending_repo_activation'/);
assert.match(generator, /replacement_required: false/);
assert.match(generator, /reviews_lazy: reviewsCutover/);
assert.match(generator, /wallet_lazy: walletCutover/);
assert.match(generator, /favorites_visible: favoritesCutover/);
assert.match(generator, /0\.9\.1-beta/);
assert.match(generator, /PHYSICAL_QA_CANDIDATE_0\.9\.1\.generated\.json/);
assert.doesNotMatch(generator, /docs\/PHYSICAL_QA_CANDIDATE_0\.9\.json/);

assert.match(verifier, /candidate\.build_commit_sha !== head/);
assert.match(verifier, /candidate\.gate_commit_sha !== head/);
assert.match(verifier, /candidate\.staging_smoke_commit_sha !== head/);
assert.match(verifier, /candidate\.gate_commit_sha !== candidate\.build_commit_sha/);
assert.match(verifier, /candidate\.staging_smoke_commit_sha !== candidate\.build_commit_sha/);
assert.match(verifier, /candidate\.build_tree_sha !== tree/);
assert.match(verifier, /git\('rev-parse', `HEAD:\$\{repoPath\}`\)/);
assert.match(verifier, /candidate\?\.candidate_status !== 'generated_exact_head_pending_repo_activation'/);
assert.match(verifier, /candidate\?\.physical_release_candidate !== true/);
assert.match(verifier, /0\\\.9\\\.1-beta|0\.9\.1-beta/);
assert.match(verifier, /verify-physical-qa-candidate-metadata\.mjs/);

for (const key of [
  'head_sha','gate_run_id','gate_head_sha','staging_smoke_run_id','staging_smoke_head_sha','firebase_project','version','artifact_id','build_run_id',
  'build_run_number','build_tree_sha','apk_sha256','apk_size_bytes','reviews_lazy_cutover','wallet_lazy_cutover','favorites_visible_cutover',
]) assert.match(metadataVerifier, new RegExp(`['\"]${key}['\"]`));
assert.match(metadataVerifier, /metadata\.gate_head_sha !== metadata\.head_sha/);
assert.match(metadataVerifier, /metadata\.staging_smoke_head_sha !== metadata\.head_sha/);

assert.match(android, /enable_favorites_visible_cutover/);
assert.match(android, /VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER: \$\{\{ inputs\.enable_favorites_visible_cutover \}\}/);
assert.match(android, /favorites_visible_cutover=\$\{VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER\}/);
assert.match(android, /id: upload-staging/);
assert.match(android, /steps\.upload-staging\.outputs\.artifact-id/);
assert.match(android, /node scripts\/generate-physical-qa-candidate\.mjs/);
assert.match(android, /verify-generated-physical-qa-candidate\.mjs "\$TUTOP_CANDIDATE_OUTPUT_PATH"/);
assert.match(android, /PHYSICAL_QA_CANDIDATE_0\.9\.1\.generated\.json/);
assert.match(android, /TuTop-0\.9\.1-beta\.0-physical-qa-candidate-\$\{\{ github\.run_number \}\}/);
assert.match(android, /gate_run_id=\$\{TUTOP_VALIDATED_GATE_RUN_ID\}/);
assert.match(android, /gate_head_sha=\$\{TUTOP_VALIDATED_GATE_SHA\}/);
assert.match(android, /staging_smoke_run_id=\$\{TUTOP_VALIDATED_STAGING_RUN_ID\}/);
assert.match(android, /staging_smoke_head_sha=\$\{TUTOP_VALIDATED_STAGING_SHA\}/);
assert.match(android, /apk_sha256=\$\{APK_SHA256\}/);
assert.match(android, /apk_size_bytes=\$\{APK_SIZE\}/);
assert.doesNotMatch(android, /activate-generated-physical-qa-candidate/);
assert.doesNotMatch(android, /rebind-physical-qa-templates/);
assert.doesNotMatch(android, /PHYSICAL_QA_CANDIDATE_0\.9\.json/);

console.log('PASS APK28 remains preserved as historical 0.9.0 evidence');
console.log('PASS TuTop 0.9.1 requires October SHA = staging SHA = Android build SHA');
console.log('PASS Android metadata and generated 0.9.1 candidate bind exact SHA and all cutovers');
console.log('PASS automatic Android workflow cannot activate or overwrite the historical 0.9.0 candidate');
console.log('TuTop 0.9.1 candidate generation contract: PASS');
