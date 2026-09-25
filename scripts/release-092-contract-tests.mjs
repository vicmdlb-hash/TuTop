import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const project = JSON.parse(read('config/project.json'));
const env = read('.env.example');
const workflow = read('.github/workflows/092-release-candidate-v2.yml');
const hostedStagingWorkflow = read('.github/workflows/092-real-staging-software-proof.yml');
const resetConfig = JSON.parse(read('config/staging-reset-once.json'));
const resetScript = read('scripts/reset-staging-accounts.mjs');
const stagingAdmin = read('scripts/staging-v2-admin.mjs');
const firebaseCiAuth = read('scripts/firebase-ci-auth.mjs');
const nativeDevice = read('src/services/nativeDeviceCapabilities.ts');
const nativeAI = read('src/services/nativeTopiAI.ts');
const appCheck = read('src/services/nativeAppCheckToken.ts');
const onboarding = read('src/services/v2OnboardingRecovery.ts');
const prepareAndroid = read('scripts/prepare-staging-android-app.mjs');
const registrationSmoke = read('scripts/staging-app-registration-smoke.mjs');
const generator = read('scripts/generate-physical-qa-candidate.mjs');
const verifier = read('scripts/verify-generated-physical-qa-candidate.mjs');
const physicalCandidate = JSON.parse(read('docs/PHYSICAL_QA_CANDIDATE_0.9.json'));
const privacyDraft = read('public/privacy.html');
const deletionResource = read('public/delete-account.html');
const retentionMatrix = read('docs/RETENTION_ERASURE_MATRIX_0.9.md');
const legalRetentionDossier = read('docs/LEGAL_RETENTION_REVIEW_DOSSIER_0.9.md');
const topiPrivacy = read('src/lib/topiPrivacy.ts');
const fcmPhysicalTemplate = JSON.parse(read('docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json'));
const appCheckPhysicalTemplate = JSON.parse(read('docs/APP_CHECK_PHYSICAL_EVIDENCE_TEMPLATE.json'));

assert.equal(pkg.version, '0.9.2-beta.0');
assert.equal(lock.version, '0.9.2-beta.0');
assert.equal(lock.packages?.['']?.version, '0.9.2-beta.0');
assert.equal(project.currentBetaVersion, '0.9.2-beta.0');
assert.equal(project.applicationId, 'mx.tutop.app');
assert.equal(project.zeroInvestmentMode, true);
assert.equal(project.billingAllowed, false);
assert.equal(project.productionPublishingAllowed, false);
assert.match(env, /VITE_TUTOP_APP_VERSION=0\.9\.2-beta\.0/);
assert.match(env, /VITE_TUTOP_MEDIA_STORAGE_ENABLED=false/);

// Build121 exact engineering / Data Safety preflight.
// This intentionally does NOT approve privacy terms, legal retention, Play
// publication or production. It only proves that engineering evidence is tied
// to the exact active physical candidate and that unresolved legal fields remain
// explicit instead of being silently inferred.
assert.equal(physicalCandidate.app_version, '0.9.2-beta.11');
assert.equal(physicalCandidate.android_version_code, 90215);
assert.equal(physicalCandidate.application_id, 'mx.tutop.app');
assert.equal(physicalCandidate.staging_project, 'tutop-beta-vicmdlb-1356585881');
assert.equal(physicalCandidate.build_commit_sha, '579bdecd7e193b8661276f114b9d3e097792d8d6');
assert.equal(physicalCandidate.artifact_id, 10835643904);
assert.equal(physicalCandidate.artifact_digest, 'sha256:ebd4629a9d1d5c693eb635227c0d94ed2246c2bcf87a891b46cb8c2d317c54f9');
assert.equal(physicalCandidate.apk_sha256, 'acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8');
assert.equal(physicalCandidate.apk_cert_sha256, '192B19F3E67ED7B69FA6862429E232B892979A6C8C97800845F6A1D1948FF79A');
assert.equal(physicalCandidate.physical_release_candidate, true);
assert.equal(physicalCandidate.candidate_status, 'active_exact_head');
assert.equal(physicalCandidate.replacement_required, false);
assert.equal(physicalCandidate.physical_evidence, 'NOT_TESTED');

