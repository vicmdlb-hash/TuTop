import fs from 'node:fs';
import assert from 'node:assert/strict';

const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const staging = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const trusted = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const quality = fs.readFileSync('.github/workflows/quality.yml', 'utf8');
const firestore = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');
const october = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');

const assertManualOnly = (name, workflow) => {
  assert.match(workflow, /workflow_dispatch:/, `${name} debe conservar ejecución manual`);
  assert.doesNotMatch(workflow, /\n\s+push:/, `${name} no debe ejecutarse por push`);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/, `${name} no debe ejecutarse por PR mientras Actions está pausado`);
  assert.doesNotMatch(workflow, /\n\s+schedule:/, `${name} no debe consumir minutos por cron`);
};

assertManualOnly('Android', android);
assert.match(android, /retention-days: 90/);
assert.match(android, /gh release create/);
assert.match(android, /Require same-SHA green consolidated gate and real staging smoke/);
assert.match(android, /october-01-validation\.yml\/runs/);
assert.match(android, /staging-v2-smoke\.yml\/runs/);
assert.match(android, /physical-qa-staging\.metadata\.txt/);

assertManualOnly('staging real', staging);
assertManualOnly('Quality', quality);
assert.doesNotMatch(quality, /Firestore V2 emulator security/);
assertManualOnly('Firestore V2', firestore);
assert.match(firestore, /Firestore V2 emulator security/);
assertManualOnly('Trusted maintenance', trusted);

assertManualOnly('October consolidated gate', october);
assert.equal((october.match(/npm ci/g) || []).length, 1, 'October gate debe instalar dependencias de app una sola vez');
assert.match(october, /Static \+ build \+ Firestore emulator/);
assert.match(october, /npm run check/);
assert.match(october, /npm run typecheck/);
assert.match(october, /npm run build/);
assert.match(october, /emulators:exec --only firestore/);
assert.doesNotMatch(october, /upload-artifact/);

console.log('PASS all costly TuTop gates are manual-only while Actions is exhausted');
console.log('PASS no PR/push/cron trigger can burn the future 2,000-minute budget');
console.log('PASS October combines static, build and Firestore emulator work in one runner');
console.log('PASS October gate avoids redundant app installs and artifact uploads');
console.log('PASS V2 APK cannot promote before same-SHA October + real staging smoke and records metadata');
console.log('GitHub Actions budget policy: PASS');
