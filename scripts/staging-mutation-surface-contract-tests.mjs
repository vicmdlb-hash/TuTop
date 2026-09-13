import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');
const guard = read('scripts/staging-freeze-guard.mjs');
const rawApplyGuard = read('scripts/dangerous-script-apply-guard.mjs');
const firebaseAuth = read('scripts/firebase-ci-auth.mjs');
const firebaseDoctor = read('scripts/firebase-doctor.mjs');
const externalReadiness = read('scripts/external-readiness.mjs');
const deployRules = read('scripts/deploy-firebase-staging.mjs');
const deployAuth = read('scripts/deploy-firebase-auth-staging.mjs');
const enableFirestore = read('scripts/enable-firestore-api.mjs');
const prepareWeb = read('scripts/prepare-staging-v2-auth.mjs');
const prepareAndroid = read('scripts/prepare-staging-android-app.mjs');
const admin = read('scripts/staging-v2-admin.mjs');
const stagingE2E = read('scripts/staging-v2-e2e-smoke.mjs');
const indexSmoke = read('scripts/staging-index-readiness-smoke.mjs');
const appCheck = read('scripts/configure-app-check-staging.mjs');
const accountErasure = read('scripts/process-account-erasure.mjs');
const seed = read('scripts/seed-v2-catalog.mjs');
const reconcile = read('scripts/reconcile-v2-reservations.mjs');
const maintenance = read('scripts/v2-trusted-maintenance.mjs');
const observability = read('scripts/v2-observability-snapshot.mjs');
const seedWrapper = read('scripts/gated-v2-catalog-seed.mjs');
const reconcileWrapper = read('scripts/gated-v2-reservation-reconcile.mjs');
const maintenanceWrapper = read('scripts/gated-v2-maintenance.mjs');
const trustedWrapper = read('scripts/gated-trusted-staging-apply.mjs');
const stagingWorkflow = read('.github/workflows/staging-v2-smoke.yml');
const androidWorkflow = read('.github/workflows/android-debug-apk.yml');
const trustedWorkflow = read('.github/workflows/v2-trusted-maintenance.yml');
const releaseInternal = read('scripts/release-internal.mjs');
const uploadInternal = read('scripts/upload-internal-sharing.mjs');
const packageJson = JSON.parse(read('package.json'));
const project = JSON.parse(read('config/project.json'));