assert.match(privacyDraft, /Privacidad de TuTop — borrador beta/);
assert.match(privacyDraft, /No es una política legal aprobada para publicación/);
assert.match(privacyDraft, /Build121/);
assert.match(privacyDraft, /artifact 10835643904/);
assert.doesNotMatch(privacyDraft, /Build120|Candidate120/i);
assert.doesNotMatch(privacyDraft, /Hosting todavía no se ha desplegado/i);
assert.match(privacyDraft, /disponibilidad pública fue comprobada externamente/i);
assert.match(privacyDraft, /Firebase AI/);
assert.match(privacyDraft, /delete-account\.html/);
assert.match(privacyDraft, /plazos, bases jurídicas, excepciones de retención y aprobación final siguen pendientes/i);
assert.match(deletionResource, /Solicitar eliminación de mi cuenta TuTop/);
assert.match(deletionResource, /El navegador no puede marcarla como completada ni borrar directamente la cuenta de Firebase Authentication/);
assert.match(deletionResource, /política final de retención aplicable/);
assert.match(retentionMatrix, /PENDIENTE LEGAL/);
assert.match(legalRetentionDossier, /PENDIENTE REVISIÓN LEGAL/);
assert.match(legalRetentionDossier, /no fija plazos, bases legales, jurisdicción ni excepciones/i);
assert.match(legalRetentionDossier, /Spark \/ USD 0/);
assert.match(legalRetentionDossier, /Gemini Developer API habilitada/);
assert.match(legalRetentionDossier, /AI Monitoring observado: \*\*desactivado\*\*/);
assert.match(legalRetentionDossier, /Recurso externo de eliminación/i);
assert.match(topiPrivacy, /TopiPrivacyRedaction = 'email' \| 'phone' \| 'otp' \| 'token'/);
assert.doesNotMatch(topiPrivacy, /TopiPrivacyRedaction[^\n]*address/i);

for (const template of [fcmPhysicalTemplate.candidate, {
  artifact_id: appCheckPhysicalTemplate.candidate_artifact_id,
  artifact_url: appCheckPhysicalTemplate.candidate_artifact_url,
  artifact_digest: appCheckPhysicalTemplate.candidate_artifact_digest,
  build_run_id: appCheckPhysicalTemplate.candidate_build_run_id,
  build_commit_sha: appCheckPhysicalTemplate.candidate_build_commit_sha,
  build_tree_sha: appCheckPhysicalTemplate.candidate_build_tree_sha,
  apk_sha256: appCheckPhysicalTemplate.candidate_apk_sha256,
  apk_cert_sha256: appCheckPhysicalTemplate.candidate_apk_cert_sha256,
}]) {
  assert.equal(template.artifact_id, physicalCandidate.artifact_id);
  assert.equal(template.artifact_url, physicalCandidate.artifact_url);
  assert.equal(template.artifact_digest, physicalCandidate.artifact_digest);
  assert.equal(template.build_run_id, physicalCandidate.build_run_id);
  assert.equal(template.build_commit_sha, physicalCandidate.build_commit_sha);
  assert.equal(template.build_tree_sha, physicalCandidate.build_tree_sha);
  assert.equal(template.apk_sha256, physicalCandidate.apk_sha256);
  assert.equal(template.apk_cert_sha256, physicalCandidate.apk_cert_sha256);
}
assert.equal(fcmPhysicalTemplate.two_device_required, true);
assert.equal(fcmPhysicalTemplate.account_switch_isolation_required, true);
assert.equal(appCheckPhysicalTemplate.android_version_code, physicalCandidate.android_version_code);
assert.equal(appCheckPhysicalTemplate.status, 'pending_human');
assert.equal(appCheckPhysicalTemplate.app_check_token_observed, false);

assert.match(workflow, /feat\/tutop-0\.9\.2-hardening/);
assert.match(workflow, /TUTOP_BETA_VERSION: 0\.9\.2-beta\.0/);
assert.match(workflow, /TUTOP_ANDROID_VERSION_CODE: 90200/);
const hostedRunners = workflow.match(/runs-on: ubuntu-24\.04/g) || [];
assert.equal(hostedRunners.length, 3, 'full-quality main, independent verification and prerelease must use fresh standard hosted runners');
assert.doesNotMatch(workflow, /tutop-zero-cost-worker|tutop-zero-cost-controller/);
assert.match(workflow, /AUTH_MODE="firebase_cli_refresh_token"/);
assert.match(workflow, /echo "TUTOP_FIREBASE_AUTH_MODE=\$AUTH_MODE"/);
for (const required of [
  'npm run check',
  'npm run typecheck',
  'npm run firebase:deploy:staging',
  'node scripts/staging-index-readiness-smoke.mjs',
  'npm run v2:catalog:seed',
  'node scripts/staging-topi-ai-runtime-smoke.mjs',
  'node scripts/staging-v2-e2e-smoke.mjs',
  'npm run build',
  'npm run deps:mobile',
  'npm run android:bootstrap',
  'lintDebug testDebugUnitTest assembleDebug',
  'Independent APK hash and provenance verification',
  'Publish verified 0.9.2 private prerelease',
]) assert(workflow.includes(required), `0.9.2 workflow missing ${required}`);
assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
assert.match(workflow, /TuTop-0\.9\.2-beta\.0-physical-qa-staging\.apk/);
assert.match(workflow, /PHYSICAL_QA_CANDIDATE_0\.9\.2\.generated\.json/);
assert.match(workflow, /--prerelease/);

