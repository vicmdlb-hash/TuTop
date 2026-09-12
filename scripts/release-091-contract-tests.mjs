import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('src/main.tsx');
const theme = read('src/lib/theme091.ts');
const appearance = read('src/components/AppearanceSettings.tsx');
const brand = read('src/brand091.css');
const android = read('.github/workflows/android-debug-apk.yml');
const october = read('.github/workflows/october-01-validation.yml');
const staging = read('.github/workflows/staging-v2-smoke.yml');
const quality = read('.github/workflows/quality.yml');
const guard = read('scripts/staging-freeze-guard.mjs');
const versioner = read('scripts/configure-android-beta-version.mjs');
const generator = read('scripts/generate-physical-qa-candidate.mjs');
const oldCandidate = JSON.parse(read('docs/PHYSICAL_QA_CANDIDATE_0.9.json'));

assert.equal(pkg.version, '0.9.1-beta.0');
assert.match(main, /initializeTheme091\(\)/);
assert.match(main, /import '\.\/brand091\.css'/);
assert.match(theme, /ThemePreference = 'light' \| 'dark' \| 'system'/);
assert.match(theme, /return value === 'dark' \|\| value === 'system' \|\| value === 'light' \? value : 'light'/);
assert.match(appearance, /Blanco \+ morado/);
assert.match(appearance, /Negro \+ morado/);
assert.match(brand, /html\[data-theme="light"\]/);
assert.match(brand, /html\[data-theme="dark"\]/);

for (const source of [quality, october, staging, android, guard]) {
  assert.match(source, /feat\/tutop-0\.9\.1-nearby-topi/);
}
assert.doesNotMatch(android, /feat\/tutop-0\.8-p0/);
assert.match(android, /TUTOP_BETA_VERSION: 0\.9\.1-beta\.0/);
assert.match(android, /TUTOP_ANDROID_VERSION_CODE: 90100/);
assert.match(android, /PHYSICAL_QA_CANDIDATE_0\.9\.1\.generated\.json/);
assert.doesNotMatch(android, /TuTop-0\.9\.0-beta\.0-physical-qa/);
assert.match(versioner, /0\.9\.1-beta/);
assert.match(versioner, /90100/);
assert.match(generator, /0\.9\.1-beta/);
assert.match(generator, /PHYSICAL_QA_CANDIDATE_0\.9\.1\.generated\.json/);

// APK28 remains historical 0.9.0 evidence. 0.9.1 must never mutate or reuse it as its candidate.
assert.equal(oldCandidate.app_version, '0.9.0-beta.0');
assert.equal(oldCandidate.artifact_id, 10292454237);
assert.equal(oldCandidate.apk_sha256, '2131007fb944b144d85eb8c5deb9ad80f93bd20c1515b7793f89278cd1a9f7e3');
assert.doesNotMatch(android, /PHYSICAL_QA_CANDIDATE_0\.9\.json/);

console.log('PASS TuTop 0.9.1 version and Android 90100 identity are isolated from APK28');
console.log('PASS white-purple default, black-purple dark and system theme are wired before App render');
console.log('PASS Quality, October, Staging and Android gates target the 0.9.1 branch');
console.log('TuTop 0.9.1 release/theme isolation contract: PASS');