assert.match(guard, /TUTOP_V2_STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881'/);
assert.match(guard, /TUTOP_V2_FREEZE_BRANCH = 'feat\/tutop-0\.9\.1-nearby-topi'/);
assert.match(guard, /process\.env\.GITHUB_ACTIONS !== 'true'/);
assert.match(guard, /invalid_or_missing_GITHUB_SHA/);
assert.match(guard, /TUTOP_VALIDATED_GATE_RUN_ID/);
assert.match(guard, /TUTOP_VALIDATED_GATE_SHA/);
assert.match(guard, /gateSha !== githubSha/);
assert.match(guard, /TUTOP_VALIDATED_STAGING_RUN_ID/);
assert.match(guard, /TUTOP_VALIDATED_STAGING_SHA/);
assert.match(guard, /stagingSha !== githubSha/);
assert.match(guard, /\['OFF', 'UNENFORCED'\]/);
assert.match(guard, /general_app_check_enforcement_forbidden_during_runtime_freeze/);
assert.match(guard, /assertAiAppCheckFreezeMode/);
assert.match(guard, /TUTOP_ALLOW_AI_APP_CHECK_ENFORCEMENT/);
assert.match(guard, /staging-ai-only/);

for (const [name, source] of [
  ['rules deploy', deployRules],
  ['auth deploy', deployAuth],
  ['firestore service enablement', enableFirestore],
  ['web app setup', prepareWeb],
  ['android app setup', prepareAndroid],
  ['staging admin', admin],
  ['app check', appCheck],
]) {
  assert.match(source, /staging-freeze-guard\.mjs/, `${name} must use central freeze guard`);
  assert.doesNotMatch(source, /TUTOP_ALLOW_PRODUCTION_FIREBASE/, `${name} must not expose a production override`);
  assert.doesNotMatch(source, /TUTOP_ALLOW_ALTERNATE_STAGING/, `${name} must not expose alternate staging override`);
  assert.doesNotMatch(source, /TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID/, `${name} must not expose nondescription override`);
}

assert.match(stagingE2E, /staging-v2-admin\.mjs/);
assert.match(stagingE2E, /const REQUIRED = 'tutop-beta-vicmdlb-1356585881'/);
assert.match(stagingE2E, /if \(projectId !== REQUIRED\) throw new Error/);
assert.doesNotMatch(stagingE2E, /TUTOP_ALLOW_ALTERNATE_STAGING/);

assert.match(indexSmoke, /staging-freeze-guard\.mjs/);
assert.match(indexSmoke, /firebase-ci-auth\.mjs/);
assert.match(indexSmoke, /documents:runQuery/);
for (const criticalField of ['evaluado_id', 'calificacion', 'fecha', 'uid', 'product_id', 'campus_id', 'institution_id', 'city_id', 'visibility_scope']) {
  assert.match(indexSmoke, new RegExp(criticalField), `index smoke must cover ${criticalField}`);
}
assert.doesNotMatch(indexSmoke, /method:\s*['"]PATCH['"]/);
assert.doesNotMatch(indexSmoke, /method:\s*['"]DELETE['"]/);
assert.doesNotMatch(indexSmoke, /adminPatchDocument|adminDeleteDocument/);

const deployStep = stagingWorkflow.indexOf('Deploy current strict V2 rules and indexes');
const indexStep = stagingWorkflow.indexOf('Wait for and verify deployed composite indexes');
const catalogStep = stagingWorkflow.indexOf('Verify canonical catalog without overwriting');
const e2eStep = stagingWorkflow.indexOf('Real two-user marketplace smoke');
assert(deployStep >= 0 && indexStep > deployStep, 'staging index readiness must run after index deployment');
assert(catalogStep > indexStep, 'catalog verification must wait for composite-index readiness');
assert(e2eStep > indexStep, 'real E2E must wait for composite-index readiness');
assert.match(stagingWorkflow, /node scripts\/staging-index-readiness-smoke\.mjs/);

assert.match(appCheck, /assertAppCheckFreezeMode/);
assert.match(appCheck, /assertAiAppCheckFreezeMode/);
assert.match(appCheck, /firebaseml\.googleapis\.com/);
assert.doesNotMatch(appCheck, /staging-v2-client-ready/);
assert.doesNotMatch(appCheck, /requireAppCheckPhysicalEvidence/);

for (const workflow of [stagingWorkflow, androidWorkflow, trustedWorkflow]) {
  assert.match(workflow, /TUTOP_VALIDATED_GATE_SHA=\$GITHUB_SHA/);
  assert.match(workflow, /head_sha="\$GITHUB_SHA"/);
  assert.match(workflow, /status=success/);
  assert.match(workflow, /event=workflow_dispatch/);
  assert.match(workflow, /TUTOP_FIREBASE_OAUTH_CLIENT_ID: \$\{\{ secrets\.FIREBASE_OAUTH_CLIENT_ID \}\}/);
  assert.match(workflow, /TUTOP_FIREBASE_OAUTH_CLIENT_SECRET: \$\{\{ secrets\.FIREBASE_OAUTH_CLIENT_SECRET \}\}/);
}
assert.match(androidWorkflow, /TUTOP_VALIDATED_STAGING_SHA=\$GITHUB_SHA/);
assert.match(trustedWorkflow, /TUTOP_VALIDATED_STAGING_SHA=\$GITHUB_SHA/);
assert.match(androidWorkflow, /staging-v2-smoke\.yml\/runs/);
assert.match(trustedWorkflow, /staging-v2-smoke\.yml\/runs/);

assert.equal(project.productionPublishingAllowed, false);
assert.equal(project.zeroInvestmentMode, true);
assert.equal(project.billingAllowed, false);
for (const source of [releaseInternal, uploadInternal]) {
  assert.match(source, /zeroInvestmentMode === true/);
  assert.match(source, /billingAllowed !== true/);
  assert.match(source, /productionPublishingAllowed !== true/);
}

assert.equal(packageJson.scripts['firebase:link'], 'node scripts/freeze-blocked-command.mjs firebase:link');
assert.doesNotMatch(packageJson.scripts['firebase:link'], /link-firebase-project\.mjs/);
assert.equal(packageJson.scripts['firebase:deploy:spark'], 'node scripts/freeze-blocked-command.mjs firebase:deploy:spark');
assert.doesNotMatch(packageJson.scripts['firebase:deploy:spark'], /^firebase deploy/);
assert.match(packageJson.scripts['firebase:emulators:spark'], /firebase emulators:start/);
assert.match(firebaseDoctor, /Runtime Freeze Candidate \/ NOT VALIDATED/);
assert.match(firebaseDoctor, /\.firebaserc no es autoridad de staging/);
assert.doesNotMatch(firebaseDoctor, /Firebase doctor Spark OK/);
assert.match(externalReadiness, /Runtime Freeze Candidate/);
assert.match(externalReadiness, /tutop-beta-vicmdlb-1356585881/);
assert.match(externalReadiness, /Managed OAuth secrets/);
assert.match(externalReadiness, /Current APK', 'BLOCKED'/);
assert.doesNotMatch(externalReadiness, /crear proyecto Spark|desplegar rules\/indexes Spark/);
assert.equal(packageJson.scripts['v2:catalog:seed'], 'node scripts/gated-v2-catalog-seed.mjs');
assert.equal(packageJson.scripts['v2:reservations:reconcile'], 'node scripts/gated-v2-reservation-reconcile.mjs');
assert.equal(packageJson.scripts['v2:maintenance'], 'node scripts/gated-v2-maintenance.mjs');
assert.doesNotMatch(packageJson.scripts['v2:catalog:seed'], /seed-v2-catalog\.mjs --apply/);
assert.doesNotMatch(packageJson.scripts['v2:reservations:reconcile'], /reconcile-v2-reservations\.mjs/);
assert.doesNotMatch(packageJson.scripts['v2:maintenance'], /v2-trusted-maintenance\.mjs/);

assert.match(seedWrapper, /assertStagingFreezeContext/);
assert.match(seedWrapper, /seed-v2-catalog\.mjs', '--apply'/);

assert.match(reconcileWrapper, /const apply = args\.includes\('--apply'\)/);
assert.match(reconcileWrapper, /assertStagingFreezeContext/);
assert.match(reconcileWrapper, /allowEnv: 'TUTOP_ALLOW_V2_RECONCILE'/);
assert.match(reconcileWrapper, /allowValue: 'staging-v2'/);
assert.match(reconcileWrapper, /requireStagingGate: true/);
assert.match(reconcileWrapper, /reconcile-v2-reservations\.mjs/);

assert.match(maintenanceWrapper, /const apply = args\.includes\('--apply'\)/);
assert.match(maintenanceWrapper, /assertStagingFreezeContext/);
assert.match(maintenanceWrapper, /allowEnv: 'TUTOP_ALLOW_V2_MAINTENANCE'/);
assert.match(maintenanceWrapper, /allowValue: 'staging-v2'/);
assert.match(maintenanceWrapper, /requireStagingGate: true/);
assert.match(maintenanceWrapper, /v2-trusted-maintenance-guarded\.mjs/);
assert.match(maintenanceWrapper, /v2-trusted-maintenance\.mjs/);

assert.match(trustedWrapper, /requireStagingGate: true/);
for (const task of ['reconcile-v2-reservations.mjs', 'v2-trusted-maintenance-guarded.mjs', 'v2-observability-snapshot.mjs']) {
  assert.match(trustedWrapper, new RegExp(task.replaceAll('.', '\\.')));
}
assert.doesNotMatch(trustedWorkflow, /node scripts\/reconcile-v2-reservations\.mjs --apply/);
assert.doesNotMatch(trustedWorkflow, /node scripts\/v2-trusted-maintenance-guarded\.mjs --apply/);
assert.doesNotMatch(trustedWorkflow, /node scripts\/v2-observability-snapshot\.mjs --apply/);

assert.match(accountErasure, /const REQUIRED = 'tutop-beta-vicmdlb-1356585881'/);
assert.match(accountErasure, /TUTOP_ALLOW_ACCOUNT_ERASURE !== 'staging-reviewed'/);
assert.match(accountErasure, /active_marketplace_transaction/);

// Raw internal mutators still keep dry-run/apply compatibility, but firebase-ci-auth
// installs an entrypoint-aware freeze guard before any token can be obtained.
assert.match(firebaseAuth, /dangerous-script-apply-guard\.mjs/);
assert.match(rawApplyGuard, /process\.argv\.includes\('--apply'\)/);
for (const [filename, allowEnv] of [
  ['seed-v2-catalog.mjs', 'TUTOP_ALLOW_V2_SEED'],
  ['reconcile-v2-reservations.mjs', 'TUTOP_ALLOW_V2_RECONCILE'],
  ['v2-trusted-maintenance.mjs', 'TUTOP_ALLOW_V2_MAINTENANCE'],
  ['v2-observability-snapshot.mjs', 'TUTOP_ALLOW_V2_OBSERVABILITY'],
]) {
  assert.match(rawApplyGuard, new RegExp(filename.replaceAll('.', '\\.')));
  assert.match(rawApplyGuard, new RegExp(allowEnv));
}
for (const source of [seed, reconcile, maintenance, observability]) {
  assert.match(source, /firebase-ci-auth\.mjs/);
  assert.match(source, /process\.argv\.includes\('--apply'\)/);
}
assert.match(rawApplyGuard, /requireStagingGate: true/);

assert.match(firebaseAuth, /TUTOP_FIREBASE_OAUTH_CLIENT_ID/);
assert.match(firebaseAuth, /TUTOP_FIREBASE_OAUTH_CLIENT_SECRET/);
assert.doesNotMatch(firebaseAuth, /const FIREBASE_OAUTH_CLIENT_ID\s*=\s*['"][^'"]+['"]/);
assert.doesNotMatch(firebaseAuth, /const FIREBASE_OAUTH_CLIENT_SECRET\s*=\s*['"][^'"]+['"]/);

console.log('PASS remote staging entrypoints require exact project, TuTop 0.9.1 branch, GitHub Actions and October SHA binding');
console.log('PASS real two-user E2E is independently pinned to the exact staging project with no alternate-project escape hatch');
console.log('PASS Firestore service enablement is covered by the same central freeze guard');
console.log('PASS staging deploy must prove real read-only composite-index readiness before catalog/E2E');
console.log('PASS review/favorites/geography index probes cannot mutate staging data');
console.log('PASS general App Check ENFORCED remains blocked while the explicit staging AI-only exception is narrowly guarded');
console.log('PASS Google Play/Internal App Sharing remains blocked by zero-investment project policy');
console.log('PASS legacy firebase:link and direct Spark deploy are blocked while local emulators remain available');
console.log('PASS Firebase doctor reports PREPARED / NOT VALIDATED and treats .firebaserc as non-authoritative');
console.log('PASS external readiness reports the V2 freeze chain and cannot regress to Spark project/deploy guidance');
console.log('PASS public npm seed/reconcile/maintenance mutation surfaces route through exact-SHA wrappers');
console.log('PASS raw seed/reconcile/maintenance/observability --apply invocations are independently guarded before CI auth');
console.log('PASS Firebase OAuth client credentials are externally managed and not embedded in repository source');
console.log('PASS public maintenance apply adds the capacity guard before trusted writes');
console.log('PASS trusted workflow apply surfaces route through October+staging exact-SHA wrapper');
console.log('PASS destructive account erasure remains exact-staging, reviewed and transaction-aware');
console.log('Staging mutation surface contract: PASS');
