import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');
const manifest = JSON.parse(read('docs/RUNTIME_FREEZE_CANDIDATE_0.9.json'));
const dossier = read('docs/GATE_EXECUTION_DOSSIER_0.9.md');
const trusted = read('.github/workflows/v2-trusted-maintenance.yml');
const quality = read('.github/workflows/quality.yml');
const firestore = read('.github/workflows/firestore-v2-security.yml');
const ciAuth = read('.github/workflows/ci-auth-parallel-validation.yml');
const oneShot = read('.github/workflows/one-shot-085-hardened.yml');
const provision = read('.github/workflows/provision-firebase-staging-v2.yml');
const trustedWrapper = read('scripts/gated-trusted-staging-apply.mjs');
const guard = read('scripts/staging-freeze-guard.mjs');

const ACTIVE_BRANCH = 'feat/tutop-0.9.1-nearby-topi';

function assertManualOnly(name, workflow) {
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m, `${name} must keep workflow_dispatch`);
  assert.doesNotMatch(workflow, /^\s+push:/m, `${name} must not run on push`);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m, `${name} must not run on pull_request`);
  assert.doesNotMatch(workflow, /^\s+schedule:/m, `${name} must not run on schedule`);
}

for (const [name, workflow] of [
  ['quality', quality],
  ['firestore-v2-security', firestore],
  ['ci-auth-parallel-validation', ciAuth],
  ['v2-trusted-maintenance', trusted],
]) assertManualOnly(name, workflow);

const activeBranchGuard = `if: github.ref_name == '${ACTIVE_BRANCH}'`;
for (const [name, workflow] of [
  ['quality', quality],
  ['firestore-v2-security', firestore],
  ['ci-auth-parallel-validation', ciAuth],
  ['v2-trusted-maintenance', trusted],
]) {
  assert.equal((workflow.match(new RegExp(activeBranchGuard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1,
    `${name} must be blocked outside the exact 0.9.1 feature branch`);
}
assert.equal((ciAuth.match(/runs-on: ubuntu-latest/g) || []).length, 1, 'CI auth diagnostics must stay on one runner');

for (const [name, workflow] of [
  ['quality', quality],
  ['firestore-v2-security', firestore],
  ['ci-auth-parallel-validation', ciAuth],
]) {
  assert.doesNotMatch(workflow, /firebase:deploy:staging|--apply|projects:create|firestore:databases:create|v2:catalog:seed|gh release create/, `${name} must remain diagnostic-only`);
  assert.doesNotMatch(workflow, /upload-artifact/, `${name} must not publish diagnostic artifacts`);
}

assert.equal(manifest.secondary_workflow_policy.trusted_staging_mutation.requires_october_same_sha_green, true);
assert.equal(manifest.secondary_workflow_policy.trusted_staging_mutation.requires_staging_same_sha_green, true);
assert.match(trusted, /actions: read/);
assert.match(trusted, /if: github\.ref_name == 'feat\/tutop-0\.9\.1-nearby-topi'/);
assert.match(trusted, /october-01-validation\.yml\/runs/);
assert.match(trusted, /staging-v2-smoke\.yml\/runs/);
assert.equal((trusted.match(/head_sha="\$GITHUB_SHA"/g) || []).length >= 2, true);
assert.match(trusted, /TUTOP_VALIDATED_GATE_RUN_ID=\$GATE_RUN_ID/);
assert.match(trusted, /TUTOP_VALIDATED_GATE_SHA=\$GITHUB_SHA/);
assert.match(trusted, /TUTOP_VALIDATED_STAGING_RUN_ID=\$STAGING_RUN_ID/);
assert.match(trusted, /TUTOP_VALIDATED_STAGING_SHA=\$GITHUB_SHA/);
assert.match(trusted, /node scripts\/gated-trusted-staging-apply\.mjs reconcile/);
assert.match(trusted, /node scripts\/gated-trusted-staging-apply\.mjs maintenance/);
assert.match(trusted, /node scripts\/gated-trusted-staging-apply\.mjs observability/);
assert.doesNotMatch(trusted, /node scripts\/reconcile-v2-reservations\.mjs --apply/);
assert.doesNotMatch(trusted, /node scripts\/v2-trusted-maintenance-guarded\.mjs --apply/);
assert.doesNotMatch(trusted, /node scripts\/v2-observability-snapshot\.mjs --apply/);

assert.match(trustedWrapper, /assertStagingFreezeContext\(\{ requireStagingGate: true \}\)/);
assert.match(trustedWrapper, /reconcile-v2-reservations\.mjs', '--apply'/);
assert.match(trustedWrapper, /v2-trusted-maintenance-guarded\.mjs', '--apply'/);
assert.match(trustedWrapper, /v2-observability-snapshot\.mjs', '--apply'/);
assert.match(guard, /TUTOP_VALIDATED_GATE_SHA/);
assert.match(guard, /TUTOP_VALIDATED_STAGING_SHA/);
assert.match(guard, /stagingSha !== githubSha/);
assert.match(guard, /TUTOP_V2_FREEZE_BRANCH = 'feat\/tutop-0\.9\.1-nearby-topi'/);

const trustedGate = trusted.indexOf('Require same-SHA green October and staging before trusted mutation');
const firstTrustedMutation = trusted.indexOf('Expire reservations and repair completed listings');
assert(trustedGate >= 0 && firstTrustedMutation > trustedGate, 'October + staging gate must precede any trusted staging mutation');

// Historical self-trigger workflows stay quarantined on their old 0.8 branch and are never migrated.
const quarantine = manifest.secondary_workflow_policy.quarantined_self_trigger_workflows;
assert.deepEqual(quarantine, ['one-shot-085-hardened.yml', 'provision-firebase-staging-v2.yml']);
assert.match(String(manifest.secondary_workflow_policy.quarantine_rule), /Do not edit, dispatch, or use/i);
assert.match(oneShot, /^on:\s*\n\s+push:/m);
assert.match(oneShot, /branches: \["feat\/tutop-0\.8-p0"\]/);
assert.match(oneShot, /- "\.github\/workflows\/one-shot-085-hardened\.yml"/);
assert.doesNotMatch(oneShot, /^\s+schedule:/m);
assert.doesNotMatch(oneShot, /^\s+pull_request:/m);
assert.match(provision, /^on:\s*\n\s+push:/m);
assert.match(provision, /branches: \["feat\/tutop-0\.8-p0"\]/);
assert.match(provision, /- "\.github\/workflows\/provision-firebase-staging-v2\.yml"/);
assert.match(provision, /workflow_dispatch:/);
assert.doesNotMatch(provision, /^\s+schedule:/m);
assert.doesNotMatch(provision, /^\s+pull_request:/m);

const dossierPlain = dossier.replace(/[*_`]/g, '');
assert.match(dossierPlain, /no editar ni ejecutar one-shot-085-hardened\.yml ni provision-firebase-staging-v2\.yml/);
assert.match(dossierPlain, /trusted maintenance sólo puede mutar staging después de October \+ staging green sobre el mismo SHA/i);

console.log('PASS active diagnostic workflows are manual-only and bound to TuTop 0.9.1');
console.log('PASS CI auth diagnostics stay consolidated on one runner');
console.log('PASS diagnostic workflows do not publish artifacts or releases');
console.log('PASS trusted maintenance requires October + staging same-SHA evidence');
console.log('PASS historical self-trigger workflows remain quarantined on 0.8 and were not migrated');
console.log('Secondary workflow runtime-freeze contract: PASS');
