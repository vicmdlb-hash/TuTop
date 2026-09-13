import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const project = JSON.parse(read('config/project.json'));
const env = read('.env.example');
const workflow = read('.github/workflows/092-release-candidate-v2.yml');
const theme = read('src/lib/theme091.ts');
const appCheck = read('src/services/nativeAppCheckToken.ts');
const nativeSecurity = read('src/services/nativeFirebaseSecurity.ts');
const nativeDevice = read('src/services/nativeDeviceCapabilities.ts');
const nativeCapabilities = read('scripts/android-native-capabilities.mjs');
const topi = read('src/services/assistantProvider.ts');
const publish = read('src/components/NationalPublishScreen.tsx');
const support = read('src/components/TopiSupportAssistant.tsx');
const nearby = read('src/lib/nearbyMarketplace.ts');
const generator = read('scripts/generate-physical-qa-candidate.mjs');
const verifier = read('scripts/verify-generated-physical-qa-candidate.mjs');

// One coherent release identity. 0.9.2 is a real milestone, not a chain of
// microversions hidden behind 0.9.1.x.
assert.equal(pkg.version, '0.9.2-beta.0');
assert.equal(lock.version, '0.9.2-beta.0');
assert.equal(lock.packages?.['']?.version, '0.9.2-beta.0');
assert.equal(project.currentBetaVersion, '0.9.2-beta.0');
assert.equal(project.applicationId, 'mx.tutop.app');
assert.equal(project.zeroInvestmentMode, true);
assert.equal(project.billingAllowed, false);
assert.equal(project.productionPublishingAllowed, false);
assert.match(env, /VITE_TUTOP_APP_VERSION=0\.9\.2-beta\.0/);
assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
assert.equal(pkg.scripts.build, 'npm run typecheck && vite build');

// Canonical 0.9.2 pipeline: full static regression -> real staging -> Android
// lint/tests/build -> immutable artifact -> independent verification -> private prerelease.
assert.match(workflow, /feat\/tutop-0\.9\.2-hardening/);
assert.match(workflow, /TUTOP_BETA_VERSION: 0\.9\.2-beta\.0/);
assert.match(workflow, /TUTOP_ANDROID_VERSION_CODE: 90200/);
assert.match(workflow, /TuTop-0\.9\.2-beta\.0-physical-qa-staging\.apk/);
assert.match(workflow, /PHYSICAL_QA_CANDIDATE_0\.9\.2\.generated\.json/);
assert.match(workflow, /runs-on: \[self-hosted, linux, x64, tutop-zero-cost-worker\]/);
assert.match(workflow, /runs-on: \[self-hosted, linux, x64, tutop-zero-cost-controller\]/);
for (const required of [
  'npm run check',
  'npm run typecheck',
  'npm run firebase:deploy:staging',
  'node scripts/staging-index-readiness-smoke.mjs',
  'npm run v2:catalog:seed',
  'node scripts/deploy-firebase-auth-staging.mjs',
  'node scripts/staging-topi-ai-runtime-smoke.mjs',
  'node scripts/staging-v2-e2e-smoke.mjs',
  'node scripts/staging-account-erasure-smoke.mjs',
  'npm run build',
  'npm run deps:mobile',
  'npm run android:bootstrap',
  'lintDebug testDebugUnitTest assembleDebug',
  'actions/upload-artifact@v7',
  'Independent APK hash and provenance verification',
  'Publish verified 0.9.2 private prerelease',
]) assert(workflow.includes(required), `0.9.2 workflow missing ${required}`);
assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
assert.match(workflow, /head_sha=\$\{GITHUB_SHA\}/);
assert.match(workflow, /gate_run_id=\$\{TUTOP_VALIDATED_GATE_RUN_ID\}/);
assert.match(workflow, /staging_smoke_run_id=\$\{TUTOP_VALIDATED_STAGING_RUN_ID\}/);
assert.match(workflow, /EXPECTED="\$\(awk '\{print \$1; exit\}' "\$HASH"\)"/);
assert.match(workflow, /ACTUAL="\$\(sha256sum "\$APK" \| awk '\{print \$1\}'\)"/);
assert.match(workflow, /test "\$EXPECTED" = "\$ACTUAL"/);
assert.match(workflow, /tutop-0\.9\.2-beta\.0-physical-qa-/);
assert.match(workflow, /--prerelease/);

