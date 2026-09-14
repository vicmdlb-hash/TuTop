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
const nativeDevice = read('src/services/nativeDeviceCapabilities.ts');
const nativeAI = read('src/services/nativeTopiAI.ts');
const appCheck = read('src/services/nativeAppCheckToken.ts');
const onboarding = read('src/services/v2OnboardingRecovery.ts');
const prepareAndroid = read('scripts/prepare-staging-android-app.mjs');
const registrationSmoke = read('scripts/staging-app-registration-smoke.mjs');
const generator = read('scripts/generate-physical-qa-candidate.mjs');
const verifier = read('scripts/verify-generated-physical-qa-candidate.mjs');

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

assert.match(workflow, /feat\/tutop-0\.9\.2-hardening/);
assert.match(workflow, /TUTOP_BETA_VERSION: 0\.9\.2-beta\.0/);
assert.match(workflow, /TUTOP_ANDROID_VERSION_CODE: 90200/);
assert.match(workflow, /runs-on: \[self-hosted, linux, x64, tutop-zero-cost-worker\]/);
assert.match(workflow, /runs-on: \[self-hosted, linux, x64, tutop-zero-cost-controller\]/);
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

// The GitHub-hosted real-staging helper cannot use the local ADC credential that
// owns the authoritative 0.9.2 path. Keep it available for explicit diagnostics,
// but do not create a predictable red status/email on every push.
assert.match(hostedStagingWorkflow, /workflow_dispatch:/);
assert.doesNotMatch(hostedStagingWorkflow, /\n\s+push:/);
assert.match(hostedStagingWorkflow, /runs-on: ubuntu-24\.04/);

// Regression for build-91: before Android assembly, staging preparation must
// prove an app-like new account can publish immediately and then wipe old beta
// users/data exactly once. This runs in the authoritative self-hosted pipeline.
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

console.log('✅ TuTop 0.9.2 release contract: exact-SHA candidate + app-like registration/publication proof + orphan-safe chat-state wipe + Capacitor 8 native APIs + one-shot staging reset PASS');
