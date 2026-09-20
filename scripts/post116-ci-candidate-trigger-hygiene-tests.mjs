import assert from 'node:assert/strict';
import fs from 'node:fs';

const historicalCandidates = [
  '.github/workflows/092-hosted-client-build.yml',
  '.github/workflows/092-release-candidate-v2.yml',
  '.github/workflows/107-engineering-candidate.yml',
  '.github/workflows/post106-engineering-candidate-build107.yml',
  '.github/workflows/build111-physical-repair.yml',
  '.github/workflows/build112-artifact-visual-repair.yml',
  '.github/workflows/build113-final-branding-crop.yml',
  '.github/workflows/build114-component-branding.yml',
  '.github/workflows/build115-component-mask-branding.yml',
  '.github/workflows/build116-deviceA-publication-repair.yml',
];

for (const path of historicalCandidates) {
  const workflow = fs.readFileSync(path, 'utf8');
  assert.match(workflow, /\non:\n\s+workflow_dispatch:/, `${path} must remain explicit/manual`);
  assert.doesNotMatch(workflow, /\n\s+push:/, `${path} must not restart from branch push/ref correction`);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/, `${path} must not create candidate noise from PR updates`);
  assert.doesNotMatch(workflow, /\n\s+schedule:/, `${path} must not create candidates from cron`);
  assert.match(workflow, /concurrency:/, `${path} must retain explicit concurrency policy`);
}

const retired = fs.readFileSync('.github/workflows/092-release-candidate.yml', 'utf8');
assert.match(retired, /workflow_dispatch:/);
assert.doesNotMatch(retired, /\n\s+push:/);

const budget = fs.readFileSync('scripts/actions-budget-policy-tests.mjs', 'utf8');
assert.match(budget, /assertManualOnly\('Android'/);
assert.match(budget, /assertManualOnly\('staging real'/);
assert.match(budget, /assertManualOnly\('Quality'/);
assert.match(budget, /assertManualOnly\('Firestore V2'/);
assert.match(budget, /assertManualOnly\('Trusted maintenance'/);
assert.match(budget, /assertManualOnly\('October consolidated gate'/);

console.log('PASS historical candidate trigger hygiene: build107/build111-116 and 0.9.2 candidates are manual-only; modern costly gates remain manual-only too');
