import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');
const guard = read('scripts/staging-freeze-guard.mjs');
const deployRules = read('scripts/deploy-firebase-staging.mjs');
const deployAuth = read('scripts/deploy-firebase-auth-staging.mjs');
const enableFirestore = read('scripts/enable-firestore-api.mjs');
const prepareWeb = read('scripts/prepare-staging-v2-auth.mjs');
const prepareAndroid = read('scripts/prepare-staging-android-app.mjs');
const admin = read('scripts/staging-v2-admin.mjs');
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
assert.match(guard, /TUTOP_V2_FREEZE_BRANCH = 'feat\/tutop-0\.8-p0'/);
assert.match(guard, /process\.env\.GITHUB_ACTIONS !== 'true'/);
assert.match(guard, /invalid_or_missing_GITHUB_SHA/);
assert.match(guard, /TUTOP_VALIDATED_GATE_RUN_ID/);
assert.match(guard, /TUTOP_VALIDATED_GATE_SHA/);
assert.match(guard, /gateSha !== githubSha/);
assert.match(guard, /TUTOP_VALIDATED_STAGING_RUN_ID/);
assert.match(guard, /TUTOP_VALIDATED_STAGING_SHA/);
assert.match(guard, /stagingSha !== githubSha/);
assert.match(guard, /\['OFF', 'UNENFORCED'\]/);
assert.match(guard, /app_check_enforcement_forbidden_during_runtime_freeze/);

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

assert.match(appCheck, /assertAppCheckFreezeMode/);
assert.doesNotMatch(appCheck, /staging-v2-client-ready/);
assert.doesNotMatch(appCheck, /requireAppCheckPhysicalEvidence/);

for (const workflow of [stagingWorkflow, androidWorkflow, trustedWorkflow]) {
  assert.match(workflow, /TUTOP_VALIDATED_GATE_SHA=\$GITHUB_SHA/);
  assert.match(workflow, /head_sha="\$GITHUB_SHA"/);
  assert.match(workflow, /status=success/);
  assert.match(workflow, /event=workflow_dispatch/);
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

assert.equal(packageJson.scripts['firebase:deploy:spark'], 'node scripts/freeze-blocked-command.mjs firebase:deploy:spark');
assert.doesNotMatch(packageJson.scripts['firebase:deploy:spark'], /^firebase deploy/);
assert.match(packageJson.scripts['firebase:emulators:spark'], /firebase emulators:start/);
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

// Internal implementations keep their own apply switches for compatibility and dry-run tooling.
// Supported npm/workflow mutation surfaces must never route to them directly.
assert.match(seed, /process\.argv\.includes\('--apply'\)/);
assert.match(seed, /TUTOP_ALLOW_V2_SEED/);
assert.match(reconcile, /process\.argv\.includes\('--apply'\)/);
assert.match(reconcile, /TUTOP_ALLOW_V2_RECONCILE/);
assert.match(maintenance, /process\.argv\.includes\('--apply'\)/);
assert.match(maintenance, /TUTOP_ALLOW_V2_MAINTENANCE/);
assert.match(observability, /process\.argv\.includes\('--apply'\)/);
assert.match(observability, /TUTOP_ALLOW_V2_OBSERVABILITY/);

console.log('PASS remote staging entrypoints require exact project, branch, GitHub Actions and October SHA binding');
console.log('PASS Firestore service enablement is covered by the same central freeze guard');
console.log('PASS App Check ENFORCED is physically unavailable during Runtime Freeze Candidate');
console.log('PASS Google Play/Internal App Sharing remains blocked by zero-investment project policy');
console.log('PASS direct Spark deploy is blocked while local emulators remain available');
console.log('PASS public npm seed/reconcile/maintenance mutation surfaces route through exact-SHA wrappers');
console.log('PASS public maintenance apply adds the capacity guard before trusted writes');
console.log('PASS trusted workflow apply surfaces route through October+staging exact-SHA wrapper');
console.log('PASS destructive account erasure remains exact-staging, reviewed and transaction-aware');
console.log('Staging mutation surface contract: PASS');
