import fs from 'node:fs';
import assert from 'node:assert/strict';

const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const staging = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const trusted = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const quality = fs.readFileSync('.github/workflows/quality.yml', 'utf8');
const firestore = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');
const october = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const androidV2 = android.slice(android.indexOf('  android-v2-staging:'));

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

// The V2 Android job is downstream of the exact same SHA October + staging gates.
// Do not burn a second runner pass on static checks already proven by October.
for (const duplicate of [
  'npm run check',
  'npm run github:ready',
  'npm run beta:ready',
  'npm run v2:staging:readiness:test',
  'npm run v2:rules:prepare',
  'npm run native-security:test',
  'npm run account-erasure:test',
  'npm run typecheck',
]) {
  assert.equal(androidV2.includes(duplicate), false, `Android V2 no debe repetir ${duplicate}`);
}
assert.match(androidV2, /npm ci/);
assert.match(androidV2, /npm run build/);
assert.match(androidV2, /lintDebug testDebugUnitTest assembleDebug/);
assert.match(androidV2, /generate-physical-qa-candidate\.mjs/);
assert.match(androidV2, /verify-generated-physical-qa-candidate\.mjs/);

assertManualOnly('staging real', staging);
assertManualOnly('Quality', quality);
assert.doesNotMatch(quality, /Firestore V2 emulator security/);
assert.match(quality, /npm run check/);
assert.match(quality, /npm run build/);
assert.equal(quality.includes('npm run typecheck'), false, 'Quality no debe repetir typecheck antes del build');
for (const duplicate of [
  'npm run offline-reconnect:chaos:test',
  'npm run app-check:enforcement:test',
  'npm run account-recovery:local-sim:test',
  'npm run physical-qa:evidence:test',
]) {
  assert.equal(quality.includes(duplicate), false, `Quality no debe repetir ${duplicate}; npm run check ya lo cubre`);
}
assertManualOnly('Firestore V2', firestore);
assert.match(firestore, /Firestore V2 emulator security/);
assertManualOnly('Trusted maintenance', trusted);

assertManualOnly('October consolidated gate', october);
assert.equal((october.match(/npm ci/g) || []).length, 1, 'October gate debe instalar dependencias de app una sola vez');
assert.match(october, /Static \+ build \+ Firestore emulator/);
assert.match(october, /npm run check/);
assert.match(october, /npm run build/);
assert.equal(october.includes('npm run typecheck'), false, 'October no debe ejecutar typecheck dos veces');
assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
assert.equal(pkg.scripts.build, 'npm run typecheck && vite build');
assert.match(october, /Typecheck once and build web/);
assert.match(october, /emulators:exec --only firestore/);
assert.doesNotMatch(october, /upload-artifact/);

console.log('PASS all costly TuTop gates are manual-only while Actions is exhausted');
console.log('PASS no PR/push/cron trigger can burn the future 2,000-minute budget');
console.log('PASS October combines static, typecheck+build and Firestore emulator work in one runner');
console.log('PASS October and Quality perform TypeScript validation once through the canonical npm build command');
console.log('PASS Quality does not rerun exact offline/AppCheck/recovery/evidence tests already inside npm run check');
console.log('PASS October gate avoids redundant app installs and artifact uploads');
console.log('PASS Android V2 reuses same-SHA October evidence instead of repeating static/typecheck gates');
console.log('PASS Android V2 still performs the real web build, Android lint/tests/assemble and exact candidate verification');
console.log('PASS V2 APK cannot promote before same-SHA October + real staging smoke and records metadata');
console.log('GitHub Actions budget policy: PASS');