// Private sideload QA may temporarily leave App Check unenforced, but only as
// an explicit 0.9.2 staging exception. No production or provider secret is implied.
assert.match(workflow, /TUTOP_AI_APP_CHECK_REQUIRED: "false"/);
assert.equal((workflow.match(/TUTOP_APP_CHECK_MODE: UNENFORCED/g) || []).length >= 2, true);
assert.equal((workflow.match(/TUTOP_APP_CHECK_AI_MODE: UNENFORCED/g) || []).length >= 2, true);
assert.match(workflow, /firebase_project=tutop-beta-vicmdlb-1356585881/);
assert.match(workflow, /ai_app_check_required=false/);
assert.match(workflow, /not production\/Play-ready/i);

// 0.9.2 UX / native safety invariants.
assert.match(theme, /return value === 'dark' \|\| value === 'system' \|\| value === 'light' \? value : 'dark'/);
assert.match(theme, /return 'dark'/);
assert.match(nativeSecurity, /0\.9\.2-beta\.0/);
assert.match(appCheck, /environment === 'staging'/);
assert.match(appCheck, /\^0\\\.9\\\.\(\?:1\|2\\)-beta\\\./);
assert.match(appCheck, /debugToken: useStagingDebugProvider\(\)/);
assert.doesNotMatch(appCheck, /debugToken:\s*['"][A-Za-z0-9_-]{12,}['"]/);
assert.match(nativeDevice, /permissions: \['coarseLocation'\]/);
assert.match(nativeDevice, /enableHighAccuracy: false/);
assert.match(nativeDevice, /camera\.takePhoto/);
assert.match(nativeDevice, /camera\.chooseFromGallery/);
assert.match(nativeDevice, /camera\.getPhoto/);
assert.match(nativeDevice, /saveToGallery: false/);
const permissionBlock = nativeCapabilities.match(/const permissions = \[([\s\S]*?)\];/)?.[1] || '';
assert.match(permissionBlock, /ACCESS_COARSE_LOCATION/);
assert.match(permissionBlock, /RECORD_AUDIO/);
assert.doesNotMatch(permissionBlock, /ACCESS_FINE_LOCATION/);
assert.doesNotMatch(permissionBlock, /ACCESS_BACKGROUND_LOCATION/);
assert.doesNotMatch(permissionBlock, /android\.permission\.CAMERA/);
assert.match(nearby, /Math\.round\(value \* 100\) \/ 100/);

// Topi must distinguish real model output from connected endpoint and local
// deterministic fallback without leaking provider credentials.
assert.match(topi, /generateNativeTopiText/);
assert.match(topi, /askNativeFirebaseTopi/);
assert.match(topi, /provider: TopiProvider/);
assert.match(topi, /sanitizeRemoteResult/);
assert.match(topi, /safeDraftForRemote/);
assert.match(topi, /return remote \|\| localTopi/);
assert.doesNotMatch(topi, /authorization['"]?\s*:/i);
assert.match(publish, /result\.provider === 'firebase-ai-logic'/);
assert.match(publish, /result\.provider === 'private-endpoint'/);
assert.match(publish, /Topi IA real \(Firebase AI\)/);
assert.match(publish, /Topi usó el asistente local, no una IA remota/);
assert.match(publish, /takeNativePhoto\(\)/);
assert.match(publish, /pickNativePhoto\(\)/);
assert.match(publish, /refreshLocation/);
assert.match(support, /Pregúntale a Topi/);
assert.match(support, /Tu amigo para resolver dudas y usar TuTop/);
assert.match(support, /Firebase AI real/);
assert.match(support, /Guía local/);

// Candidate generation is exact-head, same-SHA and version-aware for 0.9.2.
assert.match(generator, /\^0\\\.9\\\.\(1\|2\)-beta\\\.\\d\+\$/);
assert.match(generator, /PHYSICAL_QA_CANDIDATE_0\.9\.\$\{minor\}\.generated\.json/);
assert.match(generator, /gateCommitSha !== headSha/);
assert.match(generator, /stagingSmokeCommitSha !== headSha/);
assert.match(generator, /tutop-beta-vicmdlb-1356585881/);
assert.match(verifier, /build_commit_sha/);
assert.match(verifier, /gate_commit_sha/);
assert.match(verifier, /staging_smoke_commit_sha/);

console.log('✅ TuTop 0.9.2 canonical release identity / UX / native / Topi / exact-SHA Physical QA contract PASS');
