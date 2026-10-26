import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => read(path).replace(/\r\n/g, '\n');

const manualHistoricalCandidates = [
  '.github/workflows/092-hosted-client-build.yml',
  '.github/workflows/092-release-candidate-v2.yml',
  '.github/workflows/107-engineering-candidate.yml',
  '.github/workflows/post106-engineering-candidate-build107.yml',
  '.github/workflows/build111-physical-repair.yml',
  '.github/workflows/build112-artifact-visual-repair.yml',
  '.github/workflows/build113-final-branding-crop.yml',
  '.github/workflows/build114-component-branding.yml',
];

for (const path of manualHistoricalCandidates) {
  const workflow = read(path);
  assert.match(workflow, /\non:\n\s+workflow_dispatch:/, path + ' must remain explicit/manual');
  assert.doesNotMatch(workflow, /\n\s+push:/, path + ' must not restart from branch push/ref correction');
  assert.doesNotMatch(workflow, /\n\s+pull_request:/, path + ' must not create candidate noise from PR updates');
  assert.doesNotMatch(workflow, /\n\s+schedule:/, path + ' must not create candidates from cron');
  assert.match(workflow, /concurrency:/, path + ' must retain explicit concurrency policy');
}

const retiredCandidates = new Map([
  ['.github/workflows/build115-component-mask-branding.yml', 'candidate'],
  ['.github/workflows/build116-deviceA-publication-repair.yml', 'candidate'],
  ['.github/workflows/build118-deviceA-physical-repair-source.yml', 'validate-source-repair'],
  ['.github/workflows/build118-publication-preflight.yml', 'validate'],
  ['.github/workflows/build118-publication-self-heal.yml', 'validate-and-build'],
  ['.github/workflows/build118-staging-native-key-repair.yml', 'repair'],
  ['.github/workflows/build120-deviceA-publication-repair.yml', 'validate-and-build'],
  ['.github/workflows/candidate120-hosting-prepare.yml', 'prepare'],
]);

for (const [path, job] of retiredCandidates) {
  const workflow = read(path);
  assert.match(workflow, /^# RETIRED:/, path + ' must carry an explicit retirement marker');
  assert.match(workflow, /^name: RETIRED — /m, path + ' must display retired status');
  assert.match(workflow, /\non:\n\s+workflow_dispatch:\n\npermissions:/, path + ' must be manual-only');
  assert.doesNotMatch(workflow, /\n\s+push:/, path + ' must not react to pushes');
  assert.doesNotMatch(workflow, /\n\s+pull_request:/, path + ' must not react to pull requests');
  assert.doesNotMatch(workflow, /\n\s+schedule:/, path + ' must not react to schedules');
  const hardDisabled = '  ' + job + ':\n    # Historical candidate retained for audit only. Hard-disabled.\n    if: ${{ false }}';
  assert.ok(workflow.includes(hardDisabled), path + ' job must be hard-disabled');
}

const retired = read('.github/workflows/092-release-candidate.yml');
assert.match(retired, /workflow_dispatch:/);
assert.doesNotMatch(retired, /\n\s+push:/);

const budget = read('scripts/actions-budget-policy-tests.mjs');
assert.match(budget, /assertManualOnly\('Android'/);
assert.match(budget, /assertManualOnly\('staging real'/);
assert.match(budget, /assertManualOnly\('Quality'/);
assert.match(budget, /assertManualOnly\('Firestore V2'/);
assert.match(budget, /assertManualOnly\('Trusted maintenance'/);
assert.match(budget, /assertManualOnly\('October consolidated gate'/);

console.log('PASS historical Build115/116/118/120 candidate workflows are manual-only and hard-disabled');