// The exact-SHA full-quality line no longer depends on Víctor's laptop. The
// repository is public, so standard GitHub-hosted runners preserve zero-spend
// while each job receives a fresh VM. A legacy firebase login:ci refresh token
// is accepted only through the pinned Firebase CLI installed-app OAuth client;
// explicit managed OAuth credentials still take precedence.
assert.match(firebaseCiAuth, /FIREBASE_CLI_OAUTH_CLIENT_ID/);
assert.match(firebaseCiAuth, /FIREBASE_CLI_OAUTH_CLIENT_SECRET/);
assert.match(firebaseCiAuth, /managedClientId \|\| FIREBASE_CLI_OAUTH_CLIENT_ID/);
assert.match(firebaseCiAuth, /managedClientSecret \|\| FIREBASE_CLI_OAUTH_CLIENT_SECRET/);
assert.match(firebaseCiAuth, /FIREBASE_CI_OAUTH_CLIENT_CREDENTIALS_PARTIAL/);
assert.doesNotMatch(firebaseCiAuth, /console\.log\([^\n]*(?:access_token|refreshToken|clientSecret)/);

// Keep the smaller hosted staging helper manual-only; the authoritative full
// quality line now contains the equivalent real-staging battery itself.
assert.match(hostedStagingWorkflow, /workflow_dispatch:/);
assert.doesNotMatch(hostedStagingWorkflow, /\n\s+push:/);
assert.match(hostedStagingWorkflow, /runs-on: ubuntu-24\.04/);

// Regression for build-91: before Android assembly, staging preparation must
// prove an app-like new account can publish immediately and then wipe old beta
// users/data exactly once. This runs in the authoritative exact-SHA pipeline.
assert.match(prepareAndroid, /staging-app-registration-smoke\.mjs/);
assert.match(prepareAndroid, /reset-staging-accounts\.mjs/);
assert.match(prepareAndroid, /DELETE_ALL_BETA_ACCOUNTS/);
assert.match(registrationSmoke, /buildV2InitialAccountDocuments/);
assert.match(registrationSmoke, /institution_id/);
assert.match(registrationSmoke, /campus_id/);
assert.match(registrationSmoke, /PlayStation 5 registro smoke/);
assert.match(onboarding, /installV2AtomicRegistrationBridge/);
assert.match(onboarding, /client\.commit/);
assert.match(onboarding, /V2_REGISTRATION_IDENTITY_RECHECK_FAILED/);

assert.match(nativeDevice, /camera\.takePhoto/);
assert.match(nativeDevice, /camera\.chooseFromGallery/);
assert.match(nativeDevice, /filesystem\.readFile/);
assert.match(nativeDevice, /enableLocationFallback: true/);
assert.doesNotMatch(nativeDevice, /enableLocationManagerFallback/);
assert.match(nativeDevice, /enableHighAccuracy: false/);
assert.match(nativeDevice, /permissions: \['coarseLocation'\]/);

assert.match(nativeAI, /gemini-3\.8-flash/);
assert.match(nativeAI, /gemini-3\.5-flash-lite/);
assert.match(nativeAI, /isPrivatePhysicalQaBuild/);
assert.match(appCheck, /play-integrity/);
assert.doesNotMatch(appCheck, /debugToken:\s*['"][A-Za-z0-9_-]{12,}['"]/);

assert.equal(resetConfig.approved, true);
assert.equal(resetConfig.project_id, 'tutop-beta-vicmdlb-1356585881');
assert.match(resetConfig.reset_id, /^staging-reset-/);
assert.match(resetScript, /EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881'/);
assert.match(resetScript, /DELETE_ALL_BETA_ACCOUNTS/);
assert.match(resetScript, /adminListAuthUsers/);
assert.match(resetScript, /adminDeleteTestUsers/);
assert.match(resetScript, /const CHAT_SUBCOLLECTIONS = \['messages', 'confirmations', 'reads'\]/);
assert.match(resetScript, /adminListCollectionGroupDocuments\(subcollection\)/);
assert.match(resetScript, /STAGING_RESET_CHAT_COLLECTION_GROUP_NOT_EMPTY/);
assert.match(resetScript, /collection-groups messages\/confirmations\/reads=0/);
assert.match(stagingAdmin, /adminListCollectionGroupDocuments/);
assert.match(stagingAdmin, /allDescendants: true/);
assert.match(resetScript, /institutions/);
assert.match(resetScript, /approved_meeting_points/);
assert.match(resetScript, /audit_log/);
assert.match(resetScript, /moderation_cases/);

assert.match(generator, /gateCommitSha !== headSha/);
assert.match(generator, /stagingSmokeCommitSha !== headSha/);
assert.match(generator, /tutop-beta-vicmdlb-1356585881/);
assert.match(verifier, /build_commit_sha/);
assert.match(verifier, /gate_commit_sha/);
assert.match(verifier, /staging_smoke_commit_sha/);

console.log('✅ Build121 Data Safety engineering preflight: exact candidate identity + draft privacy/deletion surfaces + legal-retention placeholders + FCM/App Check provenance PASS');
console.log('✅ TuTop 0.9.2 release contract: exact-SHA hosted full-quality + Firebase-token fallback + app-like registration/publication proof + orphan-safe wipe + Capacitor 8 native APIs PASS');
