import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');
const guard = read('scripts/staging-freeze-guard.mjs');
const deployRules = read('scripts/deploy-firebase-staging.mjs');
const deployAuth = read('scripts/deploy-firebase-auth-staging.mjs');
const prepareWeb = read('scripts/prepare-staging-v2-auth.mjs');
const prepareAndroid = read('scripts/prepare-staging-android-app.mjs');
const admin = read('scripts/staging-v2-admin.mjs');
const appCheck = read('scripts/configure-app-check-staging.mjs');
const accountErasure = read('scripts/process-account-erasure.mjs');
const seed = read('scripts/seed-v2-catalog.mjs');
const reconcile = read('scripts/reconcile-v2-reservations.mjs');
const maintenance = read('scripts/v2-trusted-maintenance.mjs');
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
assert.match(guard, /\['OFF', 'UNENFORCED'\]/);
assert.match(guard, /app_check_enforcement_forbidden_during_runtime_freeze/);

for (const [name, source] of [
  ['rules deploy', deployRules],
  ['auth deploy', deployAuth],
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
assert.match(releaseInternal, /zeroInvestmentMode === true/);
assert.match(releaseInternal, /billingAllowed !== true/);
assert.match(releaseInternal, /productionPublishingAllowed !== true/);
assert.match(uploadInternal, /zeroInvestmentMode === true/);
assert.match(uploadInternal, /billingAllowed !== true/);
assert.match(uploadInternal, /productionPublishingAllowed !== true/);

assert.equal(packageJson.scripts['firebase:deploy:spark'], 'node scripts/freeze-blocked-command.mjs firebase:deploy:spark');
assert.doesNotMatch(packageJson.scripts['firebase:deploy:spark'], /^firebase deploy/);
assert.match(packageJson.scripts['firebase:emulators:spark'], /firebase emulators:start/);

assert.match(accountErasure, /const REQUIRED = 'tutop-beta-vicmdlb-1356585881'/);
assert.match(accountErasure, /TUTOP_ALLOW_ACCOUNT_ERASURE !== 'staging-reviewed'/);
assert.match(accountErasure, /active_marketplace_transaction/);

// Large internal apply scripts remain implementation details. They retain explicit apply guards;
// promotion authority lives only in the exact-SHA workflows, not in direct local invocation.
assert.match(seed, /process\.argv\.includes\('--apply'\)/);
assert.match(seed, /TUTOP_ALLOW_V2_SEED/);
assert.match(reconcile, /process\.argv\.includes\('--apply'\)/);
assert.match(reconcile, /TUTOP_ALLOW_V2_RECONCILE/);
assert.match(maintenance, /process\.argv\.includes\('--apply'\)/);
assert.match(maintenance, /TUTOP_ALLOW_V2_MAINTENANCE/);

console.log('PASS remote staging entrypoints require exact project, branch, GitHub Actions and October SHA binding');
console.log('PASS App Check ENFORCED is physically unavailable during Runtime Freeze Candidate');
console.log('PASS Google Play/Internal App Sharing remains blocked by zero-investment project policy');
console.log('PASS ungated firebase:deploy:spark shortcut is fail-closed while local emulators remain available');
console.log('PASS destructive account erasure remains exact-staging, reviewed and transaction-aware');
console.log('Staging mutation surface contract: PASS');
