import fs from 'node:fs';
import assert from 'node:assert/strict';

const manifest = JSON.parse(fs.readFileSync('docs/RUNTIME_FREEZE_CANDIDATE_0.9.json', 'utf8'));
const dossier = fs.readFileSync('docs/GATE_EXECUTION_DOSSIER_0.9.md', 'utf8');
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

for (const [name, workflow] of [
  ['quality', quality],
  ['firestore-v2-security', firestore],
  ['ci-auth-parallel-validation', ciAuth],
]) {
  assert.doesNotMatch(workflow, /firebase:deploy:staging|--apply|projects:create|firestore:databases:create|v2:catalog:seed|gh release create/, `${name} must remain diagnostic-only`);
}

assert.equal(manifest.secondary_workflow_policy.trusted_staging_mutation.requires_october_same_sha_green, true);
assert.equal(manifest.secondary_workflow_policy.trusted_staging_mutation.requires_staging_same_sha_green, true);
assert.match(trusted, /actions: read/);
assert.match(trusted, /if: github\.ref_name == 'feat\/tutop-0\.8-p0'/);
assert.match(trusted, /october-01-validation\.yml\/runs/);
assert.match(trusted, /staging-v2-smoke\.yml\/runs/);
assert.equal((trusted.match(/head_sha="\$GITHUB_SHA"/g) || []).length >= 2, true);
assert.match(trusted, /DETENIDO: trusted maintenance requiere october-01-validation exitoso sobre el mismo SHA/);
assert.match(trusted, /DETENIDO: trusted maintenance requiere staging-v2-smoke exitoso sobre el mismo SHA/);
const trustedGate = trusted.indexOf('Require same-SHA green October and staging before trusted mutation');
const firstTrustedMutation = trusted.indexOf('Expire reservations and repair completed listings');
assert(trustedGate >= 0 && firstTrustedMutation > trustedGate, 'October + staging gate must precede any trusted staging mutation');

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

assert.match(dossier, /no editar ni ejecutar `one-shot-085-hardened\.yml` ni `provision-firebase-staging-v2\.yml`/);
assert.match(dossier, /trusted maintenance sólo puede mutar staging después de October \+ staging green sobre el mismo SHA/i);

console.log('PASS diagnostic secondary workflows are manual-only and non-mutating');
console.log('PASS trusted maintenance requires green October + deployed staging on the exact same SHA before mutation');
console.log('PASS self-trigger historical workflows are explicitly quarantined without editing them');
console.log('Secondary workflow runtime-freeze contract: PASS');
