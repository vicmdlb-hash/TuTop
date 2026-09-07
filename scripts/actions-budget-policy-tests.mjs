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
  assert.doesNotMatch(workflow, /\n\s+schedule:/, `${name} no debe consumir minutos por cron`);
};

assertManualOnly('Android', android);
assert.match(android, /retention-days: 90/);
assert.match(android, /gh release create/);

assertManualOnly('staging real', staging);
assertManualOnly('Quality', quality);
assert.doesNotMatch(quality, /Firestore V2 emulator security/);
assertManualOnly('Firestore V2', firestore);
assert.match(firestore, /Firestore V2 emulator security/);
assertManualOnly('Trusted maintenance', trusted);

console.log('PASS all costly TuTop gates are manual-only while Actions is exhausted');
console.log('PASS no PR/push/cron trigger can burn the future 2,000-minute budget');
console.log('PASS expensive gates remain available for explicit October validation');
console.log('GitHub Actions budget policy: PASS');
