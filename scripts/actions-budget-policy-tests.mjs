import fs from 'node:fs';
import assert from 'node:assert/strict';

const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const staging = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const trusted = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const quality = fs.readFileSync('.github/workflows/quality.yml', 'utf8');
const firestore = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');

const assertManualOnly = (name, workflow) => {
  assert.match(workflow, /workflow_dispatch:/, `${name} debe conservar ejecución manual`);
  assert.doesNotMatch(workflow, /\n\s+push:/, `${name} no debe ejecutarse por push`);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/, `${name} no debe ejecutarse por PR mientras Actions está pausado`);
};

assertManualOnly('Android', android);
assert.match(android, /retention-days: 90/);
assert.match(android, /gh release create/);

assertManualOnly('staging real', staging);
assertManualOnly('Quality', quality);
assert.doesNotMatch(quality, /Firestore V2 emulator security/);
assertManualOnly('Firestore V2', firestore);
assert.match(firestore, /Firestore V2 emulator security/);

assert.match(trusted, /workflow_dispatch:/);
assert.match(trusted, /cron: "17 \*\/6 \* \* \*"/);
assert.doesNotMatch(trusted, /\n\s+pull_request:/);
assert.doesNotMatch(trusted, /\n\s+push:/);

console.log('PASS Android, staging, Quality and Firestore are manual-only while Actions is exhausted');
console.log('PASS trusted maintenance is capped at four scheduled runs/day and is not PR-triggered');
console.log('PASS expensive gates remain available for explicit October validation');
console.log('GitHub Actions budget policy: PASS');
