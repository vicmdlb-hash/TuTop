import fs from 'node:fs';
import assert from 'node:assert/strict';

const manifest = JSON.parse(fs.readFileSync('docs/RUNTIME_FREEZE_CANDIDATE_0.9.json', 'utf8'));
const trusted = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const quality = fs.readFileSync('.github/workflows/quality.yml', 'utf8');
const firestore = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');
const ciAuth = fs.readFileSync('.github/workflows/ci-auth-parallel-validation.yml', 'utf8');
const oneShot = fs.readFileSync('.github/workflows/one-shot-085-hardened.yml', 'utf8');
const provision = fs.readFileSync('.github/workflows/provision-firebase-staging-v2.yml', 'utf8');

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

// Diagnostics may consume minutes only by explicit dispatch and must not mutate Firebase staging.
for (const [name, workflow] of [
  ['quality', quality],
  ['firestore-v2-security', firestore],
  ['ci-auth-parallel-validation', ciAuth],
]) {
  assert.doesNotMatch(workflow, /firebase:deploy:staging|--apply|projects:create|firestore:databases:create|v2:catalog:seed|gh release create/, `${name} must remain diagnostic-only`);
}

// Trusted maintenance is an intentional staging mutation, but only after October passes on the exact SHA.
assert.match(trusted, /actions: read/);
assert.match(trusted, /if: github\.ref_name == 'feat\/tutop-0\.8-p0'/);
assert.match(trusted, /october-01-validation\.yml\/runs/);
assert.match(trusted, /head_sha="\$GITHUB_SHA"/);
assert.match(trusted, /status=success/);
assert.match(trusted, /event=workflow_dispatch/);
assert.match(trusted, /DETENIDO: trusted maintenance requiere october-01-validation exitoso sobre el mismo SHA/);
const trustedGate = trusted.indexOf('Require same-SHA green October gate before trusted mutation');
const firstTrustedMutation = trusted.indexOf('Expire reservations and repair completed listings');
assert(trustedGate >= 0 && firstTrustedMutation > trustedGate, 'trusted October gate must precede any staging mutation');

const quarantine = manifest?.secondary_workflow_policy?.quarantined_self_trigger_workflows || [];
assert.deepEqual(quarantine, ['one-shot-085-hardened.yml', 'provision-firebase-staging-v2.yml']);
assert.match(String(manifest?.secondary_workflow_policy?.quarantine_rule || ''), /Do not edit, dispatch, or use/i);

// Historical workflows remain untouched because editing their own files can trigger Actions.
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

for (const workflow of ['one-shot-085-hardened.yml', 'provision-firebase-staging-v2.yml']) {
  assert(!manifest.required_promotion_sequence.some((step) => step.includes(workflow)), `${workflow} must not be a promotion authority`);
}

console.log('PASS diagnostic secondary workflows are manual-only and non-mutating');
console.log('PASS trusted maintenance requires a green October run on the exact same SHA before staging mutation');
console.log('PASS self-trigger historical workflows are explicitly quarantined without editing them');
console.log('Secondary workflow runtime-freeze contract: PASS');
